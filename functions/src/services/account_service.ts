import {
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "crypto";
import { promisify } from "util";
import { FieldValue } from "firebase-admin/firestore";
import Stripe from "stripe";
import { Request, Response } from "express";
import { createLogger } from "../logger";
import {
  SubscriptionCadence,
  SubscriptionService,
} from "./subscription_domain";
import { getDatabase } from "../integrations/firebase_admin";
import { getNotionClient } from "../integrations/notion/notion_client";
import {
  notionPropertyText,
  notionText,
} from "../integrations/notion/notion_properties";
import { getStripeClient } from "../integrations/stripe/stripe_client";
import { pacificCalendarDate } from "../domain/dates/calendar_dates";
import { EmailService } from "./email_service";
import { weightInPounds } from "../domain/shipping/weight";
import { AccountRepository } from "../repositories/account_repository";
import { SubscriptionRepository } from "../repositories/subscription_repository";
import {
  OrderNowRejected,
  SubscriptionRenewalUseCase,
} from "../application/subscription_renewal_use_case";
import {
  EmailVerification,
  EmailVerificationPurpose,
  EmailVerificationRepository,
} from "../repositories/email_verification_repository";
import { siteUrlFor } from "../config/site";
import { ReviewService } from "./review_service";
import { findReviewedOrderIds } from "../repositories/notion_review_repository";
import { itemRowHtml } from "../integrations/email/email_html";
import { ContentBlock, fetchWebsiteContent } from "./notion_content";

export type AccountLabel =
  | "consumer"
  | "partner"
  | "wholesale"
  | "church-ministry";
export type PartnerAccountLabel = Extract<
  AccountLabel,
  "wholesale" | "church-ministry"
>;
export const DEFAULT_ACCOUNT_LABEL: AccountLabel = "consumer";
export const ACCOUNT_LABEL_PARENTS: Record<AccountLabel, AccountLabel | null> =
  {
    consumer: null,
    partner: null,
    wholesale: "partner",
    "church-ministry": "partner",
  };

const logger = createLogger("accounts");
const scrypt = promisify(scryptCallback);
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
// Used only when the Notion calendar is not configured during local setup.
const FALLBACK_ROAST_SESSION_CALENDAR = ["2026-09-01T09:00:00-07:00"] as const;
export const INITIAL_ROAST_DATE = FALLBACK_ROAST_SESSION_CALENDAR[0];
const ALL_EVENTS_CALENDAR_CACHE_DURATION_MS = 5 * 60 * 1000;
let allEventsCalendarCache: { events: any[]; expiresAt: number } | null = null;
const ALL_EVENTS_DETAILS_CACHE_DURATION_MS = 24 * 60 * 60 * 1000;
let allEventsDetailsCache: {
  events: WebsiteEvent[];
  expiresAt: number;
} | null = null;

export interface WebsiteEvent {
  id: string;
  name: string;
  start: string;
  end: string | null;
  location: string | null;
  body: string;
  /** Structured "Website Description" content (see notion_content.ts). */
  content: ContentBlock[];
}

const getStripe = (): Stripe => {
  return getStripeClient();
};

const database = getDatabase;
const accounts = (): AccountRepository => new AccountRepository(database());
const subscriptions = (): SubscriptionRepository =>
  new SubscriptionRepository(database());
const verifications = (): EmailVerificationRepository =>
  new EmailVerificationRepository(database());

export interface AccountProfile {
  id: string;
  user: { firstName: string; lastName: string; email: string };
  username: string;
  label: AccountLabel;
  // False until the account's email is confirmed through an emailed link.
  emailVerified: boolean;
  // A requested new email; it replaces user.email once its link is confirmed.
  pendingEmail?: string;
}

interface StoredAccount extends Omit<
  AccountProfile,
  "emailVerified" | "pendingEmail"
> {
  passwordHash: string;
  // null until verified. Absent on accounts created before email verification
  // existed; those are treated as verified.
  emailVerifiedAt?: number | null;
  pendingEmail?: string | null;
  verificationSentAt?: number;
  // Emails this account used before. They stay reserved to the account so
  // order history recorded under them remains linked and cannot be claimed.
  previousEmails?: string[];
  phone?: string;
  billing?: {
    stripeCustomerId?: string | null;
    stripePaymentMethodId?: string | null;
  };
  // Subscription renewals ship to shippingAddressData; shippingAddress is its display form.
  shippingAddressData?: ShippingAddressData | null;
  shippingAddress?: string | null;
  billingAddressData?: ShippingAddressData | null;
}

/** Saved addresses returned to the signed-in account holder, never cached in the browser. */
interface SavedAddresses {
  shipping: ShippingAddressData | null;
  billing: ShippingAddressData | null;
}

/** A postal address, used for both shipping and billing. */
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
  accountId?: string;
  customerName?: string;
  email?: string;
  emailNormalized?: string;
  phone?: string;
  totalAmount: number;
  createdAt: string;
  status: "pending" | "completed" | "canceled";
  paymentIntentId?: string;
  itemsSummary?: string;
  items?: Array<{
    name: string;
    sku?: string;
    quantity: number;
    internalQuantity?: number;
    price: number;
    selections?: Record<string, unknown>;
  }>;
  subscriptionIds?: string[];
  source?: string;
  isLocalPickup?: boolean;
  orderPickupId?: string;
  shippingAddress?: string;
  shippingCharged?: number;
  shippingLabelPrice?: number;
  shippingBox?: string;
  shipmentId?: string;
  trackingNumber?: string;
  trackingLabelUrl?: string;
  shippingCarrier?: string | null;
  shippingService?: string | null;
  // True once the order is delivered or picked up (and not refunded), so the customer can review it.
  reviewable?: boolean;
  // True when the customer has reviewed at least one product in the order.
  reviewed?: boolean;
}

type PurchasedItem = NonNullable<Order["items"]>[number];

type SubscriptionPlan =
  | "one-bag-every-session"
  | "two-bags-every-session"
  | "one-bag-every-other-session"
  | "two-bags-every-other-session"
  | "one-bag-every-third-session"
  | "two-bags-every-third-session";

interface Subscription {
  id: string;
  plan: SubscriptionPlan;
  bagCount: 1 | 2;
  cadence: SubscriptionCadence;
  itemSku: string;
  itemName: string;
  weight: string;
  // Product/variant shipping weight in grams, captured at checkout.
  shippingWeight?: number;
  // Final per-bag recurring price in cents, captured at subscription checkout.
  // Renewals use this value directly and never derive it from a past order.
  unitAmount: number;
  discountPercent: number;
  freeShipping: boolean;
  status: "active" | "paused" | "canceled";
  // Roast date (YYYY-MM-DD) the customer skipped; see SubscriptionService.isSkipped.
  skippedRoastDate?: string;
  // Roast date (YYYY-MM-DD) of a pending order-now charge; see SubscriptionService.isOrderNowRequested.
  orderNowRoastDate?: string;
  isLocalPickup?: boolean;
  orderPickupId?: string;
  createdAt: string;
  upcomingRoastDate: string;
  addOnWeight?: number;
  addOnUnitAmount?: number;
}

const subscriptionPlans: Record<
  SubscriptionPlan,
  Pick<Subscription, "bagCount" | "cadence" | "freeShipping">
> = {
  "one-bag-every-session": {
    bagCount: 1,
    cadence: "every-session",
    freeShipping: false,
  },
  "two-bags-every-session": {
    bagCount: 2,
    cadence: "every-session",
    freeShipping: true,
  },
  "one-bag-every-other-session": {
    bagCount: 1,
    cadence: "every-other-session",
    freeShipping: false,
  },
  "two-bags-every-other-session": {
    bagCount: 2,
    cadence: "every-other-session",
    freeShipping: true,
  },
  "one-bag-every-third-session": {
    bagCount: 1,
    cadence: "every-third-session",
    freeShipping: false,
  },
  "two-bags-every-third-session": {
    bagCount: 2,
    cadence: "every-third-session",
    freeShipping: true,
  },
};

const planFor = (
  bagCount: Subscription["bagCount"],
  cadence: SubscriptionCadence,
): SubscriptionPlan =>
  `${bagCount === 2 ? "two-bags" : "one-bag"}-${cadence}` as SubscriptionPlan;

// Mirrors src/util/shipping.ts so recurring shipments use the same box rules
// and weight calculation as EmbeddedCheckout.
const allEventsDatabaseId = (): string | null =>
  process.env.NOTION_ALL_EVENTS_DATABASE_ID || null;

const normalizeRoastDate = (value: string): string | null => {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T09:00:00-07:00`;
  return Number.isNaN(Date.parse(value)) ? null : value;
};

/**
 * Returns website-visible events from the shared Notion calendar.
 * Every website event must include the Website Calendar tag.
 */
export const allEventsCalendar = async (): Promise<any[]> => {
  if (allEventsCalendarCache && allEventsCalendarCache.expiresAt > Date.now())
    return allEventsCalendarCache.events;
  const databaseId = allEventsDatabaseId();
  if (!databaseId) {
    logger.warn(
      "NOTION_ALL_EVENTS_DATABASE_ID is not configured; no website calendar events are available",
    );
    return [];
  }
  const events: any[] = [];
  let startCursor: string | undefined;
  do {
    const response = await getNotion().databases.query({
      database_id: databaseId,
      filter: {
        property: "Tags",
        multi_select: { contains: "Website Calendar" },
      },
      sorts: [{ property: "Date", direction: "ascending" }],
      ...(startCursor ? { start_cursor: startCursor } : {}),
    });
    events.push(...response.results);
    startCursor = response.has_more
      ? response.next_cursor || undefined
      : undefined;
  } while (startCursor);
  allEventsCalendarCache = {
    events,
    expiresAt: Date.now() + ALL_EVENTS_CALENDAR_CACHE_DURATION_MS,
  };
  return events;
};

const notionBlockText = (block: any): string => {
  const content = block?.[block?.type];
  if (!content) return "";
  const text = notionText(content.rich_text);
  switch (block.type) {
    case "heading_1":
      return `# ${text}`;
    case "heading_2":
      return `## ${text}`;
    case "heading_3":
      return `### ${text}`;
    case "bulleted_list_item":
      return `- ${text}`;
    case "numbered_list_item":
      return `1. ${text}`;
    case "quote":
      return `> ${text}`;
    case "to_do":
      return `- [${content.checked ? "x" : " "}] ${text}`;
    case "divider":
      return "---";
    default:
      return text;
  }
};

const fetchEventBlocks = async (pageId: string): Promise<any[]> => {
  const blocks: any[] = [];
  let cursor: string | undefined;
  do {
    const response = await getNotion().blocks.children.list({
      block_id: pageId,
      start_cursor: cursor,
    });
    blocks.push(...response.results);
    cursor = response.has_more ? response.next_cursor || undefined : undefined;
  } while (cursor);
  return blocks;
};

