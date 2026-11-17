import { NextFunction, Request, Response, Router } from "express";
import { getDatabase } from "../integrations/firebase_admin";
import { AccountAdmin, AccountLabel } from "../services/account_service";
import { ReviewService } from "../services/review_service";
import { OrderStore } from "../orders/order_store";
import { AdminOrder } from "../orders/order_model";
import { AuditLog } from "./audit_log";
import { currentStaff, requirePermission } from "./admin_auth";

/**
 * Customers in the admin dashboard. A customer is either an account (with
 * every email it has used) or a guest, known only by the email on their
 * orders. Keys: "acct_<accountId>" or "email_<base64url email>".
 *
 * The list is built from all accounts plus a lightweight read of every order;
 * fine at today's volume. When it isn't, keep a customers/{key} summary
 * updated by an orders trigger instead.
 */
type Handler = (req: Request, res: Response) => Promise<void>;
const route = (handler: Handler) => (req: Request, res: Response, next: NextFunction) =>
  handler(req, res).catch(next);
const fail = (res: Response, status: number, error: string) => {
  res.status(status).json({ error });
};

const LABELS: AccountLabel[] = ["consumer", "partner", "wholesale"];

export interface CustomerSummary {
  key: string;
  accountId: string | null;
  name: string;
  email: string;
  phone: string | null;
  label: AccountLabel | null;
  emailVerified: boolean | null;
  orderCount: number;
  // Dollars paid less refunds.
  totalSpent: number;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
}

const emailKey = (email: string) => `email_${Buffer.from(email).toString("base64url")}`;
const parseKey = (key: string): { accountId: string } | { email: string } | null => {
  if (key.startsWith("acct_")) return { accountId: key.slice(5) };
  if (key.startsWith("email_")) {
    const email = Buffer.from(key.slice(6), "base64url").toString("utf8").trim().toLowerCase();
    return email.includes("@") ? { email } : null;
  }
  return null;
};

interface OrderLite {
  email: string;
  name: string;
  phone: string | null;
  total: number;
  refunded: number;
  createdAt: string;
  paid: boolean;
}

// The list reads every order; a short cache keeps tab switching and typing quick.
let cache: { at: number; customers: CustomerSummary[] } | null = null;
const CACHE_MS = 60 * 1000;

