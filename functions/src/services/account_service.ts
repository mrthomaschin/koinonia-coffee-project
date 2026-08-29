import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getApps, initializeApp } from "firebase-admin/app";
import { Client } from "@notionhq/client";
import Stripe from "stripe";
import { Request, Response } from "express";
import { createLogger } from "../logger";
import { Address, fetchShippingRates, purchaseShipment } from "./easypost_service";
import { EmailService } from "./email_service";
import { generateReceiptImage, receiptFilename, uploadReceiptToNotion } from "./pictify_service";

export type AccountLabel = "consumer" | "partner" | "wholesale" | "church-ministry";
export type PartnerAccountLabel = Extract<AccountLabel, "wholesale" | "church-ministry">;
export const DEFAULT_ACCOUNT_LABEL: AccountLabel = "consumer";
export const ACCOUNT_LABEL_PARENTS: Record<AccountLabel, AccountLabel | null> = {
  consumer: null,
  partner: null,
  wholesale: "partner",
  "church-ministry": "partner",
};

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
  label: AccountLabel;
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
  paymentIntentId?: string;
  itemsSummary?: string;
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
  // Product/variant shipping weight in grams, captured at checkout.
  shippingWeight?: number;
  unitAmount: number;
  discountPercent: number;
  freeShipping: boolean;
  status: "active" | "paused" | "canceled";
  skipNextDelivery: boolean;
  isLocalPickup?: boolean;
  orderPickupId?: string;
  createdAt: string;
  upcomingRoastDate: string;
  addOnWeight?: number;
  addOnUnitAmount?: number;
}

const subscriptionPlans: Record<SubscriptionPlan, Pick<Subscription, "bagCount" | "cadence" | "freeShipping">> = {
  "one-bag-every-session": { bagCount: 1, cadence: "every-session", freeShipping: false },
  "two-bags-every-session": { bagCount: 2, cadence: "every-session", freeShipping: true },
  "one-bag-every-other-session": { bagCount: 1, cadence: "every-other-session", freeShipping: false },
  "two-bags-every-other-session": { bagCount: 2, cadence: "every-other-session", freeShipping: true },
};

