import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { getFirestore } from "firebase-admin/firestore";
import { getApps, initializeApp } from "firebase-admin/app";
import { Client } from "@notionhq/client";
import Stripe from "stripe";
import { Request, Response } from "express";
import { createLogger } from "../logger";
import { Address, fetchShippingRates } from "./easypost_service";

const logger = createLogger("accounts");
const scrypt = promisify(scryptCallback);
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
// Used only when the Notion calendar is not configured during local setup.
const FALLBACK_ROAST_SESSION_CALENDAR = [
  "2026-09-01T09:00:00-07:00",
] as const;
export const INITIAL_ROAST_DATE = FALLBACK_ROAST_SESSION_CALENDAR[0];
const ROAST_CALENDAR_CACHE_DURATION_MS = 5 * 60 * 1000;
let roastCalendarCache: { dates: string[]; expiresAt: number } | null = null;

const database = () => {
  // A trigger can run in an execution context where a named Admin app already
  // exists, but the default app does not. Resolve the default app explicitly.
  const defaultApp = getApps().find((app) => app.name === "[DEFAULT]") || initializeApp();
  return getFirestore(defaultApp);
};

let stripeInstance: Stripe | null = null;
const getStripe = (): Stripe => {
  if (!stripeInstance) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
    stripeInstance = new Stripe(key, { apiVersion: "2025-02-24.acacia" });
  }
  return stripeInstance;
};

export interface AccountProfile {
  id: string;
  user: { firstName: string; lastName: string; email: string };
  username: string;
}

interface StoredAccount extends AccountProfile {
  passwordHash: string;
}

interface ShippingAddressData {
  line1: string;
  line2: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
}

interface Order {
  id: string;
  accountId: string;
  totalAmount: number;
  createdAt: string;
  status: "pending" | "completed" | "canceled";
}

type SubscriptionPlan =
  | "one-bag-every-session"
  | "two-bags-every-session"
  | "one-bag-every-other-session"
  | "two-bags-every-other-session";

interface Subscription {
  id: string;
  plan: SubscriptionPlan;
  bagCount: 1 | 2;
  cadence: "every-session" | "every-other-session";
  itemSku: string;
  itemName: string;
  weight: string;
  unitAmount: number;
  discountPercent: 5;
  freeShipping: boolean;
  nextEligibleSession: number | null;
  status: "active" | "paused" | "canceled";
  skipNextDelivery: boolean;
  createdAt: string;
  nextEligibleRoastAt: string;
}

const subscriptionPlans: Record<SubscriptionPlan, Pick<Subscription, "bagCount" | "cadence" | "freeShipping">> = {
  "one-bag-every-session": { bagCount: 1, cadence: "every-session", freeShipping: false },
  "two-bags-every-session": { bagCount: 2, cadence: "every-session", freeShipping: true },
  "one-bag-every-other-session": { bagCount: 1, cadence: "every-other-session", freeShipping: false },
  "two-bags-every-other-session": { bagCount: 2, cadence: "every-other-session", freeShipping: true },
};

const roastCalendarDatabaseId = (): string | null => process.env.NOTION_ROAST_DATES_DATABASE_ID || null;

