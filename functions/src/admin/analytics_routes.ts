import { createHash } from "crypto";
import { NextFunction, Request, Response, Router } from "express";
import { getDatabase } from "../integrations/firebase_admin";
import { requirePermission } from "./admin_auth";
import type { AdminOrder, FulfillmentStatus, PaymentStatus } from "../orders/order_model";

/**
 * Order data for the dashboard's charts (Home and Analytics). The dashboard
 * does the bucketing and the comparisons, so switching day/week/month or
 * hovering costs no extra request.
 *
 * Mirrored in koinonia_dashboard/src/pages/analytics/types.ts.
 */
type Handler = (req: Request, res: Response) => Promise<void>;
const route = (handler: Handler) => (req: Request, res: Response, next: NextFunction) =>
  handler(req, res).catch(next);

export interface AnalyticsOrderItem {
  name: string;
  sku: string;
  quantity: number;
  // Not recorded on Notion-era orders.
  price: number | null;
}

export interface AnalyticsOrder {
  id: string;
  createdAt: string;
  // Dollars charged, and refunded so far.
  total: number;
  refunded: number;
  payment: Exclude<PaymentStatus, "pending">;
  fulfillment: FulfillmentStatus;
  discountCode: string | null;
  pickup: boolean;
  // What the shipping label cost us, if one was bought.
  labelCost: number | null;
  // Entered by hand in the dashboard (cash, Venmo, invoice...).
  manual: boolean;
  // An opaque id for the customer, so the charts can count people without their emails.
  customer: string;
  // The customer had a paid order before this one.
  returning: boolean;
  items: AnalyticsOrderItem[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
// Enough for "last 12 months" compared with the year before.
const MAX_RANGE_DAYS = 800;

const FIELDS = [
  "createdAt", "status", "paymentStatus", "fulfillmentStatus", "totalAmount", "refundedAmount",
  "discountCode", "isLocalPickup", "shippingLabelPrice", "paymentMethod", "email", "emailNormalized",
  "accountId", "items",
];

const paymentOf = (data: Partial<AdminOrder>): PaymentStatus =>
  data.paymentStatus ?? (data.status === "completed" ? "paid" : data.status === "canceled" ? "refunded" : "pending");

const customerOf = (data: Partial<AdminOrder>, id: string): string => {
  const who = data.accountId ? `acct:${data.accountId}`
    : (data.emailNormalized || data.email || "").trim().toLowerCase() || `order:${id}`;
  return createHash("sha256").update(who).digest("base64url").slice(0, 12);
};

const parseTime = (value: unknown): number | null => {
  if (typeof value !== "string") return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
};

export const analyticsRouter = Router();

/** GET /analytics/orders?start=<ISO>&end=<ISO>: paid orders created in [start, end). */
analyticsRouter.get("/orders", requirePermission("analytics.read"), route(async (req, res) => {
  const start = parseTime(req.query.start);
  const end = parseTime(req.query.end);
  if (start === null || end === null || end <= start) {
    res.status(400).json({ error: "start and end must be ISO times, with end after start." });
    return;
  }
  if (end - start > MAX_RANGE_DAYS * DAY_MS) {
    res.status(400).json({ error: `Pick a range of ${MAX_RANGE_DAYS} days or less.` });
    return;
  }

  // Reads every order (just these fields) so "returning" can look back past the
  // range. createdAt is filtered here rather than in the query because older
  // imports don't all write it in the same ISO format. Fine at current volume;
  // move to a daily rollup if orders reach the tens of thousands.
  const snapshot = await getDatabase().collection("orders").select(...FIELDS).get();
  const all = snapshot.docs
    .map((doc) => ({ id: doc.id, data: doc.data() as Partial<AdminOrder>, time: parseTime(doc.get("createdAt")) }))
    .filter((row): row is typeof row & { time: number } => row.time !== null && row.time < end)
    .sort((a, b) => a.time - b.time);

  const seen = new Set<string>();
  const orders: AnalyticsOrder[] = [];
  for (const { id, data, time } of all) {
    const payment = paymentOf(data);
    if (payment === "pending") continue; // unpaid: not a sale yet
    const customer = customerOf(data, id);
    const returning = seen.has(customer);
    seen.add(customer);
    if (time < start) continue;

    const total = Number(data.totalAmount) || 0;
    orders.push({
      id,
      createdAt: new Date(time).toISOString(),
      total,
      refunded: payment === "refunded" ? Math.max(Number(data.refundedAmount) || 0, total) : Number(data.refundedAmount) || 0,
      payment,
      fulfillment: data.fulfillmentStatus ?? "pending",
      discountCode: data.discountCode ? String(data.discountCode).toUpperCase() : null,
      pickup: Boolean(data.isLocalPickup),
      labelCost: typeof data.shippingLabelPrice === "number" ? data.shippingLabelPrice : null,
      manual: Boolean(data.paymentMethod),
      customer,
      returning,
      items: (data.items ?? []).map((item) => ({
        name: String(item.name ?? ""),
        sku: String(item.sku ?? ""),
        quantity: Number(item.quantity) || 0,
        price: typeof item.price === "number" ? item.price : null,
      })),
    });
  }

  res.json({ orders, generatedAt: new Date().toISOString() });
}));