const websiteDescriptionFromBlocks = (blocks: any[]): string => {
  const descriptionHeadingIndex = blocks.findIndex(
    (block) =>
      block.type === "heading_1" &&
      notionBlockText(block).replace(/^#\s*/, "").trim().toLowerCase() ===
        "website description",
  );
  if (descriptionHeadingIndex < 0) return "";
  const descriptionBlocks = blocks.slice(descriptionHeadingIndex + 1);
  const nextHeadingIndex = descriptionBlocks.findIndex(
    (block: any) => block.type === "heading_1",
  );
  return descriptionBlocks
    .slice(0, nextHeadingIndex < 0 ? undefined : nextHeadingIndex)
    .map(notionBlockText)
    .filter(Boolean)
    .join("\n\n");
};

const inferEventLocation = (body: string): string | null => {
  const match = body.match(/(?:📍\s*)?Location:\s*([^\n]+)/i);
  return match?.[1]?.trim() || null;
};

export const getAllEventsCalendarDetails = async (): Promise<
  WebsiteEvent[]
> => {
  if (allEventsDetailsCache && allEventsDetailsCache.expiresAt > Date.now())
    return allEventsDetailsCache.events;
  const pages = await allEventsCalendar();
  const events = await Promise.all(
    pages.map(async (page: any): Promise<WebsiteEvent | null> => {
      const properties = page.properties || {};
      const date = properties.Date?.date;
      if (!date?.start) return null;
      const pageBlocks = await fetchEventBlocks(page.id);
      const fullBody = pageBlocks
        .map(notionBlockText)
        .filter(Boolean)
        .join("\n\n");
      const location =
        notionPropertyText(
          properties.Location ||
            properties["Event Location"] ||
            properties.Venue ||
            properties.Address,
        ) || inferEventLocation(fullBody);
      return {
        id: page.id,
        name:
          notionPropertyText(
            properties.Name || properties.Event || properties.Title,
          ) || "Untitled event",
        start: date.start,
        end: date.end || null,
        location,
        body: websiteDescriptionFromBlocks(pageBlocks),
        content: await fetchWebsiteContent(page.id, pageBlocks),
      };
    }),
  );
  const validEvents = events.filter(
    (event): event is WebsiteEvent => event !== null,
  );
  allEventsDetailsCache = {
    events: validEvents,
    expiresAt: Date.now() + ALL_EVENTS_DETAILS_CACHE_DURATION_MS,
  };
  return validEvents;
};

export const refreshAllEventsCalendar = async (): Promise<void> => {
  allEventsDetailsCache = null;
  allEventsCalendarCache = null;
  await getAllEventsCalendarDetails();
};

export const getRoastSessionCalendar = async (): Promise<string[]> => {
  if (!allEventsDatabaseId()) return [...FALLBACK_ROAST_SESSION_CALENDAR];
  const events = await allEventsCalendar();
  const dates = events
    .filter(
      (page: any) =>
        page.properties?.["Event Type"]?.select?.name === "Roast Schedule",
    )
    .map((page: any) =>
      normalizeRoastDate(page.properties?.Date?.date?.start || ""),
    )
    .filter((date: string | null): date is string => !!date)
    .sort((first, second) => Date.parse(first) - Date.parse(second));
  if (!dates.length)
    throw new Error("The Notion roast-date calendar has no valid Date values");
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
  const exactIndex = calendar.findIndex(
    (date) => date.slice(0, 10) === currentDateKey,
  );
  const currentIndex =
    exactIndex >= 0
      ? exactIndex
      : calendar.reduce(
          (latestIndex, date, index) =>
            date.slice(0, 10) <= currentDateKey ? index : latestIndex,
          -1,
        );
  if (currentIndex < 0) {
    logger.warn(
      "Due subscription date is before the first roast calendar entry",
      { currentRoastDate, currentDateKey, calendar },
    );
    return null;
  }
  return SubscriptionService.nextSession(
    calendar,
    currentRoastDate,
    cadence,
    pacificCalendarDate(),
  );
};

/** The roast a purchase placed now goes into; see SubscriptionService.earliestOpenSession. */
export const nextUpcomingRoastSessionDate = async (): Promise<string> => {
  const calendar = await getRoastSessionCalendar();
  const nextDate = SubscriptionService.earliestOpenSession(
    calendar,
    pacificCalendarDate(),
  );
  if (!nextDate)
    throw new Error("The Notion roast-date calendar has no upcoming dates");
  return nextDate;
};

const isPartnerLabel = (
  label: AccountLabel,
): label is "wholesale" | "church-ministry" =>
  label === "wholesale" || label === "church-ministry";

const getNotion = () => getNotionClient();

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

const subscriptionMirrorDatabaseId = (): string | null =>
  process.env.NOTION_SUBSCRIPTIONS_DATABASE_ID || null;

const normalizedShippingAddress = (
  value: unknown,
): ShippingAddressData | null => {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const line1 = String(input.line1 || "")
    .trim()
    .slice(0, 200);
  const city = String(input.city || "")
    .trim()
    .slice(0, 100);
  const state = String(input.state || "")
    .trim()
    .slice(0, 100);
  const postalCode = String(input.postal_code || "")
    .trim()
    .slice(0, 24);
  const country = String(input.country || "US")
    .trim()
    .toUpperCase()
    .slice(0, 2);
  if (!line1 || !city || !state || !postalCode || !country) return null;
  return {
    line1,
    line2: String(input.line2 || "")
      .trim()
      .slice(0, 200),
    city,
    state,
    postal_code: postalCode,
    country,
  };
};

/** Matches the display format checkout stores for shipping addresses. */
const formatAddress = (address: ShippingAddressData): string =>
  [
    address.line1,
    address.line2,
    address.city,
    address.state,
    address.postal_code,
    address.country,
  ]
    .filter(Boolean)
    .join(", ");

const savedAddresses = (account: StoredAccount): SavedAddresses => ({
  shipping: account.shippingAddressData || null,
  billing: account.billingAddressData || null,
});

/** Current email first, then earlier emails, for order-history lookups. */
const accountEmails = (account: StoredAccount): string[] => [
  ...new Set(
    [account.user.email, ...(account.previousEmails || [])]
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  ),
];

const storedAccount = async (
  accountId: string,
): Promise<StoredAccount | null> =>
  (await accounts().findById(
    accountId,
    DEFAULT_ACCOUNT_LABEL,
  )) as StoredAccount | null;

const text = (property: any): string => {
  if (!property) return "";
  if (property.type === "email") return property.email || "";
  if (property.type === "title")
    return property.title?.map((value: any) => value.plain_text).join("") || "";
  return (
    property.rich_text?.map((value: any) => value.plain_text).join("") || ""
  );
};

/** Delivered or picked up, and not refunded. */
const isReviewableOrderPage = (page: any): boolean => {
  const fulfillment = page.properties?.["Fulfillment"]?.status?.name;
  const payment = page.properties?.["Status"]?.status?.name;
  return (
    (fulfillment === "Delivered" || fulfillment === "Picked up") &&
    payment !== "Refunded"
  );
};

const status = (property: any): Order["status"] => {
  const value = (
    property?.status?.name ||
    property?.select?.name ||
    ""
  ).toLowerCase();
  if (["paid", "completed", "delivered", "shipped"].includes(value))
    return "completed";
  if (["cancelled", "canceled", "refunded"].includes(value)) return "canceled";
  return "pending";
};

const createPasswordHash = async (password: string): Promise<string> => {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${hash.toString("hex")}`;
};

const passwordMatches = async (
  password: string,
  storedHash: string,
): Promise<boolean> => {
  const [algorithm, salt, expected] = storedHash.split(":");
  if (algorithm !== "scrypt" || !salt || !expected) return false;
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  const expectedBuffer = Buffer.from(expected, "hex");
  return (
    expectedBuffer.length === actual.length &&
    timingSafeEqual(expectedBuffer, actual)
  );
};

const findAccount = async (username: string): Promise<StoredAccount | null> => {
  return (await accounts().findByUsername(
    username,
    DEFAULT_ACCOUNT_LABEL,
  )) as StoredAccount | null;
};

const isEmailVerified = (account: StoredAccount): boolean =>
  account.emailVerifiedAt !== null;

const publicProfile = (account: StoredAccount): AccountProfile => ({
  id: account.id,
  user: account.user,
  username: account.username,
  label: account.label || DEFAULT_ACCOUNT_LABEL,
  emailVerified: isEmailVerified(account),
  ...(account.pendingEmail ? { pendingEmail: account.pendingEmail } : {}),
});

const emailKey = (email: string): string =>
  Buffer.from(email).toString("base64url");

const VERIFICATION_RESEND_COOLDOWN_MS = 60 * 1000;

/** Verification emails go to addresses the requester may not own, so each account can send at most one a minute. */
const verificationCooldownActive = (account: StoredAccount): boolean =>
  !!account.verificationSentAt &&
  Date.now() - account.verificationSentAt < VERIFICATION_RESEND_COOLDOWN_MS;

/** Emails a single-use verification link for `email` and records when it was sent. */
const sendVerificationEmail = async (
  account: StoredAccount,
  email: string,
  purpose: EmailVerificationPurpose,
  origin?: string,
): Promise<void> => {
  const token = await verifications().issue(account.id, email, purpose);
  await database()
    .collection("accounts")
    .doc(account.id)
    .update({ verificationSentAt: Date.now() });
  await EmailService.sendEmailVerification({
    toEmail: email,
    customerName: account.user.firstName,
    verificationUrl: `${siteUrlFor(origin)}/verify-email?token=${encodeURIComponent(token)}`,
    purpose,
  });
  logger.info("Email verification sent", { accountId: account.id, purpose });
};

const issueSession = async (account: StoredAccount): Promise<string> => {
  const token = randomBytes(32).toString("base64url");
  await accounts().createSession(
    account.id,
    token,
    Date.now() + SESSION_DURATION_MS,
  );
  return token;
};

export const sessionAccount = async (
  req: Request,
): Promise<AccountProfile | null> => {
  const token = req.header("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const data = await accounts().findSession(token);
  if (!data?.accountId) return null;
  const account = await accounts().findById(
    data.accountId,
    DEFAULT_ACCOUNT_LABEL,
  );
  return account ? publicProfile(account as StoredAccount) : null;
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
const churchMinistryPriceOverrides = async (
  email: string,
): Promise<Record<string, number>> => {
  const databaseId = process.env.NOTION_CHURCH_AND_MINISTRY_DATABASE_ID;
  if (!databaseId || !email) return {};

  const response = await getNotion().databases.query({
    database_id: databaseId,
    filter: { property: "Email", email: { equals: email } },
    page_size: 1,
  });
  const properties = (response.results[0] as any)?.properties || {};
  return Object.entries(PARTNER_PRICE_PROPERTIES).reduce<
    Record<string, number>
  >((overrides, [sku, propertyName]) => {
    const value = properties[propertyName]?.number;
    if (typeof value === "number" && Number.isFinite(value) && value > 0)
      overrides[sku] = value;
    return overrides;
  }, {});
};

// Pricing is matched by email, so it applies only once the account has proven it owns that email.
const partnerPriceOverridesFor = async (
  account: AccountProfile,
): Promise<Record<string, number>> =>
  account.label === "church-ministry" && account.emailVerified
    ? churchMinistryPriceOverrides(account.user.email)
    : {};

const partnerPriceForWeight = (
  pricePerPound: number,
  weight: string,
): number => {
  const pounds = weightInPounds(weight);
  // Capture the final per-delivery amount for the recurring subscription.
  return Math.round(pricePerPound * pounds * 100);
};

type StoredSubscription = Subscription & { accountId: string };

/**
 * One-time in-place migration for subscriptions created before field renames.
 * A legacy `skipNextDelivery: true` becomes a skip of the current upcoming roast.
 */
const migrateSubscriptionDocument = async (
  snapshot: FirebaseFirestore.DocumentSnapshot,
): Promise<StoredSubscription | null> => {
  const value = snapshot.data() as
    | (Partial<StoredSubscription> & {
        nextEligibleRoastAt?: string;
        skipNextDelivery?: boolean;
      })
    | undefined;
  if (!value) return null;
  const record = value as Record<string, unknown>;
  const hasLegacyFields = [
    "nextEligibleRoastAt",
    "nextEligibleSession",
    "renewalLeaseUntil",
    "renewalProcessingDueAt",
    "skipNextDelivery",
  ].some((field) => field in record);
  if (value.upcomingRoastDate && !hasLegacyFields)
    return value as StoredSubscription;
  const upcomingRoastDate =
    value.upcomingRoastDate || value.nextEligibleRoastAt;
  if (!upcomingRoastDate) return null;
  const skippedRoastDate = value.skipNextDelivery
    ? SubscriptionService.roastDateKey(upcomingRoastDate)
    : value.skippedRoastDate;
  const current = { ...value };
  delete current.skipNextDelivery;
  delete current.nextEligibleRoastAt;
  const migration: Record<string, unknown> = {
    nextEligibleRoastAt: FieldValue.delete(),
    nextEligibleSession: FieldValue.delete(),
    renewalLeaseUntil: FieldValue.delete(),
    renewalProcessingDueAt: FieldValue.delete(),
    skipNextDelivery: FieldValue.delete(),
    upcomingRoastDate,
    ...(skippedRoastDate ? { skippedRoastDate } : {}),
  };
  await snapshot.ref.update(migration);
  return {
    ...current,
    upcomingRoastDate,
    ...(skippedRoastDate ? { skippedRoastDate } : {}),
  } as StoredSubscription;
};

const accountSubscription = (accountId: string, subscriptionId: string) =>
  subscriptions().findForAccount(accountId, subscriptionId);

const syncSubscriptionMirror = async (
  subscription: StoredSubscription,
  account: AccountProfile,
): Promise<void> => {
  const databaseId = subscriptionMirrorDatabaseId();
  if (!databaseId) {
    throw new Error("NOTION_SUBSCRIPTIONS_DATABASE_ID is not configured");
  }

  try {
    const notion = getNotion();
    const properties = {
      Name: {
        title: [
          {
            text: {
              content:
                `${account.user.firstName} ${account.user.lastName}`.trim(),
            },
          },
        ],
      },
      "Subscription ID": {
        rich_text: [{ text: { content: subscription.id } }],
      },
      "Account ID": {
        rich_text: [{ text: { content: subscription.accountId } }],
      },
      Plan: { rich_text: [{ text: { content: subscription.plan } }] },
      "Bag Count": { number: subscription.bagCount },
      Cadence: { rich_text: [{ text: { content: subscription.cadence } }] },
      "Item SKU": { rich_text: [{ text: { content: subscription.itemSku } }] },
      "Item Name": {
        rich_text: [{ text: { content: subscription.itemName } }],
      },
      Weight: { rich_text: [{ text: { content: subscription.weight } }] },
      "Discount Percent": { number: subscription.discountPercent },
      "Free Shipping": { checkbox: subscription.freeShipping },
      Status: { select: { name: subscription.status } },
      "Skip Next Delivery": {
        checkbox: SubscriptionService.isSkipped(subscription),
      },
      "Created At": { date: { start: subscription.createdAt } },
      "Upcoming Roast Date": {
        date: { start: subscription.upcomingRoastDate || INITIAL_ROAST_DATE },
      },
    };
    const response = await notion.databases.query({
      database_id: databaseId,
      filter: {
        property: "Subscription ID",
        rich_text: { equals: subscription.id },
      },
    });
    const page = response.results[0];
    if (page) {
      await notion.pages.update({ page_id: page.id, properties });
      logger.info("Subscription mirror updated in Notion", {
        subscriptionId: subscription.id,
        operation: "update",
      });
    } else {
      await notion.pages.create({
        parent: { database_id: databaseId },
        properties,
      });
      logger.info("Subscription mirror created in Notion", {
        subscriptionId: subscription.id,
        operation: "create",
      });
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
    const snapshots = await database()
      .collection("account_subscriptions")
      .get();
    await Promise.all(snapshots.docs.map(migrateSubscriptionDocument));
  }

  /** Returns subscriptions due for a charge or a skip advance. Processing is invoked separately. */
  static async getDueSubscriptionIds(
    subscriptionId?: string,
  ): Promise<string[]> {
    if (subscriptionId) {
      const snapshot = await database()
        .collection("account_subscriptions")
        .doc(subscriptionId)
        .get();
      const subscription = await migrateSubscriptionDocument(snapshot);
      return subscription &&
        SubscriptionService.dueAction(subscription) !== "none"
        ? [subscriptionId]
        : [];
    }
    const response = await database()
      .collection("account_subscriptions")
      .where("status", "==", "active")
      .get();
    const subscriptions = await Promise.all(
      response.docs.map(migrateSubscriptionDocument),
    );
    return subscriptions
      .filter(
        (subscription): subscription is StoredSubscription => !!subscription,
      )
      .filter(
        (subscription) =>
          SubscriptionService.dueAction(subscription) !== "none",
      )
      .map((subscription) => subscription.id);
  }

  static async checkDueSubscriptions(subscriptionId?: string): Promise<void> {
    if (!subscriptionId) await AccountService.migrateLegacySubscriptionFields();
    if (!subscriptionId) await AccountService.sendRenewalReminders();
    const dueSubscriptionIds =
      await AccountService.getDueSubscriptionIds(subscriptionId);
    logger.info("Subscription due-date check completed", {
      scope: subscriptionId ? "single-subscription" : "all-subscriptions",
      dueCount: dueSubscriptionIds.length,
      dueSubscriptionIds,
    });
    await Promise.all(
      dueSubscriptionIds.map((id) => AccountService.processDueSubscription(id)),
    );
  }

  /** Sends one reminder per renewable subscription/roast three calendar days before the roast. */
  static async sendRenewalReminders(): Promise<void> {
    const snapshots = await database()
      .collection("account_subscriptions")
      .where("status", "==", "active")
      .get();
    await Promise.all(
      snapshots.docs.map(async (snapshot) => {
        const subscription = await migrateSubscriptionDocument(snapshot);
        if (!subscription || !SubscriptionService.isReminderDue(subscription))
          return;
        const roastDate = SubscriptionService.roastDateKey(
          subscription.upcomingRoastDate,
        );
        if ((snapshot.data() as any).renewalReminderForRoastDate === roastDate)
          return;
        const accountSnapshot = await database()
          .collection("accounts")
          .doc(subscription.accountId)
          .get();
        const account = accountSnapshot.data() as
          | (StoredAccount & { shippingAddress?: string })
          | undefined;
        if (!account) return;
        const totalAmount =
          (subscription.unitAmount * subscription.bagCount +
            (subscription.addOnUnitAmount || 0)) /
          100;
        try {
          await EmailService.sendSubscriptionRenewalReminder({
            toEmail: account.user.email,
            customerName:
              `${account.user.firstName} ${account.user.lastName}`.trim(),
            renewalDate: roastDate,
            deliveryMethod: subscription.isLocalPickup
              ? "Local Pickup"
              : "Shipping",
            totalAmount,
            itemsHtml: itemRowHtml({
              name: `${subscription.bagCount}x ${subscription.itemName} (${subscription.weight})`,
            }),
            manageSubscriptionUrl: "https://koinoniacoffeeproject.com/account",
          });
          await snapshot.ref.update({
            renewalReminderForRoastDate: roastDate,
            renewalReminderSentAt: new Date().toISOString(),
          });
        } catch (error) {
          logger.error("Subscription renewal reminder failed", {
            subscriptionId: subscription.id,
            error: (error as Error).message,
          });
        }
      }),
    );
  }

  static async processDueSubscription(subscriptionId: string): Promise<void> {
    await new SubscriptionRenewalUseCase(database()).execute(subscriptionId);
  }

  /**
   * Firestore is authoritative. The Firestore write trigger calls this method
   * to keep Notion's operations view aligned with the latest subscription.
   */
  static async syncSubscriptionMirrorById(
    subscriptionId: string,
  ): Promise<void> {
    const subscriptionSnapshot = await database()
      .collection("account_subscriptions")
      .doc(subscriptionId)
      .get();
    if (!subscriptionSnapshot.exists) return;

    const subscription = subscriptionSnapshot.data() as StoredSubscription;
    logger.info("Syncing subscription mirror to Notion", {
      subscriptionId,
      accountId: subscription.accountId,
    });
    const accountSnapshot = await database()
      .collection("accounts")
      .doc(subscription.accountId)
      .get();
    if (!accountSnapshot.exists) {
      logger.warn(
        "Subscription mirror skipped because its account was not found",
        { subscriptionId, accountId: subscription.accountId },
      );
      return;
    }
    await syncSubscriptionMirror(
      subscription,
      publicProfile(accountSnapshot.data() as StoredAccount),
    );
  }

  static async syncOrderMirrorById(orderId: string): Promise<void> {
    const orderSnapshot = await database()
      .collection("orders")
      .doc(orderId)
      .get();
    if (!orderSnapshot.exists) return;
    const order = orderSnapshot.data() as Order;
    if (!order.accountId) return;
    const accountSnapshot = await database()
      .collection("accounts")
      .doc(order.accountId)
      .get();
    if (!accountSnapshot.exists) return;
    const storedAccount = accountSnapshot.data() as StoredAccount & {
      phone?: string;
    };
    const account = publicProfile(storedAccount);
    const databaseId = process.env.NOTION_ONLINE_ORDERS_DATABASE_ID;
    if (!databaseId)
      throw new Error("NOTION_ONLINE_ORDERS_DATABASE_ID is not configured");

    const items = order.items || [];
    const subscriptions = order.subscriptionIds?.length
      ? (
          await Promise.all(
            order.subscriptionIds.map(async (subscriptionId) => {
              const snapshot = await database()
                .collection("account_subscriptions")
                .doc(subscriptionId)
                .get();
              return snapshot.exists ? (snapshot.data() as Subscription) : null;
            }),
          )
        ).filter((subscription): subscription is Subscription => !!subscription)
      : [];
    const subscriptionBySku = new Map(
      subscriptions.map((subscription) => [subscription.itemSku, subscription]),
    );
    const orderLines = items.map((item) => {
      const subscription = item.sku
        ? subscriptionBySku.get(item.sku)
        : undefined;
      const subscriptionLabel = subscription
        ? ` — Subscription ${subscription.id} (${subscription.plan})`
        : "";
      return `${item.quantity}x ${item.name}${item.selections?.weight ? ` (${item.selections.weight})` : ""}${subscriptionLabel}`;
    });
    const itemsOrdered = orderLines.length
      ? orderLines.join("\\n")
      : order.itemsSummary || "";
    const itemsOrderedFormatted = items
      .map((item) => {
        const variation = item.selections?.weight
          ? ` (${item.selections.weight})`
          : "";
        const subscription = item.sku
          ? subscriptionBySku.get(item.sku)
          : undefined;
        const subscriptionLabel = subscription
          ? `,subscription:${subscription.id}`
          : "";
        return `${item.name}${variation},${item.sku || ""},${item.internalQuantity ?? item.quantity}${subscriptionLabel}`;
      })
      .join("\\n");
    const notion = getNotion();
    const properties: Record<string, unknown> = {
      Customer: {
        title: [
          {
            text: {
              content:
                `${account.user.firstName} ${account.user.lastName}`.trim(),
            },
          },
        ],
      },
      "Order #": { rich_text: [{ text: { content: order.id } }] },
      Status: { status: { name: "Paid" } },
      Fulfillment: { status: { name: "Pending" } },
      "Local Pickup": { checkbox: order.isLocalPickup === true },
      "Order Pickup ID": {
        rich_text: [{ text: { content: order.orderPickupId || "" } }],
      },
      "Items ordered": { rich_text: [{ text: { content: itemsOrdered } }] },
      "Items ordered formatted": {
        rich_text: [{ text: { content: itemsOrderedFormatted } }],
      },
      Email: { email: account.user.email },
      Phone: { phone_number: storedAccount.phone || null },
      "Shipping address": {
        rich_text: [{ text: { content: order.shippingAddress || "N/A" } }],
      },
      "Shipping Price": {
        number: order.shippingLabelPrice ?? order.shippingCharged ?? 0,
      },
      ...(order.shippingBox
        ? {
            "Shipping Box": {
              rich_text: [{ text: { content: order.shippingBox } }],
            },
          }
        : {}),
      ...(order.trackingNumber
        ? {
            "Tracking Info": {
              rich_text: [{ text: { content: order.trackingNumber } }],
            },
          }
        : {}),
      ...(order.shipmentId
        ? {
            "Shipment ID": {
              rich_text: [{ text: { content: order.shipmentId } }],
            },
          }
        : {}),
      ...(order.shippingCarrier
        ? {
            "Tracking Carrier": {
              select: { name: carrierDisplayName(order.shippingCarrier) },
            },
          }
        : {}),
      ...(order.shippingService
        ? {
            "Carrier Type": {
              select: { name: serviceDisplayName(order.shippingService) },
            },
          }
        : {}),
      ...(order.trackingLabelUrl
        ? { "Tracking Label": { url: order.trackingLabelUrl } }
        : {}),
      "Transaction ID": {
        rich_text: [{ text: { content: order.paymentIntentId || order.id } }],
      },
      Receipt: {
        url: order.paymentIntentId
          ? `https://dashboard.stripe.com/payments/${order.paymentIntentId}`
          : null,
      },
      Total: { number: order.totalAmount },
      "Order created": { date: { start: order.createdAt } },
    };
    const existing = await notion.databases.query({
      database_id: databaseId,
      filter: { property: "Order #", rich_text: { equals: order.id } },
    });
    if (existing.results.length) {
      await notion.pages.update({
        page_id: existing.results[0].id,
        properties: properties as any,
      });
      logger.info("Order mirror updated in Notion", { orderId });
    } else {
      await notion.pages.create({
        parent: { database_id: databaseId },
        properties: properties as any,
      });
      logger.info("Order mirror created in Notion", { orderId });
    }
  }

  /** Link guest orders to an account once its email is verified, and on later account updates. */
  static async linkOrdersToAccount(accountId: string): Promise<void> {
    const accountSnapshot = await database()
      .collection("accounts")
      .doc(accountId)
      .get();
    if (!accountSnapshot.exists) return;
    const account = accountSnapshot.data() as StoredAccount;
    const email = account.user.email.trim().toLowerCase();
    // Guest orders carry names and addresses; link them only to an owner of the email.
    if (!email || !isEmailVerified(account)) return;

    // Read/filter instead of relying only on emailNormalized so older orders
    // imported before that field existed are linked as well.
    const orderSnapshots = await database().collection("orders").get();
    const matchingOrders = orderSnapshots.docs.filter((order) => {
      const data = order.data() as Order;
      return (
        (data.emailNormalized || data.email || "").trim().toLowerCase() ===
        email
      );
    });
    if (!matchingOrders.length) return;

    const batch = database().batch();
    matchingOrders.forEach((order) =>
      batch.set(
        order.ref,
        {
          accountId,
          emailNormalized: email,
        },
        { merge: true },
      ),
    );
    await batch.commit();
    logger.info("Linked historical orders to account", {
      accountId,
      email,
      orderCount: matchingOrders.length,
    });
  }

  static async completeSubscriptionCheckout(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const account = await sessionAccount(req);
      if (!account) {
        res
          .status(401)
          .json({ error: "Your session has expired. Please log in again." });
        return;
      }
      const paymentIntentId = String(req.body?.paymentIntentId || "");
      const requestedOrderId = String(req.body?.orderId || "")
        .trim()
        .toUpperCase();
      const customerPhone = String(req.body?.customerPhone || "")
        .trim()
        .slice(0, 40);
      const items = Array.isArray(req.body?.subscriptionItems)
        ? req.body.subscriptionItems
        : [];
      const orderItems = Array.isArray(req.body?.orderItems)
        ? req.body.orderItems
        : [];
      const shippingAddress = String(req.body?.shippingAddress || "")
        .trim()
        .slice(0, 500);
      const shippingAddressData = normalizedShippingAddress(
        req.body?.shippingAddressData,
      );
      const isLocalPickup = req.body?.isLocalPickup === true;
      const orderPickupId = String(req.body?.orderPickupId || "")
        .trim()
        .slice(0, 120);
      const shippingAmount = Number(req.body?.shippingAmount);
      const submittedShipment =
        req.body?.shipmentData && typeof req.body.shipmentData === "object"
          ? req.body.shipmentData
          : null;
      if (!paymentIntentId || items.length === 0) {
        res
          .status(400)
          .json({ error: "A paid subscription checkout is required." });
        return;
      }
      if (!isLocalPickup && !shippingAddressData) {
        res.status(400).json({
          error: "A complete shipping address is required for a subscription.",
        });
        return;
      }
      if (isLocalPickup && !orderPickupId) {
        res.status(400).json({
          error: "A pickup option is required for a local-pickup subscription.",
        });
        return;
      }
      const paymentIntent =
        await getStripe().paymentIntents.retrieve(paymentIntentId);
      if (
        paymentIntent.status !== "succeeded" ||
        paymentIntent.metadata.accountId !== account.id
      ) {
        res
          .status(400)
          .json({ error: "Payment could not be verified for this account." });
        return;
      }

      const checkoutRef = database()
        .collection("subscription_checkouts")
        .doc(paymentIntentId);
      const existing = await checkoutRef.get();
      if (existing.exists) {
        res.json({
          created: false,
          subscriptionIds: existing.data()?.subscriptionIds || [],
        });
        return;
      }
      const paymentMethodId =
        typeof paymentIntent.payment_method === "string"
          ? paymentIntent.payment_method
          : null;
      const customerId =
        typeof paymentIntent.customer === "string"
          ? paymentIntent.customer
          : null;
      const paymentMethod = paymentMethodId
        ? await getStripe().paymentMethods.retrieve(paymentMethodId)
        : null;
      const stripeCustomer = customerId
        ? await getStripe().customers.retrieve(customerId)
        : null;
      const stripeCustomerPhone =
        stripeCustomer && !stripeCustomer.deleted ? stripeCustomer.phone : "";
      const savedPhone = (
        customerPhone ||
        paymentIntent.shipping?.phone ||
        paymentMethod?.billing_details?.phone ||
        stripeCustomerPhone ||
        ""
      )
        .trim()
        .slice(0, 40);
      if (customerId && savedPhone)
        await getStripe().customers.update(customerId, { phone: savedPhone });
      // The checkout payment covers this roast; renewals start after it.
      const checkoutRoastDate = await nextUpcomingRoastSessionDate();
      const priceOverrides = await partnerPriceOverridesFor(account);
      const subscriptions: StoredSubscription[] = [];
      for (const item of items) {
        const plan = String(item?.plan || "") as SubscriptionPlan;
        const selectedPlan = subscriptionPlans[plan];
        const itemSku = String(item?.itemSku || "")
          .trim()
          .slice(0, 120);
        const itemName = String(item?.itemName || "")
          .trim()
          .slice(0, 120);
        const weight = String(item?.weight || "")
          .trim()
          .slice(0, 40);
        const shippingWeight = Number(item?.shippingWeight);
        let unitAmount = Math.round(Number(item?.unitAmount) * 100);
        const itemWeightInPounds = weightInPounds(weight);
        const resolvedShippingWeight =
          Number.isFinite(shippingWeight) && shippingWeight > 0
            ? shippingWeight
            : itemWeightInPounds > 0
              ? itemWeightInPounds * 453.592
              : undefined;
        if (isPartnerLabel(account.label)) {
          const minimumWeight = account.label === "wholesale" ? 5 : 1;
          if (
            !itemWeightInPounds ||
            itemWeightInPounds < minimumWeight ||
            itemWeightInPounds * 2 !== Math.round(itemWeightInPounds * 2)
          ) {
            res.status(400).json({
              error: `Partner subscriptions must be at least ${minimumWeight} lb in half-pound increments.`,
            });
            return;
          }
          if (!/koin blend|ethiopia/i.test(itemName)) {
            res.status(400).json({
              error:
                "Partner subscriptions are available for Koin Blend and Ethiopian coffee.",
            });
            return;
          }
          if (!["B-KOIN-WS", "B-ETH-W-WS"].includes(itemSku)) {
            res.status(400).json({
              error: "Partner subscriptions must use the partner coffee SKUs.",
            });
            return;
          }
          const overridePrice = priceOverrides[itemSku];
          if (overridePrice !== undefined) {
            unitAmount = partnerPriceForWeight(overridePrice, weight);
          }
        }
        if (
          !selectedPlan ||
          !itemSku ||
          !itemName ||
          !weight ||
          !Number.isSafeInteger(unitAmount) ||
          unitAmount < 50
        ) {
          res.status(400).json({ error: "Invalid subscription item." });
          return;
        }
        const firstRenewalRoastDate = await nextRoastSessionDate(
          checkoutRoastDate,
          selectedPlan.cadence,
        );
        if (!firstRenewalRoastDate)
          logger.warn(
            "No roast after the checkout roast in the calendar; skipping the checkout roast so it is not charged twice",
            { checkoutRoastDate },
          );
        subscriptions.push({
          id: `sub_${randomUUID()}`,
          accountId: account.id,
          plan,
          ...selectedPlan,
          itemSku,
          itemName,
          weight,
          ...(resolvedShippingWeight !== undefined
            ? { shippingWeight: resolvedShippingWeight }
            : {}),
          unitAmount,
          discountPercent: account.label === "consumer" ? 5 : 0,
          freeShipping:
            account.label === "wholesale" ? false : selectedPlan.freeShipping,
          status: "active",
          createdAt: new Date().toISOString(),
          ...(isLocalPickup ? { isLocalPickup: true, orderPickupId } : {}),
          ...(firstRenewalRoastDate
            ? { upcomingRoastDate: firstRenewalRoastDate }
            : {
                upcomingRoastDate: checkoutRoastDate,
                skippedRoastDate:
                  SubscriptionService.roastDateKey(checkoutRoastDate),
              }),
        });
      }
      const batch = database().batch();
      const orderId = /^[A-Z0-9]{8}$/.test(requestedOrderId)
        ? requestedOrderId
        : paymentIntentId.slice(-8).toUpperCase();
      const order: Order & {
        paymentIntentId: string;
        subscriptionIds: string[];
        source: "subscription-checkout";
      } = {
        id: orderId,
        accountId: account.id,
        customerName:
          `${account.user.firstName} ${account.user.lastName}`.trim(),
        email: account.user.email,
        emailNormalized: account.user.email.toLowerCase(),
        phone: savedPhone || undefined,
        totalAmount: paymentIntent.amount_received / 100,
        createdAt: new Date(paymentIntent.created * 1000).toISOString(),
        status: "completed",
        paymentIntentId,
        subscriptionIds: subscriptions.map((item) => item.id),
        itemsSummary: orderItems.length
          ? orderItems
              .map(
                (item: PurchasedItem) =>
                  `${item.quantity}x ${item.name}${item.selections?.weight ? ` (${item.selections.weight})` : ""}`,
              )
              .join(", ")
          : subscriptions
              .map(
                (item) => `${item.bagCount}x ${item.itemName} (${item.weight})`,
              )
              .join(", "),
        ...(orderItems.length ? { items: orderItems } : {}),
        isLocalPickup,
        ...(orderPickupId ? { orderPickupId } : {}),
        ...(shippingAddress ? { shippingAddress } : {}),
        ...(Number.isFinite(shippingAmount)
          ? { shippingCharged: shippingAmount }
          : {}),
        ...(submittedShipment
          ? {
              ...(Number.isFinite(Number(submittedShipment.shippingPrice))
                ? {
                    shippingLabelPrice: Number(submittedShipment.shippingPrice),
                  }
                : {}),
              ...(submittedShipment.boxSize
                ? {
                    shippingBox: String(submittedShipment.boxSize).slice(0, 80),
                  }
                : {}),
              ...(submittedShipment.shipmentId
                ? {
                    shipmentId: String(submittedShipment.shipmentId).slice(
                      0,
                      120,
                    ),
                  }
                : {}),
              ...(submittedShipment.trackingNumber
                ? {
                    trackingNumber: String(
                      submittedShipment.trackingNumber,
                    ).slice(0, 120),
                  }
                : {}),
              ...(submittedShipment.labelUrl
                ? {
                    trackingLabelUrl: String(submittedShipment.labelUrl).slice(
                      0,
                      500,
                    ),
                  }
                : {}),
              ...(submittedShipment.carrier
                ? {
                    shippingCarrier: String(submittedShipment.carrier).slice(
                      0,
                      80,
                    ),
                  }
                : {}),
              ...(submittedShipment.service
                ? {
                    shippingService: String(submittedShipment.service).slice(
                      0,
                      80,
                    ),
                  }
                : {}),
            }
          : {}),
        source: "subscription-checkout",
      };
      batch.set(checkoutRef, {
        accountId: account.id,
        paymentIntentId,
        orderId,
        subscriptionIds: subscriptions.map((item) => item.id),
        createdAt: Date.now(),
      });
      batch.set(database().collection("orders").doc(order.id), order);
      batch.delete(
        database().collection("account_order_cache").doc(account.id),
      );
      batch.set(
        database().collection("accounts").doc(account.id),
        {
          billing: {
            stripeCustomerId: customerId,
            stripePaymentMethodId: paymentMethodId,
            paymentMethodSavedAt: Date.now(),
          },
          shippingAddress: shippingAddress || null,
          shippingAddressData,
          ...(savedPhone ? { phone: savedPhone } : {}),
          updatedAt: Date.now(),
        },
        { merge: true },
      );
      subscriptions.forEach((subscription) =>
        batch.set(
          database().collection("account_subscriptions").doc(subscription.id),
          subscription,
        ),
      );
      await batch.commit();
      res.status(201).json({
        created: true,
        subscriptionIds: subscriptions.map((item) => item.id),
      });
    } catch (error: unknown) {
      logger.error("Unable to complete subscription checkout", {
        error: (error as Error).message,
      });
      res
        .status(500)
        .json({ error: "Unable to activate your subscription right now." });
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
      if (
        !account ||
        !(await passwordMatches(password, account.passwordHash))
      ) {
        res.status(401).json({ error: "Invalid username or password." });
        return;
      }
      res.json({
        account: publicProfile(account),
        token: await issueSession(account),
      });
    } catch (error: unknown) {
      logger.error("Unable to log in", { error: (error as Error).message });
      res.status(500).json({ error: "Unable to log in right now." });
    }
  }

  static async createAccount(req: Request, res: Response): Promise<void> {
    try {
      const firstName = String(req.body?.firstName || "").trim();
      const lastName = String(req.body?.lastName || "").trim();
      const email = String(req.body?.email || "")
        .trim()
        .toLowerCase();
      const username = String(req.body?.username || email).trim();
      const password = String(req.body?.password || "");
      const requestedLabel = String(
        req.body?.label || DEFAULT_ACCOUNT_LABEL,
      ).trim() as AccountLabel;
      const partnerLabels: AccountLabel[] = ["wholesale", "church-ministry"];
      if (![DEFAULT_ACCOUNT_LABEL, ...partnerLabels].includes(requestedLabel)) {
        res.status(400).json({ error: "Select a valid account type." });
        return;
      }
      if (
        !firstName ||
        !lastName ||
        !email ||
        !username ||
        password.length < 8 ||
        !/^\S+@\S+\.\S+$/.test(email)
      ) {
        res.status(400).json({
          error:
            "Enter a name, valid email, username, and password of at least 8 characters.",
        });
        return;
      }
      const accountId = `acct_${randomUUID()}`;
      const normalizedUsername = username.toLowerCase();
      const usernameKey = Buffer.from(normalizedUsername).toString("base64url");
      const account: StoredAccount = {
        id: accountId,
        user: { firstName, lastName, email },
        username,
        label: requestedLabel,
        passwordHash: await createPasswordHash(password),
        emailVerifiedAt: null,
      };
      const created = await database().runTransaction(async (transaction) => {
        const usernameRef = database()
          .collection("account_usernames")
          .doc(usernameKey);
        const emailRef = database()
          .collection("account_emails")
          .doc(emailKey(email));
        const accountRef = database().collection("accounts").doc(accountId);
        const [usernameSnapshot, emailSnapshot] = await Promise.all([
          transaction.get(usernameRef),
          transaction.get(emailRef),
        ]);
        if (usernameSnapshot.exists || emailSnapshot.exists) return false;
        transaction.set(accountRef, { ...account, createdAt: Date.now() });
        transaction.set(usernameRef, {
          accountId,
          username: normalizedUsername,
        });
        transaction.set(emailRef, { accountId, email });
        return true;
      });
      if (!created) {
        res
          .status(409)
          .json({ error: "That username or email is already in use." });
        return;
      }
      const token = await issueSession(account);
      // The account works right away; guest-order linking and partner pricing wait for verification.
      const verificationSent = await sendVerificationEmail(
        account,
        email,
        "signup",
        req.header("Origin"),
      )
        .then(() => true)
        .catch((error: Error) => {
          logger.error("Unable to send signup verification email", {
            accountId,
            error: error.message,
          });
          return false;
        });
      res
        .status(201)
        .json({ account: publicProfile(account), token, verificationSent });
    } catch (error: unknown) {
      logger.error("Unable to create account", {
        error: (error as Error).message,
      });
      res.status(500).json({ error: "Unable to create an account right now." });
    }
  }

  static async getOrders(req: Request, res: Response): Promise<void> {
    try {
      const account = await sessionAccount(req);
      if (!account) {
        res
          .status(401)
          .json({ error: "Your session has expired. Please log in again." });
        return;
      }
      const db = database();
      // Backfill order history for subscription checkouts completed before we
      // began writing orders. Stripe remains the source for the amount.
      const checkoutSnapshots = await db
        .collection("subscription_checkouts")
        .where("accountId", "==", account.id)
        .get();
      await Promise.all(
        checkoutSnapshots.docs.map(async (checkout) => {
          const checkoutData = checkout.data();
          const paymentIntentId = String(checkoutData.paymentIntentId || "");
          if (!paymentIntentId) return;

          const fallbackOrderId = paymentIntentId.slice(-8).toUpperCase();
          const existingOrders = await db
            .collection("orders")
            .where("paymentIntentId", "==", paymentIntentId)
            .get();
          const accountOrders = existingOrders.docs.filter(
            (document) => document.data().accountId === account.id,
          );
          const existingCanonicalOrder = accountOrders.find(
            (document) => document.id !== fallbackOrderId,
          );
          if (existingCanonicalOrder) {
            // Remove the legacy PaymentIntent-suffix duplicate when the real
            // checkout order already exists.
            const fallbackOrder = accountOrders.find(
              (document) => document.id === fallbackOrderId,
            );
            if (fallbackOrder) await fallbackOrder.ref.delete();
            return;
          }

          const storedOrderId = String(checkoutData.orderId || "")
            .trim()
            .toUpperCase();
          const orderId = /^[A-Z0-9]{8}$/.test(storedOrderId)
            ? storedOrderId
            : fallbackOrderId;
          const orderRef = db.collection("orders").doc(orderId);
          if ((await orderRef.get()).exists) return;
          const paymentIntent =
            await getStripe().paymentIntents.retrieve(paymentIntentId);
          if (
            paymentIntent.status !== "succeeded" ||
            paymentIntent.metadata.accountId !== account.id
          )
            return;
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
        }),
      );

      const accountOrderSnapshots = await db
        .collection("orders")
        .where("accountId", "==", account.id)
        .get();
      const firestoreOrders = accountOrderSnapshots.docs.map(
        (document) => document.data() as Order,
      );
      const notionDatabaseId = process.env.NOTION_ONLINE_ORDERS_DATABASE_ID;
      const stored = await storedAccount(account.id);
      const emailFilters = (
        stored ? accountEmails(stored) : [account.user.email]
      ).map((email) => ({ property: "Email", email: { equals: email } }));
      const notionOrders: Order[] = !notionDatabaseId
        ? []
        : (
            await getNotion().databases.query({
              database_id: notionDatabaseId,
              filter:
                emailFilters.length === 1
                  ? emailFilters[0]
                  : { or: emailFilters },
              sorts: [{ property: "Order created", direction: "descending" }],
            })
          ).results.map((page: any) => {
            const properties = page.properties || {};
            return {
              id: text(properties["Order #"]) || page.id,
              accountId: account.id,
              totalAmount: properties.Total?.number || 0,
              createdAt:
                properties["Order created"]?.date?.start || page.created_time,
              status: status(properties.Status),
              paymentIntentId: text(properties["Transaction ID"]) || undefined,
              itemsSummary: text(properties["Items ordered"]) || undefined,
              reviewable: isReviewableOrderPage(page),
            };
          });
      const notionItemsByOrderId = new Map(
        notionOrders.map((order) => [order.id, order.itemsSummary]),
      );
      const notionReviewableByOrderId = new Map(
        notionOrders.map((order) => [order.id, order.reviewable]),
      );
      const enrichedFirestoreOrders = firestoreOrders.map((order) => ({
        ...order,
        itemsSummary: order.itemsSummary || notionItemsByOrderId.get(order.id),
        reviewable: notionReviewableByOrderId.get(order.id) || false,
      }));
      const paymentIntentIds = new Set<string>();
      const orders = [...enrichedFirestoreOrders, ...notionOrders]
        .filter((order, index, all) => {
          if (all.findIndex((candidate) => candidate.id === order.id) !== index)
            return false;
          if (!order.paymentIntentId) return true;
          if (paymentIntentIds.has(order.paymentIntentId)) return false;
          paymentIntentIds.add(order.paymentIntentId);
          return true;
        })
        .sort((first, second) =>
          second.createdAt.localeCompare(first.createdAt),
        );
      // A review lookup failure shouldn't hide the order history.
      const reviewedIds = await findReviewedOrderIds(
        orders.filter((order) => order.reviewable).map((order) => order.id),
      ).catch((error: Error) => {
        logger.warn("Unable to check reviewed orders", {
          error: error.message,
        });
        return new Set<string>();
      });
      res.json({
        orders: orders.map((order) => ({
          ...order,
          reviewed: reviewedIds.has(order.id),
        })),
      });
    } catch (error: unknown) {
      logger.error("Unable to get account orders", {
        error: (error as Error).message,
      });
      res.status(500).json({ error: "Unable to load orders right now." });
    }
  }

  static async getSubscriptions(req: Request, res: Response): Promise<void> {
    try {
      const account = await sessionAccount(req);
      if (!account) {
        res
          .status(401)
          .json({ error: "Your session has expired. Please log in again." });
        return;
      }
      const response = await subscriptions().listForAccount(account.id);
      const accountSubscriptions = response
        .map((document) => {
          const subscription = document.data() as StoredSubscription;
          return account.label !== "consumer"
            ? {
                ...subscription,
                discountPercent: 0,
                ...(account.label === "wholesale"
                  ? { freeShipping: false }
                  : {}),
              }
            : subscription;
        })
        .sort((first, second) =>
          second.createdAt.localeCompare(first.createdAt),
        );
      res.json({ subscriptions: accountSubscriptions });
    } catch (error: unknown) {
      logger.error("Unable to get subscriptions", {
        error: (error as Error).message,
      });
      res
        .status(500)
        .json({ error: "Unable to load subscriptions right now." });
    }
  }

  static async createSubscription(req: Request, res: Response): Promise<void> {
    try {
      const account = await sessionAccount(req);
      if (!account) {
        res
          .status(401)
          .json({ error: "Your session has expired. Please log in again." });
        return;
      }
      const plan = String(req.body?.plan || "") as SubscriptionPlan;
      const selectedPlan = subscriptionPlans[plan];
      if (!selectedPlan) {
        res.status(400).json({ error: "Choose a valid subscription plan." });
        return;
      }
      const itemSku = String(req.body?.itemSku || "")
        .trim()
        .slice(0, 120);
      const itemName = String(req.body?.itemName || "")
        .trim()
        .slice(0, 120);
      const weight = String(req.body?.weight || "")
        .trim()
        .slice(0, 40);
      let unitAmount = Math.round(Number(req.body?.unitAmount) * 100);
      const priceOverrides = await partnerPriceOverridesFor(account);
      const overridePrice = priceOverrides[itemSku];
      if (overridePrice !== undefined)
        unitAmount = partnerPriceForWeight(overridePrice, weight);
      if (
        !itemSku ||
        !itemName ||
        !weight ||
        !Number.isSafeInteger(unitAmount) ||
        unitAmount < 50
      ) {
        res.status(400).json({
          error: "Choose a coffee and bag size for your subscription.",
        });
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
        freeShipping:
          account.label === "wholesale" ? false : selectedPlan.freeShipping,
        status: "active",
        createdAt: new Date().toISOString(),
        upcomingRoastDate: await nextUpcomingRoastSessionDate(),
      };
      await subscriptions().save(subscription.id, subscription);
      res.status(201).json({ subscription });
    } catch (error: unknown) {
      logger.error("Unable to create subscription", {
        error: (error as Error).message,
      });
      res
        .status(500)
        .json({ error: "Unable to create your subscription right now." });
    }
  }

  static async getPartnerPrices(req: Request, res: Response): Promise<void> {
    try {
      const account = await sessionAccount(req);
      if (!account || !isPartnerLabel(account.label)) {
        res
          .status(401)
          .json({ error: "Please sign in with a partner account." });
        return;
      }
      res.json({ prices: await partnerPriceOverridesFor(account) });
    } catch (error: unknown) {
      logger.error("Unable to load partner price overrides", {
        error: (error as Error).message,
      });
      res
        .status(500)
        .json({ error: "Unable to load partner pricing right now." });
    }
  }

  static async cancelSubscription(req: Request, res: Response): Promise<void> {
    try {
      const account = await sessionAccount(req);
      if (!account) {
        res
          .status(401)
          .json({ error: "Your session has expired. Please log in again." });
        return;
      }
      const subscriptionId = String(req.params.subscriptionId || "");
      const snapshot = await accountSubscription(account.id, subscriptionId);
      if (!snapshot) {
        res.status(404).json({ error: "Subscription not found." });
        return;
      }
      const subscription = {
        ...snapshot.data(),
        status: "canceled",
      } as StoredSubscription;
      await snapshot.ref.update({ status: subscription.status });
      res.json({ subscription });
    } catch (error: unknown) {
      logger.error("Unable to cancel subscription", {
        error: (error as Error).message,
      });
      res
        .status(500)
        .json({ error: "Unable to cancel your subscription right now." });
    }
  }

  static async skipSubscription(req: Request, res: Response): Promise<void> {
    try {
      const account = await sessionAccount(req);
      if (!account) {
        res
          .status(401)
          .json({ error: "Your session has expired. Please log in again." });
        return;
      }
      const subscriptionId = String(req.params.subscriptionId || "");
      const snapshot = await accountSubscription(account.id, subscriptionId);
      if (!snapshot) {
        res.status(404).json({ error: "Subscription not found." });
        return;
      }
      const current = snapshot.data() as StoredSubscription;
      if (current.status !== "active") {
        res
          .status(400)
          .json({ error: "Only active subscriptions can skip a delivery." });
        return;
      }
      const skippedRoastDate = SubscriptionService.roastDateKey(
        current.upcomingRoastDate,
      );
      await snapshot.ref.update({ skippedRoastDate, updatedAt: Date.now() });
      logger.info("Subscription roast skipped by customer", {
        subscriptionId,
        skippedRoastDate,
      });
      res.json({ subscription: { ...current, skippedRoastDate } });
    } catch (error: unknown) {
      logger.error("Unable to skip subscription", {
        error: (error as Error).message,
      });
      res
        .status(500)
        .json({ error: "Unable to skip your next delivery right now." });
    }
  }

  static async unskipSubscription(req: Request, res: Response): Promise<void> {
    try {
      const account = await sessionAccount(req);
      if (!account) {
        res
          .status(401)
          .json({ error: "Your session has expired. Please log in again." });
        return;
      }
      const subscriptionId = String(req.params.subscriptionId || "");
      const snapshot = await accountSubscription(account.id, subscriptionId);
      if (!snapshot) {
        res.status(404).json({ error: "Subscription not found." });
        return;
      }
      const current = snapshot.data() as StoredSubscription;
      if (!SubscriptionService.isSkipped(current)) {
        res.status(400).json({ error: "Your next delivery is not skipped." });
        return;
      }
      await snapshot.ref.update({
        skippedRoastDate: FieldValue.delete(),
        updatedAt: Date.now(),
      });
      logger.info("Subscription roast skip undone by customer", {
        subscriptionId,
        roastDate: current.skippedRoastDate,
      });
      const subscription = { ...current };
      delete subscription.skippedRoastDate;
      res.json({ subscription });
    } catch (error: unknown) {
      logger.error("Unable to undo subscription skip", {
        error: (error as Error).message,
      });
      res.status(500).json({ error: "Unable to undo your skip right now." });
    }
  }

  static async addSubscriptionAddOn(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const account = await sessionAccount(req);
      if (!account) {
        res
          .status(401)
          .json({ error: "Your session has expired. Please log in again." });
        return;
      }
      if (account.label !== "church-ministry") {
        res.status(403).json({
          error:
            "Only Church & Ministry accounts can add coffee to the next subscription round.",
        });
        return;
      }
      const subscriptionId = String(req.params.subscriptionId || "");
      const snapshot = await accountSubscription(account.id, subscriptionId);
      if (!snapshot) {
        res.status(404).json({ error: "Subscription not found." });
        return;
      }
      const addOnWeight = Number(req.body?.addOnWeight);
      const addOnUnitAmount = Math.round(
        Number(req.body?.addOnUnitAmount) * 100,
      );
      if (
        !Number.isFinite(addOnWeight) ||
        addOnWeight <= 0 ||
        addOnWeight * 2 !== Math.round(addOnWeight * 2) ||
        !Number.isSafeInteger(addOnUnitAmount) ||
        addOnUnitAmount < 50
      ) {
        res.status(400).json({
          error: "Add-ons must be a valid half-pound amount and price.",
        });
        return;
      }
      const current = snapshot.data() as StoredSubscription;
      if (current.status !== "active") {
        res
          .status(400)
          .json({ error: "Only active subscriptions can receive an add-on." });
        return;
      }
      const subscription: StoredSubscription = {
        ...current,
        addOnWeight: (current.addOnWeight || 0) + addOnWeight,
        addOnUnitAmount: (current.addOnUnitAmount || 0) + addOnUnitAmount,
      };
      await snapshot.ref.update({
        addOnWeight: subscription.addOnWeight,
        addOnUnitAmount: subscription.addOnUnitAmount,
        updatedAt: Date.now(),
      });
      res.json({ subscription });
    } catch (error: unknown) {
      logger.error("Unable to add subscription coffee", {
        error: (error as Error).message,
      });
      res.status(500).json({
        error: "Unable to add coffee to your next subscription right now.",
      });
    }
  }

  /**
   * POST /account/subscriptions/:subscriptionId/frequency — switches the
   * cadence and keeps the bag count. The upcoming roast is unchanged; the new
   * cadence spaces the roasts after it.
   */
  static async changeSubscriptionFrequency(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const account = await sessionAccount(req);
      if (!account) {
        res
          .status(401)
          .json({ error: "Your session has expired. Please log in again." });
        return;
      }
      const subscriptionId = String(req.params.subscriptionId || "");
      const snapshot = await accountSubscription(account.id, subscriptionId);
      if (!snapshot) {
        res.status(404).json({ error: "Subscription not found." });
        return;
      }
      const current = snapshot.data() as StoredSubscription;
      const cadence = String(req.body?.cadence || "") as SubscriptionCadence;
      const plan = planFor(current.bagCount, cadence);
      if (!subscriptionPlans[plan]) {
        res.status(400).json({ error: "Choose a valid delivery frequency." });
        return;
      }
      if (current.status === "canceled") {
        res
          .status(400)
          .json({ error: "Canceled subscriptions cannot be changed." });
        return;
      }
      await snapshot.ref.update({ plan, cadence, updatedAt: Date.now() });
      logger.info("Subscription frequency changed by customer", {
        subscriptionId,
        from: current.cadence,
        to: cadence,
      });
      res.json({ subscription: { ...current, plan, cadence } });
    } catch (error: unknown) {
      logger.error("Unable to change subscription frequency", {
        error: (error as Error).message,
      });
      res
        .status(500)
        .json({ error: "Unable to change your delivery frequency right now." });
    }
  }

  /**
   * POST /account/subscriptions/:subscriptionId/order-now — charges the saved
   * payment method now for the earliest open roast session and re-anchors the
   * subscription's schedule on that roast.
   */
  static async orderSubscriptionNow(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const account = await sessionAccount(req);
      if (!account) {
        res
          .status(401)
          .json({ error: "Your session has expired. Please log in again." });
        return;
      }
      const subscriptionId = String(req.params.subscriptionId || "");
      const result = await new SubscriptionRenewalUseCase(database()).orderNow(
        account.id,
        subscriptionId,
      );
      const snapshot = await accountSubscription(account.id, subscriptionId);
      const subscription = snapshot?.data() as StoredSubscription | undefined;
      if (result.status === "failed") {
        res.status(402).json({
          error: `We couldn't place your order: ${result.error}`,
          subscription,
        });
        return;
      }
      res.json({ ...result, subscription });
    } catch (error: unknown) {
      if (error instanceof OrderNowRejected) {
        res.status(400).json({ error: error.message });
        return;
      }
      logger.error("Unable to order subscription now", {
        error: (error as Error).message,
      });
      res.status(500).json({ error: "Unable to place your order right now." });
    }
  }

  /** Returns the signed-in account's profile and saved addresses. */
  /**
   * POST /account/orders/:orderId/review — the review page link for one of the
   * account's delivered orders. Works whether or not the customer gets review emails.
   */
  static async getOrderReviewLink(req: Request, res: Response): Promise<void> {
    try {
      const account = await sessionAccount(req);
      if (!account) {
        res
          .status(401)
          .json({ error: "Your session has expired. Please log in again." });
        return;
      }
      const databaseId = process.env.NOTION_ONLINE_ORDERS_DATABASE_ID;
      if (!databaseId)
        throw new Error("NOTION_ONLINE_ORDERS_DATABASE_ID is not configured");
      const stored = await storedAccount(account.id);
      const emails = stored
        ? accountEmails(stored)
        : [account.user.email.toLowerCase()];
      const page: any = (
        await getNotion().databases.query({
          database_id: databaseId,
          filter: {
            property: "Order #",
            rich_text: { equals: req.params.orderId },
          },
        })
      ).results[0];
      const orderEmail = text(page?.properties?.["Email"]).trim().toLowerCase();
      if (!page || !emails.includes(orderEmail)) {
        res
          .status(404)
          .json({ error: "We couldn't find that order on your account." });
        return;
      }
      if (!isReviewableOrderPage(page)) {
        res.status(409).json({
          error:
            "You can review this order once it has been delivered or picked up.",
        });
        return;
      }
      const path = await ReviewService.reviewPathForOrderPage(page);
      if (!path) {
        res
          .status(422)
          .json({ error: "There's nothing to review on this order." });
        return;
      }
      res.json({ path });
    } catch (error: unknown) {
      logger.error("Unable to get order review link", {
        error: (error as Error).message,
      });
      res
        .status(500)
        .json({ error: "Unable to open the review page right now." });
    }
  }

  /** GET /account/email-preferences — which optional emails the account receives. */
  static async getEmailPreferences(req: Request, res: Response): Promise<void> {
    try {
      const account = await sessionAccount(req);
      if (!account) {
        res
          .status(401)
          .json({ error: "Your session has expired. Please log in again." });
        return;
      }
      const stored = await storedAccount(account.id);
      const emails = stored ? accountEmails(stored) : [account.user.email];
      res.json({ reviewRequests: !(await ReviewService.isOptedOut(emails)) });
    } catch (error: unknown) {
      logger.error("Unable to get email preferences", {
        error: (error as Error).message,
      });
      res.status(500).json({ error: "Unable to load your email preferences." });
    }
  }

  /**
   * POST /account/email-preferences — turns review request emails on or off for
   * every email on the account. Shares the list the unsubscribe link writes to.
   */
  static async updateEmailPreferences(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const account = await sessionAccount(req);
      if (!account) {
        res
          .status(401)
          .json({ error: "Your session has expired. Please log in again." });
        return;
      }
      if (typeof req.body?.reviewRequests !== "boolean") {
        res
          .status(400)
          .json({ error: "reviewRequests must be true or false." });
        return;
      }
      const stored = await storedAccount(account.id);
      const emails = stored ? accountEmails(stored) : [account.user.email];
      await ReviewService.setOptedOut(
        emails,
        !req.body.reviewRequests,
        `account ${account.id}`,
      );
      res.json({ reviewRequests: req.body.reviewRequests });
    } catch (error: unknown) {
      logger.error("Unable to update email preferences", {
        error: (error as Error).message,
      });
      res
        .status(500)
        .json({ error: "Unable to update your email preferences." });
    }
  }

  static async getDetails(req: Request, res: Response): Promise<void> {
    try {
      const session = await sessionAccount(req);
      const account = session ? await storedAccount(session.id) : null;
      if (!account) {
        res
          .status(401)
          .json({ error: "Your session has expired. Please log in again." });
        return;
      }
      res.json({
        account: publicProfile(account),
        addresses: savedAddresses(account),
      });
    } catch (error: unknown) {
      logger.error("Unable to load account details", {
        error: (error as Error).message,
      });
      res
        .status(500)
        .json({ error: "Unable to load your account details right now." });
    }
  }

  /**
   * Updates the name right away. A new email needs the current password and is
   * held as pendingEmail until its emailed link is confirmed (verifyEmail).
   * Submitting the current email cancels a pending change. Partner accounts
   * cannot change email, because their pricing is matched by email.
   */
  static async updateProfile(req: Request, res: Response): Promise<void> {
    try {
      const session = await sessionAccount(req);
      const current = session ? await storedAccount(session.id) : null;
      if (!current) {
        res
          .status(401)
          .json({ error: "Your session has expired. Please log in again." });
        return;
      }
      const firstName = String(req.body?.firstName || "")
        .trim()
        .slice(0, 80);
      const lastName = String(req.body?.lastName || "")
        .trim()
        .slice(0, 80);
      const email = String(req.body?.email || "")
        .trim()
        .toLowerCase()
        .slice(0, 254);
      const currentPassword = String(req.body?.currentPassword || "");
      if (!firstName || !lastName || !/^\S+@\S+\.\S+$/.test(email)) {
        res.status(400).json({
          error: "Enter your first name, last name, and a valid email.",
        });
        return;
      }
      const emailChanged = email !== current.user.email.trim().toLowerCase();
      if (emailChanged) {
        if (isPartnerLabel(current.label)) {
          res.status(403).json({
            error:
              "Please contact us to change the email on a partner account.",
          });
          return;
        }
        if (!(await passwordMatches(currentPassword, current.passwordHash))) {
          res.status(403).json({
            error: "Enter your current password to change your email.",
          });
          return;
        }
        const owner = (
          await database()
            .collection("account_emails")
            .doc(emailKey(email))
            .get()
        ).data()?.accountId;
        if (owner && owner !== current.id) {
          res.status(409).json({ error: "That email is already in use." });
          return;
        }
        if (verificationCooldownActive(current)) {
          res.status(429).json({
            error:
              "Please wait a minute before requesting another confirmation email.",
          });
          return;
        }
      }

      const user = { ...current.user, firstName, lastName };
      await database()
        .collection("accounts")
        .doc(current.id)
        .update({
          user,
          pendingEmail: emailChanged ? email : FieldValue.delete(),
          updatedAt: Date.now(),
        });
      const updated: StoredAccount = {
        ...current,
        user,
        pendingEmail: emailChanged ? email : null,
      };
      logger.info("Account profile updated", {
        accountId: current.id,
        emailChangeRequested: emailChanged,
      });

      const verificationSent = emailChanged
        ? await sendVerificationEmail(
            updated,
            email,
            "change",
            req.header("Origin"),
          )
            .then(() => true)
            .catch((error: Error) => {
              logger.error("Unable to send email change verification", {
                accountId: current.id,
                error: error.message,
              });
              return false;
            })
        : undefined;
      if (
        firstName !== current.user.firstName ||
        lastName !== current.user.lastName
      )
        await AccountService.syncProfileElsewhere(updated);
      res.json({
        account: publicProfile(updated),
        ...(verificationSent === undefined ? {} : { verificationSent }),
      });
    } catch (error: unknown) {
      logger.error("Unable to update account profile", {
        error: (error as Error).message,
      });
      res
        .status(500)
        .json({ error: "Unable to update your details right now." });
    }
  }

  /**
   * Confirms an emailed link. No session is needed: the single-use token
   * proves ownership of the email it was sent to. A signup link verifies the
   * account's email; a change link swaps in the new email, keeping the old one
   * reserved to this account.
   */
  static async verifyEmail(req: Request, res: Response): Promise<void> {
    try {
      const token = String(req.body?.token || "");
      if (!token) {
        res.status(400).json({ error: "This link is invalid or has expired." });
        return;
      }
      const verificationRef = verifications().ref(token);
      const result = await database().runTransaction(async (transaction) => {
        // Firestore transactions require every read before any write.
        const verification = (await transaction.get(verificationRef)).data() as
          | EmailVerification
          | undefined;
        if (
          !verification ||
          EmailVerificationRepository.isExpired(verification)
        )
          return { outcome: "invalid" as const };
        const accountRef = database()
          .collection("accounts")
          .doc(verification.accountId);
        const account = (await transaction.get(accountRef)).data() as
          | StoredAccount
          | undefined;
        const emailRef = database()
          .collection("account_emails")
          .doc(emailKey(verification.email));
        const owner =
          verification.purpose === "change"
            ? (await transaction.get(emailRef)).data()?.accountId
            : undefined;

        transaction.delete(verificationRef);
        const stillRequested =
          verification.purpose === "signup"
            ? account?.user.email === verification.email
            : account?.pendingEmail === verification.email;
        if (!account || !stillRequested) return { outcome: "invalid" as const };
        const now = Date.now();
        if (verification.purpose === "signup") {
          transaction.update(accountRef, {
            emailVerifiedAt: now,
            updatedAt: now,
          });
          return {
            outcome: "verified" as const,
            account: { ...account, emailVerifiedAt: now },
          };
        }
        if (owner && owner !== account.id) {
          transaction.update(accountRef, {
            pendingEmail: FieldValue.delete(),
            updatedAt: now,
          });
          return { outcome: "taken" as const };
        }
        const previousEmail = account.user.email.trim().toLowerCase();
        const user = { ...account.user, email: verification.email };
        transaction.set(emailRef, {
          accountId: account.id,
          email: verification.email,
        });
        transaction.update(accountRef, {
          user,
          emailVerifiedAt: now,
          pendingEmail: FieldValue.delete(),
          previousEmails: FieldValue.arrayUnion(previousEmail),
          updatedAt: now,
        });
        return {
          outcome: "verified" as const,
          account: {
            ...account,
            user,
            emailVerifiedAt: now,
            pendingEmail: null,
          },
          emailChanged: true,
        };
      });

      if (result.outcome === "invalid") {
        res.status(400).json({
          error:
            "This link is invalid or has expired. You can request a new one from your account.",
        });
        return;
      }
      if (result.outcome === "taken") {
        res.status(409).json({
          error:
            "That email is now used by another account, so it could not be added.",
        });
        return;
      }
      logger.info("Email verified", {
        accountId: result.account.id,
        emailChanged: !!result.emailChanged,
      });
      if (result.emailChanged)
        await AccountService.syncProfileElsewhere(result.account);
      res.json({ account: publicProfile(result.account) });
    } catch (error: unknown) {
      logger.error("Unable to verify email", {
        error: (error as Error).message,
      });
      res.status(500).json({ error: "Unable to verify your email right now." });
    }
  }

  /** Resends the link for a pending email change, or for an unverified account email. */
  static async resendVerification(req: Request, res: Response): Promise<void> {
    try {
      const session = await sessionAccount(req);
      const current = session ? await storedAccount(session.id) : null;
      if (!current) {
        res
          .status(401)
          .json({ error: "Your session has expired. Please log in again." });
        return;
      }
      const target: {
        email: string;
        purpose: EmailVerificationPurpose;
      } | null = current.pendingEmail
        ? { email: current.pendingEmail, purpose: "change" }
        : !isEmailVerified(current)
          ? { email: current.user.email, purpose: "signup" }
          : null;
      if (!target) {
        res.status(400).json({ error: "Your email is already verified." });
        return;
      }
      if (verificationCooldownActive(current)) {
        res.status(429).json({
          error:
            "Please wait a minute before requesting another confirmation email.",
        });
        return;
      }
      await sendVerificationEmail(
        current,
        target.email,
        target.purpose,
        req.header("Origin"),
      );
      res.json({ sentTo: target.email });
    } catch (error: unknown) {
      logger.error("Unable to resend verification email", {
        error: (error as Error).message,
      });
      res
        .status(500)
        .json({ error: "Unable to send the confirmation email right now." });
    }
  }

  /** Changes the password after checking the current one, then signs out every other session. */
  static async changePassword(req: Request, res: Response): Promise<void> {
    try {
      const session = await sessionAccount(req);
      const current = session ? await storedAccount(session.id) : null;
      const sessionToken =
        req.header("Authorization")?.replace(/^Bearer\s+/i, "") || "";
      if (!current || !sessionToken) {
        res
          .status(401)
          .json({ error: "Your session has expired. Please log in again." });
        return;
      }
      const currentPassword = String(req.body?.currentPassword || "");
      const newPassword = String(req.body?.newPassword || "");
      if (newPassword.length < 8) {
        res
          .status(400)
          .json({ error: "Choose a new password of at least 8 characters." });
        return;
      }
      if (!(await passwordMatches(currentPassword, current.passwordHash))) {
        res.status(403).json({ error: "Your current password is incorrect." });
        return;
      }
      if (await passwordMatches(newPassword, current.passwordHash)) {
        res.status(400).json({
          error: "Choose a password different from your current one.",
        });
        return;
      }
      await database()
        .collection("accounts")
        .doc(current.id)
        .update({
          passwordHash: await createPasswordHash(newPassword),
          passwordChangedAt: Date.now(),
          updatedAt: Date.now(),
        });
      const signedOutSessions = await accounts().deleteSessionsExcept(
        current.id,
        sessionToken,
      );
      logger.info("Account password changed", {
        accountId: current.id,
        signedOutSessions,
      });
      res.json({ signedOutSessions });
    } catch (error: unknown) {
      logger.error("Unable to change password", {
        error: (error as Error).message,
      });
      res
        .status(500)
        .json({ error: "Unable to change your password right now." });
    }
  }

  /**
   * Best-effort: keeps Stripe receipts and the Notion subscription view on the
   * account's current name and email. Firestore is already updated, so a
   * failure here is logged rather than failing the request.
   */
  private static async syncProfileElsewhere(
    account: StoredAccount,
  ): Promise<void> {
    const { firstName, lastName, email } = account.user;
    const stripeCustomerId = account.billing?.stripeCustomerId;
    const results = await Promise.allSettled([
      ...(stripeCustomerId
        ? [
            getStripe().customers.update(stripeCustomerId, {
              email,
              name: `${firstName} ${lastName}`,
            }),
          ]
        : []),
      subscriptions()
        .listForAccount(account.id)
        .then((snapshots) =>
          Promise.all(
            snapshots.map((snapshot) =>
              AccountService.syncSubscriptionMirrorById(snapshot.id),
            ),
          ),
        ),
    ]);
    results.forEach((result) => {
      if (result.status === "rejected")
        logger.error("Unable to sync updated profile", {
          accountId: account.id,
          error: (result.reason as Error).message,
        });
    });
  }

  /**
   * Saves shipping and billing addresses. A field left out is unchanged; null
   * removes it. Subscription renewals ship to the saved shipping address.
   */
  static async updateAddresses(req: Request, res: Response): Promise<void> {
    try {
      const session = await sessionAccount(req);
      const current = session ? await storedAccount(session.id) : null;
      if (!current) {
        res
          .status(401)
          .json({ error: "Your session has expired. Please log in again." });
        return;
      }
      const update: Record<string, unknown> = {};
      for (const [field, dataField] of [
        ["shippingAddress", "shippingAddressData"],
        ["billingAddress", "billingAddressData"],
      ] as const) {
        const input = req.body?.[field];
        if (input === undefined) continue;
        const address =
          input === null ? null : normalizedShippingAddress(input);
        if (input !== null && !address) {
          res.status(400).json({
            error: `Enter a complete ${field === "shippingAddress" ? "shipping" : "billing"} address.`,
          });
          return;
        }
        update[dataField] = address;
        if (field === "shippingAddress")
          update.shippingAddress = address ? formatAddress(address) : null;
      }
      if (update.shippingAddressData === null) {
        const shipsToAccount = (
          await subscriptions().listForAccount(current.id)
        ).some(
          (snapshot) =>
            snapshot.data()?.status === "active" &&
            !snapshot.data()?.isLocalPickup,
        );
        if (shipsToAccount) {
          res.status(400).json({
            error:
              "Your active subscription ships to this address. Update it instead of removing it.",
          });
          return;
        }
      }
      await database()
        .collection("accounts")
        .doc(current.id)
        .update({ ...update, updatedAt: Date.now() });
      logger.info("Account addresses updated", {
        accountId: current.id,
        fields: Object.keys(update),
      });
      res.json({
        addresses: savedAddresses({ ...current, ...update } as StoredAccount),
      });
    } catch (error: unknown) {
      logger.error("Unable to update account addresses", {
        error: (error as Error).message,
      });
      res
        .status(500)
        .json({ error: "Unable to save your addresses right now." });
    }
  }

  static async logout(req: Request, res: Response): Promise<void> {
    const token = req.header("Authorization")?.replace(/^Bearer\s+/i, "");
    if (token) await accounts().deleteSession(token);
    res.status(204).send();
  }
}