const buildCustomers = async (): Promise<CustomerSummary[]> => {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.customers;
  const [accounts, orderSnapshot] = await Promise.all([
    AccountAdmin.list(),
    getDatabase().collection("orders")
      .select("emailNormalized", "email", "customerName", "phone", "totalAmount", "refundedAmount", "createdAt", "paymentStatus", "status")
      .get(),
  ]);

  const ordersByEmail = new Map<string, OrderLite[]>();
  for (const doc of orderSnapshot.docs) {
    const data = doc.data();
    const email = String(data.emailNormalized || data.email || "").trim().toLowerCase();
    if (!email) continue;
    const list = ordersByEmail.get(email) || [];
    list.push({
      email,
      name: data.customerName || "",
      phone: data.phone || null,
      total: Number(data.totalAmount) || 0,
      refunded: Number(data.refundedAmount) || 0,
      createdAt: data.createdAt || "",
      paid: data.paymentStatus ? data.paymentStatus !== "pending" : data.status !== "pending",
    });
    ordersByEmail.set(email, list);
  }

  const summarize = (orders: OrderLite[]) => {
    const dates = orders.map((order) => order.createdAt).filter(Boolean).sort();
    return {
      orderCount: orders.length,
      totalSpent: Math.round(orders.filter((order) => order.paid).reduce((sum, order) => sum + order.total - order.refunded, 0) * 100) / 100,
      firstOrderAt: dates[0] || null,
      lastOrderAt: dates[dates.length - 1] || null,
    };
  };

  const claimed = new Set<string>();
  const customers: CustomerSummary[] = accounts.map((account) => {
    const orders = account.emails.flatMap((email) => ordersByEmail.get(email) || []);
    account.emails.forEach((email) => claimed.add(email));
    return {
      key: `acct_${account.id}`,
      accountId: account.id,
      name: account.name || orders[0]?.name || "",
      email: account.email,
      phone: account.phone || orders.find((order) => order.phone)?.phone || null,
      label: account.label,
      emailVerified: account.emailVerified,
      ...summarize(orders),
    };
  });
  for (const [email, orders] of ordersByEmail) {
    if (claimed.has(email)) continue;
    const latest = [...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    customers.push({
      key: emailKey(email),
      accountId: null,
      name: latest?.name || "",
      email,
      phone: orders.find((order) => order.phone)?.phone || null,
      label: null,
      emailVerified: null,
      ...summarize(orders),
    });
  }
  customers.sort((a, b) => (b.lastOrderAt || "").localeCompare(a.lastOrderAt || ""));
  cache = { at: Date.now(), customers };
  return customers;
};

export const customersRouter = Router();

customersRouter.get("/", requirePermission("customers.read"), route(async (req, res) => {
  const all = await buildCustomers();
  const q = String(req.query.q || "").trim().toLowerCase();
  const kind = String(req.query.kind || "all");
  const filtered = all.filter((customer) => {
    if (kind === "accounts" && !customer.accountId) return false;
    if (kind === "guests" && customer.accountId) return false;
    if (kind === "partners" && customer.label !== "partner" && customer.label !== "wholesale") return false;
    if (kind === "repeat" && customer.orderCount < 2) return false;
    if (!q) return true;
    return [customer.name, customer.email, customer.phone || ""].some((value) => value.toLowerCase().includes(q));
  });
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  res.json({
    customers: filtered.slice(offset, offset + limit),
    total: filtered.length,
    counts: {
      all: all.length,
      accounts: all.filter((customer) => customer.accountId).length,
      guests: all.filter((customer) => !customer.accountId).length,
      partners: all.filter((customer) => customer.label === "partner" || customer.label === "wholesale").length,
      repeat: all.filter((customer) => customer.orderCount >= 2).length,
    },
  });
}));

const notes = (key: string) => getDatabase().collection("customer_notes").doc(key).collection("notes");

const loadCustomer = async (key: string) => {
  const parsed = parseKey(key);
  if (!parsed) return null;
  if ("accountId" in parsed) {
    const account = await AccountAdmin.details(parsed.accountId);
    if (!account) return null;
    const orders = await OrderStore.forEmails(account.emails);
    return { key, account, emails: account.emails, orders };
  }
  const orders = await OrderStore.forEmails([parsed.email]);
  if (!orders.length) return null;
  return {
    key,
    account: null,
    emails: [parsed.email],
    orders,
    reviewEmails: !(await ReviewService.isOptedOut([parsed.email])),
  };
};

const orderSummary = (order: AdminOrder) => ({
  id: order.id,
  createdAt: order.createdAt,
  totalAmount: order.totalAmount,
  refundedAmount: order.refundedAmount || 0,
  paymentStatus: order.paymentStatus,
  fulfillmentStatus: order.fulfillmentStatus,
  itemsSummary: order.itemsSummary,
  isLocalPickup: order.isLocalPickup,
  discountCode: order.discountCode,
});

customersRouter.get("/:key", requirePermission("customers.read"), route(async (req, res) => {
  const customer = await loadCustomer(req.params.key);
  if (!customer) return fail(res, 404, "No customer found.");
  const latest = customer.orders[0];
  const noteSnapshot = await notes(customer.key).orderBy("at", "desc").limit(100).get();
  const paid = customer.orders.filter((order) => order.paymentStatus !== "pending");
  res.json({
    key: customer.key,
    name: customer.account
      ? `${customer.account.profile.user.firstName} ${customer.account.profile.user.lastName}`.trim()
      : latest?.customerName || "",
    email: customer.emails[0],
    emails: customer.emails,
    phone: customer.account?.phone || customer.orders.find((order) => order.phone)?.phone || null,
    account: customer.account && {
      id: customer.account.profile.id,
      username: customer.account.profile.username,
      label: customer.account.profile.label,
      emailVerified: customer.account.profile.emailVerified,
      pendingEmail: customer.account.profile.pendingEmail || null,
      addresses: customer.account.addresses,
      stripeCustomerId: customer.account.stripeCustomerId,
      hasSavedCard: customer.account.hasSavedCard,
      subscriptions: customer.account.subscriptions,
    },
    lastShippingAddress: customer.orders.find((order) => order.shippingAddress)?.shippingAddress || null,
    preferences: customer.account
      ? customer.account.preferences
      : { reviewRequests: (customer as { reviewEmails?: boolean }).reviewEmails ?? true, newsletters: null },
    stats: {
      orderCount: customer.orders.length,
      totalSpent: Math.round(paid.reduce((sum, order) => sum + order.totalAmount - (order.refundedAmount || 0), 0) * 100) / 100,
      averageOrder: paid.length ? Math.round((paid.reduce((sum, order) => sum + order.totalAmount, 0) / paid.length) * 100) / 100 : 0,
      firstOrderAt: customer.orders[customer.orders.length - 1]?.createdAt || null,
      lastOrderAt: latest?.createdAt || null,
      discountCodesUsed: [...new Set(customer.orders.map((order) => order.discountCode).filter(Boolean))],
    },
    orders: customer.orders.map(orderSummary),
    notes: noteSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
  });
}));

customersRouter.post("/:key/notes", requirePermission("customers.edit"), route(async (req, res) => {
  const message = String(req.body?.message || "").trim();
  if (!message) return fail(res, 400, "Write a note first.");
  if (message.length > 4000) return fail(res, 400, "Keep notes under 4,000 characters.");
  if (!parseKey(req.params.key)) return fail(res, 404, "No customer found.");
  const staff = currentStaff(res);
  const ref = notes(req.params.key).doc();
  const note = { at: new Date().toISOString(), actor: { email: staff.email, name: staff.name }, message };
  await ref.set(note);
  await AuditLog.record(staff, { action: "customer.note", target: { type: "customer", id: req.params.key }, after: { message } });
  res.status(201).json({ note: { id: ref.id, ...note } });
}));

customersRouter.post("/:key/review-emails", requirePermission("customers.edit"), route(async (req, res) => {
  const customer = await loadCustomer(req.params.key);
  if (!customer) return fail(res, 404, "No customer found.");
  const enabled = req.body?.enabled === true;
  await ReviewService.setOptedOut(customer.emails, !enabled, "admin");
  await AuditLog.record(currentStaff(res), {
    action: enabled ? "customer.review_emails_on" : "customer.review_emails_off",
    target: { type: "customer", id: customer.key },
  });
  res.json({ reviewRequests: enabled });
}));

customersRouter.post("/:key/resend-verification", requirePermission("customers.edit"), route(async (req, res) => {
  const parsed = parseKey(req.params.key);
  if (!parsed || !("accountId" in parsed)) return fail(res, 400, "Only accounts have a confirmation email.");
  const result = await AccountAdmin.resendVerification(parsed.accountId);
  if (result === null) return fail(res, 400, "This account's email is already confirmed.");
  if (result === false) return fail(res, 429, "A confirmation email went out less than a minute ago.");
  await AuditLog.record(currentStaff(res), {
    action: "customer.resend_verification",
    target: { type: "customer", id: req.params.key },
    after: result,
  });
  res.json(result);
}));

// Partner and wholesale accounts get partner pricing, so only Admins and Owners change it.
customersRouter.post("/:key/label", requirePermission("settings.edit"), route(async (req, res) => {
  const parsed = parseKey(req.params.key);
  if (!parsed || !("accountId" in parsed)) return fail(res, 400, "Only accounts have a type.");
  const label = req.body?.label as AccountLabel;
  if (!LABELS.includes(label)) return fail(res, 400, "Choose consumer, partner or wholesale.");
  const before = await AccountAdmin.details(parsed.accountId);
  if (!before) return fail(res, 404, "No customer found.");
  await AccountAdmin.setLabel(parsed.accountId, label);
  cache = null;
  await AuditLog.record(currentStaff(res), {
    action: "customer.label",
    target: { type: "customer", id: req.params.key },
    before: { label: before.profile.label },
    after: { label },
  });
  res.json({ label });
}));
