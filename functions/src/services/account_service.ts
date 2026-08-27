import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { getFirestore } from "firebase-admin/firestore";
import { getApps, initializeApp } from "firebase-admin/app";
import { Client } from "@notionhq/client";
import Stripe from "stripe";
import { Request, Response } from "express";
import { createLogger } from "../logger";

const logger = createLogger("accounts");
const scrypt = promisify(scryptCallback);
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_DURATION_MS = 5 * 60 * 1000;
export const INITIAL_ROAST_DATE = "2026-09-01T09:00:00-07:00";

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

interface Order {
  id: string;
  accountId: string;
  totalAmount: number;
  date: string;
  status: "pending" | "completed" | "cancelled";
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

const text = (property: any): string => {
  if (!property) return "";
  if (property.type === "email") return property.email || "";
  if (property.type === "title") return property.title?.map((value: any) => value.plain_text).join("") || "";
  return property.rich_text?.map((value: any) => value.plain_text).join("") || "";
};

const status = (property: any): Order["status"] => {
  const value = (property?.status?.name || property?.select?.name || "").toLowerCase();
  if (["paid", "completed", "delivered", "shipped"].includes(value)) return "completed";
  if (["cancelled", "canceled", "refunded"].includes(value)) return "cancelled";
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
      const items = Array.isArray(req.body?.subscriptionItems) ? req.body.subscriptionItems : [];
      const shippingAddress = String(req.body?.shippingAddress || "").trim().slice(0, 500);
      if (!paymentIntentId || items.length === 0) {
        res.status(400).json({ error: "A paid subscription checkout is required." });
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
      const subscriptions: StoredSubscription[] = [];
      for (const item of items) {
        const plan = String(item?.plan || "") as SubscriptionPlan;
        const selectedPlan = subscriptionPlans[plan];
        const itemSku = String(item?.itemSku || "").trim().slice(0, 120);
        const itemName = String(item?.itemName || "").trim().slice(0, 120);
        const weight = String(item?.weight || "").trim().slice(0, 40);
        if (!selectedPlan || !itemSku || !itemName || !weight) {
          res.status(400).json({ error: "Invalid subscription item." });
          return;
        }
        subscriptions.push({
          id: `sub_${randomUUID()}`, accountId: account.id, plan, ...selectedPlan,
          itemSku, itemName, weight, discountPercent: 5, nextEligibleSession: null,
          status: "active", skipNextDelivery: false, createdAt: new Date().toISOString(),
          nextEligibleRoastAt: INITIAL_ROAST_DATE,
        });
      }
      const batch = database().batch();
      batch.set(checkoutRef, { accountId: account.id, paymentIntentId, subscriptionIds: subscriptions.map((item) => item.id), createdAt: Date.now() });
      batch.set(database().collection("accounts").doc(account.id), {
        billing: { stripeCustomerId: customerId, stripePaymentMethodId: paymentMethodId, paymentMethodSavedAt: Date.now() },
        shippingAddress: shippingAddress || null,
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
      const cacheRef = database().collection("account_order_cache").doc(account.id);
      const cached = await cacheRef.get();
      const cachedData = cached.data();
      if (cachedData && Date.now() - cachedData.cachedAt < CACHE_DURATION_MS) {
        res.json({ orders: cachedData.orders });
        return;
      }
      const response = await getNotion().databases.query({
        database_id: process.env.NOTION_ONLINE_ORDERS_DATABASE_ID!,
        filter: { property: "Email", email: { equals: account.user.email } },
        sorts: [{ property: "Order created", direction: "descending" }],
      });
      const orders: Order[] = response.results.map((page: any) => {
        const properties = page.properties || {};
        return {
          id: text(properties["Order #"]) || page.id,
          accountId: account.id,
          totalAmount: properties.Total?.number || 0,
          date: properties["Order created"]?.date?.start || page.created_time,
          status: status(properties.Status),
        };
      });
      await cacheRef.set({ orders, cachedAt: Date.now() });
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
      if (!itemSku || !itemName || !weight) {
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
        discountPercent: 5,
        nextEligibleSession: null,
        status: "active",
        skipNextDelivery: false,
        createdAt: new Date().toISOString(),
        nextEligibleRoastAt: INITIAL_ROAST_DATE,
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