// Mirrors src/util/shipping.ts so recurring shipments use the same box rules
// and weight calculation as EmbeddedCheckout.
const subscriptionParcel = (shippingWeight: number | undefined, displayWeight: string, quantity: number) => {
  const sourceWeight = Number.isFinite(shippingWeight) && Number(shippingWeight) > 0
    ? Number(shippingWeight)
    : displayWeight;
  const weightText = String(sourceWeight).toLowerCase().trim();
  const numericWeight = typeof sourceWeight === "number" ? sourceWeight : Number.parseFloat(weightText.match(/\d+(?:\.\d+)?/)?.[0] || "0");
  const itemWeightOunces = typeof sourceWeight === "number"
    ? sourceWeight === 200 ? 7 : sourceWeight === 5 ? 80 : sourceWeight / 28.35
    : weightText.includes("lb") ? numericWeight * 16
      : weightText.includes("oz") ? numericWeight
        : weightText.includes("g") || numericWeight > 100 ? numericWeight / 28.35 : numericWeight;
  const totalWeightOunces = itemWeightOunces * quantity;
  const box = totalWeightOunces <= 12 ? { length: 6, width: 4, height: 2, boxWeight: 4 }
    : totalWeightOunces <= 28 ? { length: 8, width: 6, height: 3, boxWeight: 6 }
      : totalWeightOunces <= 96 ? { length: 10, width: 8, height: 4, boxWeight: 8 }
        : totalWeightOunces <= 160 ? { length: 12, width: 10, height: 6, boxWeight: 12 }
          : { length: 18, width: 14, height: 10, boxWeight: 20 };
  return {
    length: box.length,
    width: box.width,
    height: box.height,
    weight: Math.round(totalWeightOunces + box.boxWeight),
    boxSize: `${box.length}x${box.width}x${box.height}`,
  };
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
  // Notion can return a date-only value or a timestamp with a different offset.
  // Roast fulfillment is calendar-day based, so match the Pacific calendar date.
  const currentDateKey = currentRoastDate.slice(0, 10);
  const exactIndex = calendar.findIndex((date) => date.slice(0, 10) === currentDateKey);
  const currentIndex = exactIndex >= 0
    ? exactIndex
    : calendar.reduce((latestIndex, date, index) => date.slice(0, 10) <= currentDateKey ? index : latestIndex, -1);
  if (currentIndex < 0) {
    logger.warn("Due subscription date is before the first roast calendar entry", { currentRoastDate, currentDateKey, calendar });
    return null;
  }
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

const pacificCalendarDate = (date: Date = new Date()): string => new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Los_Angeles",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(date);

const calendarDateOffset = (dateValue: string, days: number): string => {
  const [year, month, day] = dateValue.slice(0, 10).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const renewalCalendarDate = (roastDate: string): string => calendarDateOffset(roastDate, -4);

const isRoastDateDue = (roastDate: string, now: Date = new Date()): boolean =>
  renewalCalendarDate(roastDate) <= pacificCalendarDate(now);

const weightInPounds = (value: string): number => {
  const amount = Number.parseFloat(value);
  if (!Number.isFinite(amount)) return 0;
  const normalized = value.toLowerCase();
  if (normalized.includes("kg")) return amount * 2.20462;
  if (normalized.includes("g")) return amount / 453.592;
  if (normalized.includes("oz")) return amount / 16;
  return normalized.includes("lb") ? amount : 0;
};

const isPartnerLabel = (label: AccountLabel): label is "wholesale" | "church-ministry" =>
  label === "wholesale" || label === "church-ministry";

let notionInstance: Client | null = null;

const getNotion = (): Client => {
  if (!notionInstance) {
    const token = process.env.NOTION_TOKEN;
    if (!token) throw new Error("NOTION_TOKEN is not configured");
    notionInstance = new Client({ auth: token });
  }
  return notionInstance;
};

const carrierDisplayName = (carrier?: string): string => {
  if (carrier === "UPSDAP") return "UPS";
  if (carrier === "FedExDefault") return "FedEx";
  return carrier || "Unknown";
};

const serviceDisplayName = (service?: string): string => {
  const services: Record<string, string> = {
    GroundAdvantage: "Ground Advantage",
    Priority: "Priority Mail",
    PriorityExpress: "Priority Mail Express",
  };
  return services[service || ""] || "Standard";
};

const createRenewalNotionOrder = async (params: { orderId: string; paymentIntentId: string; account: AccountProfile & { phone?: string }; subscription: Subscription; totalAmount: number; shippingAmount: number; shippingAddress: string; shippingLabelPrice: number; shippingBox: string; shipment?: { trackingNumber: string; shipmentId: string; carrier?: string; service?: string; labelUrl: string } }): Promise<void> => {
  const databaseId = process.env.NOTION_ONLINE_ORDERS_DATABASE_ID;
  if (!databaseId) throw new Error("NOTION_ONLINE_ORDERS_DATABASE_ID is not configured");
  const notion = getNotion();
  const existing = await notion.databases.query({ database_id: databaseId, filter: { property: "Order #", rich_text: { equals: params.orderId } } });
  let invoiceReceiptProperties: Record<string, any> = {};
  const existingPage = existing.results[0] as any;
  if (!existingPage?.properties?.["Invoice Receipt"]?.files?.length) {
    try {
      logger.info("Generating renewal invoice receipt", { orderId: params.orderId });
      const receiptImage = await generateReceiptImage({
        customerName: `${params.account.user.firstName} ${params.account.user.lastName}`.trim(),
        customerEmail: params.account.user.email,
        customerAddress: params.shippingAddress,
        orderId: params.orderId,
        items: [{ name: params.subscription.itemName, sku: params.subscription.itemSku, quantity: params.subscription.bagCount, price: (params.subscription.unitAmount * (1 - params.subscription.discountPercent / 100)) / 100, variations: params.subscription.weight }],
        subtotal: (params.subscription.unitAmount * params.subscription.bagCount * (1 - params.subscription.discountPercent / 100)) / 100,
        shipping: params.shippingAmount,
        totalAmount: params.totalAmount,
        orderDate: new Date().toISOString(),
        transactionId: params.paymentIntentId,
      });
      const filename = receiptFilename(params.orderId);
      const receiptUploadId = await uploadReceiptToNotion(filename, receiptImage);
      invoiceReceiptProperties = { "Invoice Receipt": { files: [{ name: filename, type: "file_upload", file_upload: { id: receiptUploadId } }] } };
      logger.info("Renewal invoice receipt attached", { orderId: params.orderId });
    } catch (error: unknown) {
      logger.error("Unable to generate renewal invoice receipt", { orderId: params.orderId, error: (error as Error).message });
    }
  }
  const shipmentProperties: Record<string, any> = params.shipment ? {
    "Shipping Price": { number: params.shippingLabelPrice },
    "Tracking Info": { rich_text: [{ text: { content: params.shipment.trackingNumber } }] },
    "Shipment ID": { rich_text: [{ text: { content: params.shipment.shipmentId } }] },
    "Tracking Carrier": { select: { name: carrierDisplayName(params.shipment.carrier) } },
    "Carrier Type": { select: { name: serviceDisplayName(params.shipment.service) } },
    "Tracking Label": { url: params.shipment.labelUrl },
    "Shipping Box": { rich_text: [{ text: { content: params.shippingBox } }] },
  } : {
    "Shipping Price": { number: 0 },
    "Local Pickup": { checkbox: true },
    "Order Pickup ID": { rich_text: [{ text: { content: params.subscription.orderPickupId || "" } }] },
  };
  if (existing.results.length) {
    await notion.pages.update({ page_id: existing.results[0].id, properties: { ...shipmentProperties, ...invoiceReceiptProperties } });
    return;
  }
  await notion.pages.create({
    parent: { database_id: databaseId },
    properties: {
      "Customer": { title: [{ text: { content: `${params.account.user.firstName} ${params.account.user.lastName}`.trim() } }] },
      "Order #": { rich_text: [{ text: { content: params.orderId } }] },
      "Status": { status: { name: "Paid" } },
      "Fulfillment": { status: { name: "Pending" } },
      "Items ordered": { rich_text: [{ text: { content: `${params.subscription.bagCount}x ${params.subscription.itemName} (${params.subscription.weight})` } }] },
      "Items ordered formatted": { rich_text: [{ text: { content: `${params.subscription.itemName},${params.subscription.itemSku},${weightInPounds(params.subscription.weight) * params.subscription.bagCount + (params.subscription.addOnWeight || 0)}` } }] },
      "Email": { email: params.account.user.email },
      "Phone": { phone_number: params.account.phone || null },
      "Shipping address": { rich_text: [{ text: { content: params.shippingAddress || "N/A" } }] },
      "Transaction ID": { rich_text: [{ text: { content: params.orderId } }] },
      "Receipt": { url: `https://dashboard.stripe.com/payments/${params.paymentIntentId}` },
      ...invoiceReceiptProperties,
      "Total": { number: params.totalAmount },
      ...shipmentProperties,
      "Order created": { date: { start: new Date().toISOString() } },
    },
  });
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
  if (!account.exists) return null;
  const accountData = account.data() as Partial<StoredAccount>;
  // Existing records predate account labels. Treat them as consumers while
  // writing the default so the migration is safe even if it is re-run.
  if (!accountData.label) {
    await account.ref.set({ label: DEFAULT_ACCOUNT_LABEL, updatedAt: Date.now() }, { merge: true });
    accountData.label = DEFAULT_ACCOUNT_LABEL;
  }
  return accountData as StoredAccount;
};

const publicProfile = (account: StoredAccount): AccountProfile => ({
  id: account.id,
  user: account.user,
  username: account.username,
  label: account.label || DEFAULT_ACCOUNT_LABEL,
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
  const accountData = account.data() as Partial<StoredAccount> | undefined;
  if (!accountData) return null;
  if (!accountData.label) {
    await account.ref.set({ label: DEFAULT_ACCOUNT_LABEL, updatedAt: Date.now() }, { merge: true });
    accountData.label = DEFAULT_ACCOUNT_LABEL;
  }
  return publicProfile(accountData as StoredAccount);
};

const PARTNER_PRICE_PROPERTIES: Record<string, string> = {
  "B-KOIN-WS": "B-KOIN-WS Price",
  "B-ETH-W-WS": "B-ETH-W-WS Price",
};

/**
 * Reads optional per-pound pricing for a Church & Ministry account from the
 * operations database. A missing or non-positive value means “use inventory
 * pricing”.
 */
const churchMinistryPriceOverrides = async (email: string): Promise<Record<string, number>> => {
  const databaseId = process.env.NOTION_CHURCH_AND_MINISTRY_DATABASE_ID;
  if (!databaseId || !email) return {};

  const response = await getNotion().databases.query({
    database_id: databaseId,
    filter: { property: "Email", email: { equals: email } },
    page_size: 1,
  });
  const properties = (response.results[0] as any)?.properties || {};
  return Object.entries(PARTNER_PRICE_PROPERTIES).reduce<Record<string, number>>((overrides, [sku, propertyName]) => {
    const value = properties[propertyName]?.number;
    if (typeof value === "number" && Number.isFinite(value) && value > 0) overrides[sku] = value;
    return overrides;
  }, {});
};

const partnerPriceOverridesFor = async (account: AccountProfile): Promise<Record<string, number>> => (
  account.label === "church-ministry" ? churchMinistryPriceOverrides(account.user.email) : {}
);

const partnerPriceForWeight = (pricePerPound: number, weight: string): number => {
  const pounds = weightInPounds(weight);
  // Store the undiscounted per-delivery amount. Subscription renewal applies
  // the account's discount when it charges the next delivery.
  return Math.round(pricePerPound * pounds * 100);
};

type StoredSubscription = Subscription & { accountId: string };

/** One-time in-place migration for subscriptions created before the field rename. */
const migrateSubscriptionDocument = async (snapshot: FirebaseFirestore.DocumentSnapshot): Promise<StoredSubscription | null> => {
  const value = snapshot.data() as (Partial<StoredSubscription> & { nextEligibleRoastAt?: string }) | undefined;
  if (!value) return null;
  const record = value as Record<string, unknown>;
  const hasLegacyFields = ["nextEligibleRoastAt", "nextEligibleSession", "renewalLeaseUntil", "renewalProcessingDueAt"]
    .some((field) => field in record);
  if (value.upcomingRoastDate && !hasLegacyFields) return value as StoredSubscription;
  if (!value.upcomingRoastDate && !value.nextEligibleRoastAt) return null;
  const migration: Record<string, unknown> = {
    nextEligibleRoastAt: FieldValue.delete(),
    nextEligibleSession: FieldValue.delete(),
    renewalLeaseUntil: FieldValue.delete(),
    renewalProcessingDueAt: FieldValue.delete(),
  };
  if (!value.upcomingRoastDate) migration.upcomingRoastDate = value.nextEligibleRoastAt;
  await snapshot.ref.update(migration);
  return { ...value, upcomingRoastDate: value.upcomingRoastDate || value.nextEligibleRoastAt } as StoredSubscription;
};

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
      "Status": { select: { name: subscription.status } },
      "Skip Next Delivery": { checkbox: subscription.skipNextDelivery },
      "Created At": { date: { start: subscription.createdAt } },
      "Upcoming Roast Date": { date: { start: subscription.upcomingRoastDate || INITIAL_ROAST_DATE } },
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
  /** Removes retired subscription fields from existing Firestore documents. */
  static async migrateLegacySubscriptionFields(): Promise<void> {
    const snapshots = await database().collection("account_subscriptions").get();
    await Promise.all(snapshots.docs.map(migrateSubscriptionDocument));
  }

  /** Returns due subscriptions without mutating them. Fulfillment is invoked separately. */
  static async getDueSubscriptionIds(subscriptionId?: string): Promise<string[]> {
    if (subscriptionId) {
      const snapshot = await database().collection("account_subscriptions").doc(subscriptionId).get();
      const subscription = await migrateSubscriptionDocument(snapshot);
      return subscription && subscription.status === "active" && !subscription.skipNextDelivery && isRoastDateDue(subscription.upcomingRoastDate)
        ? [subscriptionId]
        : [];
    }
    const response = await database().collection("account_subscriptions")
      .where("status", "==", "active")
      .get();
    const subscriptions = await Promise.all(response.docs.map(migrateSubscriptionDocument));
    return subscriptions
      .filter((subscription): subscription is StoredSubscription => !!subscription)
      .filter((subscription) => !subscription.skipNextDelivery && isRoastDateDue(subscription.upcomingRoastDate))
      .map((subscription) => subscription.id);
  }

  static async checkDueSubscriptions(subscriptionId?: string): Promise<void> {
    if (!subscriptionId) await AccountService.migrateLegacySubscriptionFields();
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
    const renewalClaimRef = db.collection("subscription_renewal_claims").doc(subscriptionId);
    const now = new Date();
    const subscription = await db.runTransaction(async (transaction): Promise<StoredSubscription | null> => {
      const [snapshot, claimSnapshot] = await Promise.all([transaction.get(subscriptionRef), transaction.get(renewalClaimRef)]);
      const value = snapshot.data() as StoredSubscription | undefined;
      if (!value || value.status !== "active" || value.skipNextDelivery || !isRoastDateDue(value.upcomingRoastDate, now)) return null;
      const claim = claimSnapshot.data() as { dueDate?: string; processingUntil?: number; status?: string } | undefined;
      if (claim?.dueDate === value.upcomingRoastDate && (claim.status === "completed" || (claim.processingUntil || 0) > now.getTime())) return null;
      transaction.set(renewalClaimRef, { subscriptionId, dueDate: value.upcomingRoastDate, status: "processing", processingUntil: now.getTime() + 10 * 60 * 1000, updatedAt: now.toISOString() });
      return value;
    });
    if (!subscription) return;

    try {
      const nextRoastDate = await nextRoastSessionDate(subscription.upcomingRoastDate, subscription.cadence);
      if (!nextRoastDate) throw new Error("No later roast date is available in the Notion calendar");
      const accountSnapshot = await db.collection("accounts").doc(subscription.accountId).get();
      const account = accountSnapshot.data() as (StoredAccount & { phone?: string; billing?: { stripeCustomerId?: string; stripePaymentMethodId?: string }; shippingAddressData?: ShippingAddressData; shippingAddress?: string }) | undefined;
      const customerId = account?.billing?.stripeCustomerId;
      const paymentMethodId = account?.billing?.stripePaymentMethodId;
      const shippingAddress = account?.shippingAddressData;
      if (!account || !customerId || !paymentMethodId) throw new Error("Subscription is missing a saved payment method");
      if (!subscription.isLocalPickup && !shippingAddress) throw new Error("Subscription is missing a saved shipping address");
      if (!Number.isSafeInteger(subscription.unitAmount) || subscription.unitAmount < 50) throw new Error("Subscription is missing a valid renewal price");

      // Older checkouts may not have saved the phone in Firestore. Recover it
      // from Stripe before building the shipping and Notion payloads.
      const stripeCustomer = !account.phone ? await getStripe().customers.retrieve(customerId) : null;
      const recoveredPhone = stripeCustomer && !stripeCustomer.deleted ? stripeCustomer.phone || undefined : undefined;
      const renewalAccount = recoveredPhone ? { ...account, phone: recoveredPhone } : account;
      if (recoveredPhone) await accountSnapshot.ref.set({ phone: recoveredPhone, updatedAt: Date.now() }, { merge: true });

      const addOnWeight = subscription.addOnWeight || 0;
      const discountPercent = account.label === "consumer" ? subscription.discountPercent : 0;
      const freeShipping = account.label === "wholesale" ? false : subscription.freeShipping;
      const productAmount = Math.round(subscription.unitAmount * subscription.bagCount * (1 - discountPercent / 100)) + (subscription.addOnUnitAmount || 0);
      const totalWeight = weightInPounds(subscription.weight) + addOnWeight;
      const parcel = subscriptionParcel(totalWeight * 453.592, `${totalWeight}lb`, 1);
      const address: Address | null = shippingAddress ? { street1: shippingAddress.line1, street2: shippingAddress.line2, city: shippingAddress.city, state: shippingAddress.state, zip: shippingAddress.postal_code, country: shippingAddress.country, name: `${renewalAccount.user.firstName} ${renewalAccount.user.lastName}`, email: renewalAccount.user.email, phone: renewalAccount.phone } : null;
      const shippingQuote = address ? await fetchShippingRates(address, undefined, parcel) : null;
      if (shippingQuote && !shippingQuote.rates.length) throw new Error("No shipping rates are available for this subscription order");
      const selectedRate = shippingQuote?.rates.reduce((lowest, rate) => rate.rate < lowest.rate ? rate : lowest);
      const shippingAmount = selectedRate && !subscription.isLocalPickup && !freeShipping ? Math.round(selectedRate.rate * 100) : 0;
      const dueKey = `${subscription.id}:${subscription.upcomingRoastDate}`;
      const generatedOrderId = Date.now().toString().slice(-8).toUpperCase();
      const paymentIntent = await getStripe().paymentIntents.create({
        amount: productAmount + shippingAmount,
        currency: "usd",
        customer: customerId,
        payment_method: paymentMethodId,
        off_session: true,
        confirm: true,
        metadata: { accountId: subscription.accountId, subscriptionId: subscription.id, dueRoastDate: subscription.upcomingRoastDate, orderNumber: generatedOrderId },
        description: `Koinonia roast subscription: ${subscription.itemName}`,
      }, { idempotencyKey: `renewal:${dueKey}` });
      const orderId = paymentIntent.metadata.orderNumber || generatedOrderId;
      const shipment = address && selectedRate && shippingQuote
        ? await purchaseShipment(address, selectedRate.id, undefined, parcel, shippingQuote.shipmentId)
        : undefined;
      await createRenewalNotionOrder({
        orderId,
        paymentIntentId: paymentIntent.id,
        account: renewalAccount,
        subscription,
        totalAmount: paymentIntent.amount_received / 100,
        shippingAmount: shippingAmount / 100,
        shippingAddress: account.shippingAddress || "",
        shippingLabelPrice: shipment?.shippingPrice || selectedRate?.rate || 0,
        shippingBox: parcel.boxSize,
        shipment,
      });
      const customerName = `${account.user.firstName} ${account.user.lastName}`.trim();
      await Promise.all([
        EmailService.sendSubscriptionOrderConfirmation({
          toEmail: account.user.email, customerName, orderId,
          itemName: `${subscription.itemName} (${totalWeight}lb)`, quantity: subscription.bagCount,
          totalAmount: paymentIntent.amount_received / 100, shippingAmount: shippingAmount / 100,
        }),
        EmailService.sendSubscriptionPurchaseNotification({
          customerEmail: account.user.email, customerName, orderId,
          itemName: `${subscription.itemName} (${totalWeight}lb)`, quantity: subscription.bagCount,
          unitAmount: subscription.unitAmount / 100, totalAmount: paymentIntent.amount_received / 100,
        }),
      ]);
      await db.batch()
        .set(db.collection("account_orders").doc(orderId), { id: orderId, accountId: subscription.accountId, totalAmount: paymentIntent.amount_received / 100, createdAt: new Date().toISOString(), status: "completed", paymentIntentId: paymentIntent.id, subscriptionId: subscription.id, source: "subscription-renewal", itemsSummary: `${totalWeight}lb ${subscription.itemName}`, shippingCharged: shippingAmount / 100, shippingLabelPrice: shipment?.shippingPrice || selectedRate?.rate || 0, shippingBox: parcel.boxSize, ...(shipment ? { shipmentId: shipment.shipmentId, trackingNumber: shipment.trackingNumber, trackingLabelUrl: shipment.labelUrl, shippingCarrier: shipment.carrier || null, shippingService: shipment.service || null } : {}) , isLocalPickup: !!subscription.isLocalPickup })
        .update(subscriptionRef, { upcomingRoastDate: nextRoastDate, lastRenewalPaymentIntentId: paymentIntent.id, lastRenewedAt: new Date().toISOString(), discountPercent, freeShipping, addOnWeight: FieldValue.delete(), addOnUnitAmount: FieldValue.delete() })
        .set(renewalClaimRef, { status: "completed", completedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, { merge: true })
        .commit();
      logger.info("Subscription renewal payment succeeded", { subscriptionId, paymentIntentId: paymentIntent.id, orderId });
    } catch (error: unknown) {
      const stripeError = error as Stripe.StripeRawError;
      const update: Record<string, unknown> = { lastRenewalError: stripeError.message || "Unknown renewal error" };
      if (stripeError.type === "card_error") update.status = "paused";
      await Promise.all([subscriptionRef.update(update), renewalClaimRef.delete()]);
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
      const customerPhone = String(req.body?.customerPhone || "").trim().slice(0, 40);
      const items = Array.isArray(req.body?.subscriptionItems) ? req.body.subscriptionItems : [];
      const shippingAddress = String(req.body?.shippingAddress || "").trim().slice(0, 500);
      const shippingAddressData = normalizedShippingAddress(req.body?.shippingAddressData);
      const isLocalPickup = req.body?.isLocalPickup === true;
      const orderPickupId = String(req.body?.orderPickupId || "").trim().slice(0, 120);
      if (!paymentIntentId || items.length === 0) {
        res.status(400).json({ error: "A paid subscription checkout is required." });
        return;
      }
      if (!isLocalPickup && !shippingAddressData) {
        res.status(400).json({ error: "A complete shipping address is required for a subscription." });
        return;
      }
      if (isLocalPickup && !orderPickupId) {
        res.status(400).json({ error: "A pickup option is required for a local-pickup subscription." });
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
      const paymentMethod = paymentMethodId ? await getStripe().paymentMethods.retrieve(paymentMethodId) : null;
      const stripeCustomer = customerId ? await getStripe().customers.retrieve(customerId) : null;
      const stripeCustomerPhone = stripeCustomer && !stripeCustomer.deleted ? stripeCustomer.phone : "";
      const savedPhone = (customerPhone || paymentIntent.shipping?.phone || paymentMethod?.billing_details?.phone || stripeCustomerPhone || "").trim().slice(0, 40);
      if (customerId && savedPhone) await getStripe().customers.update(customerId, { phone: savedPhone });
      const upcomingRoastDate = await nextUpcomingRoastSessionDate();
      const priceOverrides = await partnerPriceOverridesFor(account);
      const subscriptions: StoredSubscription[] = [];
      for (const item of items) {
        const plan = String(item?.plan || "") as SubscriptionPlan;
        const selectedPlan = subscriptionPlans[plan];
        const itemSku = String(item?.itemSku || "").trim().slice(0, 120);
        const itemName = String(item?.itemName || "").trim().slice(0, 120);
        const weight = String(item?.weight || "").trim().slice(0, 40);
        const shippingWeight = Number(item?.shippingWeight);
        let unitAmount = Math.round(Number(item?.unitAmount) * 100);
        const itemWeightInPounds = weightInPounds(weight);
        const resolvedShippingWeight = Number.isFinite(shippingWeight) && shippingWeight > 0
          ? shippingWeight
          : itemWeightInPounds > 0 ? itemWeightInPounds * 453.592 : undefined;
        if (isPartnerLabel(account.label)) {
          const minimumWeight = account.label === "wholesale" ? 5 : 1;
          if (!itemWeightInPounds || itemWeightInPounds < minimumWeight || itemWeightInPounds * 2 !== Math.round(itemWeightInPounds * 2)) {
            res.status(400).json({ error: `Partner subscriptions must be at least ${minimumWeight} lb in half-pound increments.` });
            return;
          }
          if (!/koin blend|ethiopia/i.test(itemName)) {
            res.status(400).json({ error: "Partner subscriptions are available for Koin Blend and Ethiopian coffee." });
            return;
          }
          if (!["B-KOIN-WS", "B-ETH-W-WS"].includes(itemSku)) {
            res.status(400).json({ error: "Partner subscriptions must use the partner coffee SKUs." });
            return;
          }
          const overridePrice = priceOverrides[itemSku];
          if (overridePrice !== undefined) {
            unitAmount = partnerPriceForWeight(overridePrice, weight);
          }
        }
        if (!selectedPlan || !itemSku || !itemName || !weight || !Number.isSafeInteger(unitAmount) || unitAmount < 50) {
          res.status(400).json({ error: "Invalid subscription item." });
          return;
        }
        subscriptions.push({
          id: `sub_${randomUUID()}`, accountId: account.id, plan, ...selectedPlan,
          itemSku, itemName, weight,
          ...(resolvedShippingWeight !== undefined ? { shippingWeight: resolvedShippingWeight } : {}),
          unitAmount, discountPercent: account.label === "consumer" ? 5 : 0,
          freeShipping: account.label === "wholesale" ? false : selectedPlan.freeShipping,
          status: "active", skipNextDelivery: false, createdAt: new Date().toISOString(),
          ...(isLocalPickup ? { isLocalPickup: true, orderPickupId } : {}),
          upcomingRoastDate,
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
        itemsSummary: subscriptions.map((item) => `${item.bagCount}x ${item.itemName} (${item.weight})`).join(", "),
        source: "subscription-checkout",
      };
      batch.set(checkoutRef, { accountId: account.id, paymentIntentId, orderId, subscriptionIds: subscriptions.map((item) => item.id), createdAt: Date.now() });
      batch.set(database().collection("account_orders").doc(order.id), order);
      batch.delete(database().collection("account_order_cache").doc(account.id));
      batch.set(database().collection("accounts").doc(account.id), {
        billing: { stripeCustomerId: customerId, stripePaymentMethodId: paymentMethodId, paymentMethodSavedAt: Date.now() },
        shippingAddress: shippingAddress || null,
        shippingAddressData,
        ...(savedPhone ? { phone: savedPhone } : {}),
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
      const requestedLabel = String(req.body?.label || DEFAULT_ACCOUNT_LABEL).trim() as AccountLabel;
      const partnerLabels: AccountLabel[] = ["wholesale", "church-ministry"];
      if (![DEFAULT_ACCOUNT_LABEL, ...partnerLabels].includes(requestedLabel)) {
        res.status(400).json({ error: "Select a valid account type." });
        return;
      }
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
        label: requestedLabel,
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
        const checkoutData = checkout.data();
        const paymentIntentId = String(checkoutData.paymentIntentId || "");
        if (!paymentIntentId) return;

        const fallbackOrderId = paymentIntentId.slice(-8).toUpperCase();
        const existingOrders = await db.collection("account_orders")
          .where("paymentIntentId", "==", paymentIntentId)
          .get();
        const accountOrders = existingOrders.docs.filter((document) => document.data().accountId === account.id);
        const existingCanonicalOrder = accountOrders.find((document) => document.id !== fallbackOrderId);
        if (existingCanonicalOrder) {
          // Remove the legacy PaymentIntent-suffix duplicate when the real
          // checkout order already exists.
          const fallbackOrder = accountOrders.find((document) => document.id === fallbackOrderId);
          if (fallbackOrder) await fallbackOrder.ref.delete();
          return;
        }

        const storedOrderId = String(checkoutData.orderId || "").trim().toUpperCase();
        const orderId = /^[A-Z0-9]{8}$/.test(storedOrderId) ? storedOrderId : fallbackOrderId;
        const orderRef = db.collection("account_orders").doc(orderId);
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
          subscriptionIds: checkoutData.subscriptionIds || [],
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
          paymentIntentId: text(properties["Transaction ID"]) || undefined,
          itemsSummary: text(properties["Items ordered"]) || undefined,
        };
      });
      const notionItemsByOrderId = new Map(notionOrders.map((order) => [order.id, order.itemsSummary]));
      const enrichedFirestoreOrders = firestoreOrders.map((order) => ({
        ...order,
        itemsSummary: order.itemsSummary || notionItemsByOrderId.get(order.id),
      }));
      const paymentIntentIds = new Set<string>();
      const orders = [...enrichedFirestoreOrders, ...notionOrders]
        .filter((order, index, all) => {
          if (all.findIndex((candidate) => candidate.id === order.id) !== index) return false;
          if (!order.paymentIntentId) return true;
          if (paymentIntentIds.has(order.paymentIntentId)) return false;
          paymentIntentIds.add(order.paymentIntentId);
          return true;
        })
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
        .map((document) => {
          const subscription = document.data() as StoredSubscription;
          return account.label !== "consumer"
            ? { ...subscription, discountPercent: 0, ...(account.label === "wholesale" ? { freeShipping: false } : {}) }
            : subscription;
        })
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
      let unitAmount = Math.round(Number(req.body?.unitAmount) * 100);
      const priceOverrides = await partnerPriceOverridesFor(account);
      const overridePrice = priceOverrides[itemSku];
      if (overridePrice !== undefined) unitAmount = partnerPriceForWeight(overridePrice, weight);
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
        discountPercent: account.label === "consumer" ? 5 : 0,
        freeShipping: account.label === "wholesale" ? false : selectedPlan.freeShipping,
        status: "active",
        skipNextDelivery: false,
        createdAt: new Date().toISOString(),
        upcomingRoastDate: await nextUpcomingRoastSessionDate(),
      };
      await database().collection("account_subscriptions").doc(subscription.id).set(subscription);
      res.status(201).json({ subscription });
    } catch (error: unknown) {
      logger.error("Unable to create subscription", { error: (error as Error).message });
      res.status(500).json({ error: "Unable to create your subscription right now." });
    }
  }

  static async getPartnerPrices(req: Request, res: Response): Promise<void> {
    try {
      const account = await sessionAccount(req);
      if (!account || !isPartnerLabel(account.label)) {
        res.status(401).json({ error: "Please sign in with a partner account." });
        return;
      }
      res.json({ prices: await partnerPriceOverridesFor(account) });
    } catch (error: unknown) {
      logger.error("Unable to load partner price overrides", { error: (error as Error).message });
      res.status(500).json({ error: "Unable to load partner pricing right now." });
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

  static async addSubscriptionAddOn(req: Request, res: Response): Promise<void> {
    try {
      const account = await sessionAccount(req);
      if (!account) {
        res.status(401).json({ error: "Your session has expired. Please log in again." });
        return;
      }
      if (account.label !== "church-ministry") {
        res.status(403).json({ error: "Only Church & Ministry accounts can add coffee to the next subscription round." });
        return;
      }
      const subscriptionId = String(req.params.subscriptionId || "");
      const snapshot = await accountSubscription(account.id, subscriptionId);
      if (!snapshot) {
        res.status(404).json({ error: "Subscription not found." });
        return;
      }
      const addOnWeight = Number(req.body?.addOnWeight);
      const addOnUnitAmount = Math.round(Number(req.body?.addOnUnitAmount) * 100);
      if (!Number.isFinite(addOnWeight) || addOnWeight <= 0 || addOnWeight * 2 !== Math.round(addOnWeight * 2) || !Number.isSafeInteger(addOnUnitAmount) || addOnUnitAmount < 50) {
        res.status(400).json({ error: "Add-ons must be a valid half-pound amount and price." });
        return;
      }
      const current = snapshot.data() as StoredSubscription;
      if (current.status !== "active") {
        res.status(400).json({ error: "Only active subscriptions can receive an add-on." });
        return;
      }
      const subscription: StoredSubscription = {
        ...current,
        addOnWeight: (current.addOnWeight || 0) + addOnWeight,
        addOnUnitAmount: (current.addOnUnitAmount || 0) + addOnUnitAmount,
      };
      await snapshot.ref.update({ addOnWeight: subscription.addOnWeight, addOnUnitAmount: subscription.addOnUnitAmount, updatedAt: Date.now() });
      res.json({ subscription });
    } catch (error: unknown) {
      logger.error("Unable to add subscription coffee", { error: (error as Error).message });
      res.status(500).json({ error: "Unable to add coffee to your next subscription right now." });
    }
  }

  static async logout(req: Request, res: Response): Promise<void> {
    const token = req.header("Authorization")?.replace(/^Bearer\s+/i, "");
    if (token) await database().collection("account_sessions").doc(token).delete();
    res.status(204).send();
  }
}