const normalizeRoastDate = (value: string): string | null => {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T09:00:00-07:00`;
  return Number.isNaN(Date.parse(value)) ? null : value;
};

export const getRoastSessionCalendar = async (): Promise<string[]> => {
  if (roastCalendarCache && roastCalendarCache.expiresAt > Date.now()) return roastCalendarCache.dates;
  const databaseId = roastCalendarDatabaseId();
  if (!databaseId) {
    logger.warn("NOTION_ROAST_DATES_DATABASE_ID is not configured; using the local fallback roast date");
    return [...FALLBACK_ROAST_SESSION_CALENDAR];
  }
  const response = await getNotion().databases.query({
    database_id: databaseId,
    sorts: [{ property: "Date", direction: "ascending" }],
  });
  const dates = response.results
    .map((page: any) => normalizeRoastDate(page.properties?.Date?.date?.start || ""))
    .filter((date: string | null): date is string => !!date)
    .sort((first, second) => Date.parse(first) - Date.parse(second));
  if (!dates.length) throw new Error("The Notion roast-date calendar has no valid Date values");
  roastCalendarCache = { dates, expiresAt: Date.now() + ROAST_CALENDAR_CACHE_DURATION_MS };
  return dates;
};

export const nextRoastSessionDate = async (
  currentRoastDate: string,
  cadence: Subscription["cadence"],
): Promise<string | null> => {
  const calendar = await getRoastSessionCalendar();
  const currentIndex = calendar.findIndex((date) => date === currentRoastDate);
  if (currentIndex < 0) return null;
  const sessionsToAdvance = cadence === "every-session" ? 1 : 2;
  return calendar[currentIndex + sessionsToAdvance] || null;
};

export const nextUpcomingRoastSessionDate = async (): Promise<string> => {
  const calendar = await getRoastSessionCalendar();
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const nextDate = calendar.find((date) => date.slice(0, 10) >= today);
  if (!nextDate) throw new Error("The Notion roast-date calendar has no upcoming dates");
  return nextDate;
};

let notionInstance: Client | null = null;

const getNotion = (): Client => {
  if (!notionInstance) {
    const token = process.env.NOTION_TOKEN;
    if (!token) throw new Error("NOTION_TOKEN is not configured");
    notionInstance = new Client({ auth: token });
  }
  return notionInstance;
};

const subscriptionMirrorDatabaseId = (): string | null =>
  process.env.NOTION_SUBSCRIPTIONS_DATABASE_ID || null;

const normalizedShippingAddress = (value: unknown): ShippingAddressData | null => {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const line1 = String(input.line1 || "").trim().slice(0, 200);
  const city = String(input.city || "").trim().slice(0, 100);
  const state = String(input.state || "").trim().slice(0, 100);
  const postalCode = String(input.postal_code || "").trim().slice(0, 24);
  const country = String(input.country || "US").trim().toUpperCase().slice(0, 2);
  if (!line1 || !city || !state || !postalCode || !country) return null;
  return { line1, line2: String(input.line2 || "").trim().slice(0, 200), city, state, postal_code: postalCode, country };
};

const text = (property: any): string => {
  if (!property) return "";
  if (property.type === "email") return property.email || "";
  if (property.type === "title") return property.title?.map((value: any) => value.plain_text).join("") || "";
  return property.rich_text?.map((value: any) => value.plain_text).join("") || "";
};

const status = (property: any): Order["status"] => {
  const value = (property?.status?.name || property?.select?.name || "").toLowerCase();
  if (["paid", "completed", "delivered", "shipped"].includes(value)) return "completed";
  if (["cancelled", "canceled", "refunded"].includes(value)) return "canceled";
  return "pending";
};

const createPasswordHash = async (password: string): Promise<string> => {
  const salt = randomBytes(16).toString("hex");
  const hash = await scrypt(password, salt, 64) as Buffer;
  return `scrypt:${salt}:${hash.toString("hex")}`;
};

const passwordMatches = async (password: string, storedHash: string): Promise<boolean> => {
  const [algorithm, salt, expected] = storedHash.split(":");
  if (algorithm !== "scrypt" || !salt || !expected) return false;
  const actual = await scrypt(password, salt, 64) as Buffer;
  const expectedBuffer = Buffer.from(expected, "hex");
  return expectedBuffer.length === actual.length && timingSafeEqual(expectedBuffer, actual);
};

const findAccount = async (username: string): Promise<StoredAccount | null> => {
  const usernameKey = Buffer.from(username.trim().toLowerCase()).toString("base64url");
  const usernameRecord = await database().collection("account_usernames").doc(usernameKey).get();
  const accountId = usernameRecord.data()?.accountId;
  if (!usernameRecord.exists || typeof accountId !== "string") return null;
  const account = await database().collection("accounts").doc(accountId).get();
  return account.exists ? account.data() as StoredAccount : null;
};

const publicProfile = (account: StoredAccount): AccountProfile => ({
  id: account.id,
  user: account.user,
  username: account.username,
});

const issueSession = async (account: StoredAccount): Promise<string> => {
  const token = randomBytes(32).toString("base64url");
  await database().collection("account_sessions").doc(token).set({
    accountId: account.id,
    expiresAt: Date.now() + SESSION_DURATION_MS,
  });
  return token;
};

export const sessionAccount = async (req: Request): Promise<AccountProfile | null> => {
  const token = req.header("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const session = await database().collection("account_sessions").doc(token).get();
  const data = session.data();
  if (!session.exists || !data || data.expiresAt < Date.now()) {
    if (session.exists) await session.ref.delete();
    return null;
  }
  const account = await database().collection("accounts").doc(data.accountId).get();
  const accountData = account.data() as StoredAccount | undefined;
  if (!accountData) return null;
  return publicProfile(accountData);
};

type StoredSubscription = Subscription & { accountId: string };

const accountSubscription = (accountId: string, subscriptionId: string) =>
  database().collection("account_subscriptions").doc(subscriptionId).get()
    .then((snapshot) => snapshot.exists && snapshot.data()?.accountId === accountId ? snapshot : null);

const syncSubscriptionMirror = async (subscription: StoredSubscription, account: AccountProfile): Promise<void> => {
  const databaseId = subscriptionMirrorDatabaseId();
  if (!databaseId) {
    throw new Error("NOTION_SUBSCRIPTIONS_DATABASE_ID is not configured");
  }

  try {
    const notion = getNotion();
    const properties = {
      "Name": { title: [{ text: { content: `${account.user.firstName} ${account.user.lastName}`.trim() } }] },
      "Subscription ID": { rich_text: [{ text: { content: subscription.id } }] },
      "Account ID": { rich_text: [{ text: { content: subscription.accountId } }] },
      "Plan": { rich_text: [{ text: { content: subscription.plan } }] },
      "Bag Count": { number: subscription.bagCount },
      "Cadence": { rich_text: [{ text: { content: subscription.cadence } }] },
      "Item SKU": { rich_text: [{ text: { content: subscription.itemSku } }] },
      "Item Name": { rich_text: [{ text: { content: subscription.itemName } }] },
      "Weight": { rich_text: [{ text: { content: subscription.weight } }] },
      "Discount Percent": { number: subscription.discountPercent },
      "Free Shipping": { checkbox: subscription.freeShipping },
      "Next Eligible Session": { number: subscription.nextEligibleSession },
      "Status": { select: { name: subscription.status } },
      "Skip Next Delivery": { checkbox: subscription.skipNextDelivery },
      "Created At": { date: { start: subscription.createdAt } },
      "Next Eligible Roast At": { date: { start: subscription.nextEligibleRoastAt || INITIAL_ROAST_DATE } },
    };
    const response = await notion.databases.query({
      database_id: databaseId,
      filter: { property: "Subscription ID", rich_text: { equals: subscription.id } },
    });
    const page = response.results[0];
    if (page) {
      await notion.pages.update({ page_id: page.id, properties });
      logger.info("Subscription mirror updated in Notion", { subscriptionId: subscription.id, operation: "update" });
    } else {
      await notion.pages.create({ parent: { database_id: databaseId }, properties });
      logger.info("Subscription mirror created in Notion", { subscriptionId: subscription.id, operation: "create" });
    }
  } catch (error: unknown) {
    logger.error("Unable to sync subscription to Notion mirror", {
      subscriptionId: subscription.id,
      error: (error as Error).message,
    });
    throw error;
  }
};

export class AccountService {
  /** Returns due subscriptions without mutating them. Fulfillment is invoked separately. */
  static async getDueSubscriptionIds(subscriptionId?: string): Promise<string[]> {
    const now = new Date().toISOString();
    if (subscriptionId) {
      const snapshot = await database().collection("account_subscriptions").doc(subscriptionId).get();
      const subscription = snapshot.data() as StoredSubscription | undefined;
      return subscription && subscription.status === "active" && !subscription.skipNextDelivery && subscription.nextEligibleRoastAt <= now
        ? [subscriptionId]
        : [];
    }
    const response = await database().collection("account_subscriptions")
      .where("nextEligibleRoastAt", "<=", now)
      .get();
    return response.docs
      .map((document) => document.data() as StoredSubscription)
      .filter((subscription) => subscription.status === "active" && !subscription.skipNextDelivery)
      .map((subscription) => subscription.id);
  }

  static async checkDueSubscriptions(subscriptionId?: string): Promise<void> {
    const dueSubscriptionIds = await AccountService.getDueSubscriptionIds(subscriptionId);
    logger.info("Subscription due-date check completed", {
      scope: subscriptionId ? "single-subscription" : "all-subscriptions",
      dueCount: dueSubscriptionIds.length,
      dueSubscriptionIds,
    });
    await Promise.all(dueSubscriptionIds.map((id) => AccountService.processDueSubscription(id)));
  }

  static async processDueSubscription(subscriptionId: string): Promise<void> {
    const db = database();
    const subscriptionRef = db.collection("account_subscriptions").doc(subscriptionId);
    const now = new Date();
    const subscription = await db.runTransaction(async (transaction): Promise<StoredSubscription | null> => {
      const snapshot = await transaction.get(subscriptionRef);
      const value = snapshot.data() as (StoredSubscription & { renewalLeaseUntil?: number }) | undefined;
      if (!value || value.status !== "active" || value.skipNextDelivery || value.nextEligibleRoastAt > now.toISOString() || (value.renewalLeaseUntil || 0) > now.getTime()) return null;
      transaction.update(subscriptionRef, { renewalLeaseUntil: now.getTime() + 10 * 60 * 1000, renewalProcessingDueAt: value.nextEligibleRoastAt });
      return value;
    });
    if (!subscription) return;

    try {
      const nextRoastDate = await nextRoastSessionDate(subscription.nextEligibleRoastAt, subscription.cadence);
      if (!nextRoastDate) throw new Error("No later roast date is available in the Notion calendar");
      const accountSnapshot = await db.collection("accounts").doc(subscription.accountId).get();
      const account = accountSnapshot.data() as (StoredAccount & { billing?: { stripeCustomerId?: string; stripePaymentMethodId?: string }; shippingAddressData?: ShippingAddressData; shippingAddress?: string }) | undefined;
      const customerId = account?.billing?.stripeCustomerId;
      const paymentMethodId = account?.billing?.stripePaymentMethodId;
      const shippingAddress = account?.shippingAddressData;
      if (!account || !customerId || !paymentMethodId || !shippingAddress) throw new Error("Subscription is missing a saved payment method or shipping address");
      if (!Number.isSafeInteger(subscription.unitAmount) || subscription.unitAmount < 50) throw new Error("Subscription is missing a valid renewal price");

      const productAmount = Math.round(subscription.unitAmount * subscription.bagCount * (1 - subscription.discountPercent / 100));
      let shippingAmount = 0;
      if (!subscription.freeShipping) {
        const address: Address = { street1: shippingAddress.line1, street2: shippingAddress.line2, city: shippingAddress.city, state: shippingAddress.state, zip: shippingAddress.postal_code, country: shippingAddress.country, name: `${account.user.firstName} ${account.user.lastName}`, email: account.user.email };
        const rates = await fetchShippingRates(address, undefined, { length: 6, width: 4, height: 2, weight: Math.max(8, Math.ceil((Number.parseFloat(subscription.weight) || 200) / 28.35 * subscription.bagCount + 3)) });
        shippingAmount = Math.round(Math.min(...rates.rates.map((rate) => rate.rate)) * 100);
      }
      const dueKey = `${subscription.id}:${subscription.nextEligibleRoastAt}`;
      const generatedOrderId = Date.now().toString().slice(-8).toUpperCase();
      const paymentIntent = await getStripe().paymentIntents.create({
        amount: productAmount + shippingAmount,
        currency: "usd",
        customer: customerId,
        payment_method: paymentMethodId,
        off_session: true,
        confirm: true,
        metadata: { accountId: subscription.accountId, subscriptionId: subscription.id, dueRoastDate: subscription.nextEligibleRoastAt, orderNumber: generatedOrderId },
        description: `Koinonia roast subscription: ${subscription.itemName}`,
      }, { idempotencyKey: `renewal:${dueKey}` });
      const orderId = paymentIntent.metadata.orderNumber || generatedOrderId;
      await db.batch()
        .set(db.collection("account_orders").doc(orderId), { id: orderId, accountId: subscription.accountId, totalAmount: paymentIntent.amount_received / 100, createdAt: new Date().toISOString(), status: "completed", paymentIntentId: paymentIntent.id, subscriptionId: subscription.id, source: "subscription-renewal" })
        .update(subscriptionRef, { nextEligibleRoastAt: nextRoastDate, renewalLeaseUntil: 0, renewalProcessingDueAt: null, lastRenewalPaymentIntentId: paymentIntent.id, lastRenewedAt: new Date().toISOString() })
        .commit();
      logger.info("Subscription renewal payment succeeded", { subscriptionId, paymentIntentId: paymentIntent.id, orderId });
    } catch (error: unknown) {
      const stripeError = error as Stripe.StripeRawError;
      const update: Record<string, unknown> = { renewalLeaseUntil: 0, renewalProcessingDueAt: null, lastRenewalError: stripeError.message || "Unknown renewal error" };
      if (stripeError.type === "card_error") update.status = "paused";
      await subscriptionRef.update(update);
      logger.error("Subscription renewal failed", { subscriptionId, error: stripeError.message });
    }
  }

  /**
   * Firestore is authoritative. The Firestore write trigger calls this method
   * to keep Notion's operations view aligned with the latest subscription.
   */
  static async syncSubscriptionMirrorById(subscriptionId: string): Promise<void> {
    const subscriptionSnapshot = await database().collection("account_subscriptions").doc(subscriptionId).get();
    if (!subscriptionSnapshot.exists) return;

    const subscription = subscriptionSnapshot.data() as StoredSubscription;
    logger.info("Syncing subscription mirror to Notion", { subscriptionId, accountId: subscription.accountId });
    const accountSnapshot = await database().collection("accounts").doc(subscription.accountId).get();
    if (!accountSnapshot.exists) {
      logger.warn("Subscription mirror skipped because its account was not found", { subscriptionId, accountId: subscription.accountId });
      return;
    }
    await syncSubscriptionMirror(subscription, publicProfile(accountSnapshot.data() as StoredAccount));
  }

  static async completeSubscriptionCheckout(req: Request, res: Response): Promise<void> {
    try {
      const account = await sessionAccount(req);
      if (!account) {
        res.status(401).json({ error: "Your session has expired. Please log in again." });
        return;
      }
      const paymentIntentId = String(req.body?.paymentIntentId || "");
      const requestedOrderId = String(req.body?.orderId || "").trim().toUpperCase();
      const items = Array.isArray(req.body?.subscriptionItems) ? req.body.subscriptionItems : [];
      const shippingAddress = String(req.body?.shippingAddress || "").trim().slice(0, 500);
      const shippingAddressData = normalizedShippingAddress(req.body?.shippingAddressData);
      if (!paymentIntentId || items.length === 0) {
        res.status(400).json({ error: "A paid subscription checkout is required." });
        return;
      }
      if (!shippingAddressData) {
        res.status(400).json({ error: "A complete shipping address is required for a subscription." });
        return;
      }
      const paymentIntent = await getStripe().paymentIntents.retrieve(paymentIntentId);
      if (paymentIntent.status !== "succeeded" || paymentIntent.metadata.accountId !== account.id) {
        res.status(400).json({ error: "Payment could not be verified for this account." });
        return;
      }

      const checkoutRef = database().collection("subscription_checkouts").doc(paymentIntentId);
      const existing = await checkoutRef.get();
      if (existing.exists) {
        res.json({ created: false, subscriptionIds: existing.data()?.subscriptionIds || [] });
        return;
      }
      const paymentMethodId = typeof paymentIntent.payment_method === "string" ? paymentIntent.payment_method : null;
      const customerId = typeof paymentIntent.customer === "string" ? paymentIntent.customer : null;
      const nextEligibleRoastAt = await nextUpcomingRoastSessionDate();
      const subscriptions: StoredSubscription[] = [];
      for (const item of items) {
        const plan = String(item?.plan || "") as SubscriptionPlan;
        const selectedPlan = subscriptionPlans[plan];
        const itemSku = String(item?.itemSku || "").trim().slice(0, 120);
        const itemName = String(item?.itemName || "").trim().slice(0, 120);
        const weight = String(item?.weight || "").trim().slice(0, 40);
        const unitAmount = Math.round(Number(item?.unitAmount) * 100);
        if (!selectedPlan || !itemSku || !itemName || !weight || !Number.isSafeInteger(unitAmount) || unitAmount < 50) {
          res.status(400).json({ error: "Invalid subscription item." });
          return;
        }
        subscriptions.push({
          id: `sub_${randomUUID()}`, accountId: account.id, plan, ...selectedPlan,
          itemSku, itemName, weight, unitAmount, discountPercent: 5, nextEligibleSession: null,
          status: "active", skipNextDelivery: false, createdAt: new Date().toISOString(),
          nextEligibleRoastAt,
        });
      }
      const batch = database().batch();
      const orderId = /^[A-Z0-9]{8}$/.test(requestedOrderId) ? requestedOrderId : paymentIntentId.slice(-8).toUpperCase();
      const order: Order & { paymentIntentId: string; subscriptionIds: string[]; source: "subscription-checkout" } = {
        id: orderId,
        accountId: account.id,
        totalAmount: paymentIntent.amount_received / 100,
        createdAt: new Date(paymentIntent.created * 1000).toISOString(),
        status: "completed",
        paymentIntentId,
        subscriptionIds: subscriptions.map((item) => item.id),
        source: "subscription-checkout",
      };
      batch.set(checkoutRef, { accountId: account.id, paymentIntentId, subscriptionIds: subscriptions.map((item) => item.id), createdAt: Date.now() });
      batch.set(database().collection("account_orders").doc(order.id), order);
      batch.delete(database().collection("account_order_cache").doc(account.id));
      batch.set(database().collection("accounts").doc(account.id), {
        billing: { stripeCustomerId: customerId, stripePaymentMethodId: paymentMethodId, paymentMethodSavedAt: Date.now() },
        shippingAddress: shippingAddress || null,
        shippingAddressData,
        updatedAt: Date.now(),
      }, { merge: true });
      subscriptions.forEach((subscription) => batch.set(database().collection("account_subscriptions").doc(subscription.id), subscription));
      await batch.commit();
      res.status(201).json({ created: true, subscriptionIds: subscriptions.map((item) => item.id) });
    } catch (error: unknown) {
      logger.error("Unable to complete subscription checkout", { error: (error as Error).message });
      res.status(500).json({ error: "Unable to activate your subscription right now." });
    }
  }
  static async login(req: Request, res: Response): Promise<void> {
    try {
      const username = String(req.body?.username || "").trim();
      const password = String(req.body?.password || "");
      if (!username || !password) {
        res.status(400).json({ error: "Username and password are required." });
        return;
      }
      const account = await findAccount(username);
      if (!account || !(await passwordMatches(password, account.passwordHash))) {
        res.status(401).json({ error: "Invalid username or password." });
        return;
      }
      res.json({ account: publicProfile(account), token: await issueSession(account) });
    } catch (error: unknown) {
      logger.error("Unable to log in", { error: (error as Error).message });
      res.status(500).json({ error: "Unable to log in right now." });
    }
  }

  static async createAccount(req: Request, res: Response): Promise<void> {
    try {
      const firstName = String(req.body?.firstName || "").trim();
      const lastName = String(req.body?.lastName || "").trim();
      const email = String(req.body?.email || "").trim().toLowerCase();
      const username = String(req.body?.username || email).trim();
      const password = String(req.body?.password || "");
      if (!firstName || !lastName || !email || !username || password.length < 8 || !/^\S+@\S+\.\S+$/.test(email)) {
        res.status(400).json({ error: "Enter a name, valid email, username, and password of at least 8 characters." });
        return;
      }
      const accountId = `acct_${randomUUID()}`;
      const normalizedUsername = username.toLowerCase();
      const usernameKey = Buffer.from(normalizedUsername).toString("base64url");
      const emailKey = Buffer.from(email).toString("base64url");
      const account: StoredAccount = {
        id: accountId,
        user: { firstName, lastName, email },
        username,
        passwordHash: await createPasswordHash(password),
      };
      const created = await database().runTransaction(async (transaction) => {
        const usernameRef = database().collection("account_usernames").doc(usernameKey);
        const emailRef = database().collection("account_emails").doc(emailKey);
        const accountRef = database().collection("accounts").doc(accountId);
        const [usernameSnapshot, emailSnapshot] = await Promise.all([
          transaction.get(usernameRef),
          transaction.get(emailRef),
        ]);
        if (usernameSnapshot.exists || emailSnapshot.exists) return false;
        transaction.set(accountRef, { ...account, createdAt: Date.now() });
        transaction.set(usernameRef, { accountId, username: normalizedUsername });
        transaction.set(emailRef, { accountId, email });
        return true;
      });
      if (!created) {
        res.status(409).json({ error: "That username or email is already in use." });
        return;
      }
      res.status(201).json({ account: publicProfile(account), token: await issueSession(account) });
    } catch (error: unknown) {
      logger.error("Unable to create account", { error: (error as Error).message });
      res.status(500).json({ error: "Unable to create an account right now." });
    }
  }

  static async getOrders(req: Request, res: Response): Promise<void> {
    try {
      const account = await sessionAccount(req);
      if (!account) {
        res.status(401).json({ error: "Your session has expired. Please log in again." });
        return;
      }
      const db = database();
      // Backfill order history for subscription checkouts completed before we
      // began writing account_orders. Stripe remains the source for the amount.
      const checkoutSnapshots = await db.collection("subscription_checkouts").where("accountId", "==", account.id).get();
      await Promise.all(checkoutSnapshots.docs.map(async (checkout) => {
        const paymentIntentId = String(checkout.data().paymentIntentId || "");
        if (!paymentIntentId) return;
        const orderRef = db.collection("account_orders").doc(paymentIntentId.slice(-8).toUpperCase());
        if ((await orderRef.get()).exists) return;
        const paymentIntent = await getStripe().paymentIntents.retrieve(paymentIntentId);
        if (paymentIntent.status !== "succeeded" || paymentIntent.metadata.accountId !== account.id) return;
        await orderRef.set({
          id: orderRef.id,
          accountId: account.id,
          totalAmount: paymentIntent.amount_received / 100,
          createdAt: new Date(paymentIntent.created * 1000).toISOString(),
          status: "completed",
          paymentIntentId,
          subscriptionIds: checkout.data().subscriptionIds || [],
          source: "subscription-checkout",
        });
      }));

      const accountOrderSnapshots = await db.collection("account_orders").where("accountId", "==", account.id).get();
      const firestoreOrders = accountOrderSnapshots.docs.map((document) => document.data() as Order);
      const notionDatabaseId = process.env.NOTION_ONLINE_ORDERS_DATABASE_ID;
      const notionOrders: Order[] = !notionDatabaseId ? [] : (await getNotion().databases.query({
        database_id: notionDatabaseId,
        filter: { property: "Email", email: { equals: account.user.email } },
        sorts: [{ property: "Order created", direction: "descending" }],
      })).results.map((page: any) => {
        const properties = page.properties || {};
        return {
          id: text(properties["Order #"]) || page.id,
          accountId: account.id,
          totalAmount: properties.Total?.number || 0,
          createdAt: properties["Order created"]?.date?.start || page.created_time,
          status: status(properties.Status),
        };
      });
      const orders = [...firestoreOrders, ...notionOrders]
        .filter((order, index, all) => all.findIndex((candidate) => candidate.id === order.id) === index)
        .sort((first, second) => second.createdAt.localeCompare(first.createdAt));
      res.json({ orders });
    } catch (error: unknown) {
      logger.error("Unable to get account orders", { error: (error as Error).message });
      res.status(500).json({ error: "Unable to load orders right now." });
    }
  }

  static async getSubscriptions(req: Request, res: Response): Promise<void> {
    try {
      const account = await sessionAccount(req);
      if (!account) {
        res.status(401).json({ error: "Your session has expired. Please log in again." });
        return;
      }
      const response = await database().collection("account_subscriptions")
        .where("accountId", "==", account.id)
        .get();
      const subscriptions = response.docs
        .map((document) => document.data() as StoredSubscription)
        .sort((first, second) => second.createdAt.localeCompare(first.createdAt));
      res.json({ subscriptions });
    } catch (error: unknown) {
      logger.error("Unable to get subscriptions", { error: (error as Error).message });
      res.status(500).json({ error: "Unable to load subscriptions right now." });
    }
  }

  static async createSubscription(req: Request, res: Response): Promise<void> {
    try {
      const account = await sessionAccount(req);
      if (!account) {
        res.status(401).json({ error: "Your session has expired. Please log in again." });
        return;
      }
      const plan = String(req.body?.plan || "") as SubscriptionPlan;
      const selectedPlan = subscriptionPlans[plan];
      if (!selectedPlan) {
        res.status(400).json({ error: "Choose a valid subscription plan." });
        return;
      }
      const itemSku = String(req.body?.itemSku || "").trim().slice(0, 120);
      const itemName = String(req.body?.itemName || "").trim().slice(0, 120);
      const weight = String(req.body?.weight || "").trim().slice(0, 40);
      const unitAmount = Math.round(Number(req.body?.unitAmount) * 100);
      if (!itemSku || !itemName || !weight || !Number.isSafeInteger(unitAmount) || unitAmount < 50) {
        res.status(400).json({ error: "Choose a coffee and bag size for your subscription." });
        return;
      }
      const subscription: StoredSubscription = {
        id: `sub_${randomUUID()}`,
        accountId: account.id,
        plan,
        ...selectedPlan,
        itemSku,
        itemName,
        weight,
        unitAmount,
        discountPercent: 5,
        nextEligibleSession: null,
        status: "active",
        skipNextDelivery: false,
        createdAt: new Date().toISOString(),
        nextEligibleRoastAt: await nextUpcomingRoastSessionDate(),
      };
      await database().collection("account_subscriptions").doc(subscription.id).set(subscription);
      res.status(201).json({ subscription });
    } catch (error: unknown) {
      logger.error("Unable to create subscription", { error: (error as Error).message });
      res.status(500).json({ error: "Unable to create your subscription right now." });
    }
  }

  static async cancelSubscription(req: Request, res: Response): Promise<void> {
    try {
      const account = await sessionAccount(req);
      if (!account) {
        res.status(401).json({ error: "Your session has expired. Please log in again." });
        return;
      }
      const subscriptionId = String(req.params.subscriptionId || "");
      const snapshot = await accountSubscription(account.id, subscriptionId);
      if (!snapshot) {
        res.status(404).json({ error: "Subscription not found." });
        return;
      }
      const subscription = { ...snapshot.data(), status: "canceled" } as StoredSubscription;
      await snapshot.ref.update({ status: subscription.status });
      res.json({ subscription });
    } catch (error: unknown) {
      logger.error("Unable to cancel subscription", { error: (error as Error).message });
      res.status(500).json({ error: "Unable to cancel your subscription right now." });
    }
  }

  static async skipSubscription(req: Request, res: Response): Promise<void> {
    try {
      const account = await sessionAccount(req);
      if (!account) {
        res.status(401).json({ error: "Your session has expired. Please log in again." });
        return;
      }
      const subscriptionId = String(req.params.subscriptionId || "");
      const snapshot = await accountSubscription(account.id, subscriptionId);
      if (!snapshot) {
        res.status(404).json({ error: "Subscription not found." });
        return;
      }
      const subscription = { ...snapshot.data(), skipNextDelivery: true } as StoredSubscription;
      await snapshot.ref.update({ skipNextDelivery: subscription.skipNextDelivery });
      res.json({ subscription });
    } catch (error: unknown) {
      logger.error("Unable to skip subscription", { error: (error as Error).message });
      res.status(500).json({ error: "Unable to skip your next delivery right now." });
    }
  }

  static async logout(req: Request, res: Response): Promise<void> {
    const token = req.header("Authorization")?.replace(/^Bearer\s+/i, "");
    if (token) await database().collection("account_sessions").doc(token).delete();
    res.status(204).send();
  }
}
