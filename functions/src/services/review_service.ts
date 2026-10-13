import { randomBytes, randomUUID } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getDownloadURL } from "firebase-admin/storage";
import { Request, Response } from "express";
import { createLogger } from "../logger";
import { getDatabase, getStorageBucket } from "../integrations/firebase_admin";
import { getNotionClient } from "../integrations/notion/notion_client";
import { sendEmailJs } from "../integrations/email/emailjs_client";
import { siteUrlFor } from "../config/site";
import {
  hasValidRating, ProductReviewSummary, ReviewModel, ReviewPhoto, toPublishedReview,
} from "../domain/reviews/review_model";
import { createReview, findReviewsByOrder, listReviews, updateReview } from "../repositories/notion_review_repository";

const logger = createLogger("reviews");

const REVIEW_REQUESTS_COLLECTION = "review_requests";
const REVIEW_SUBMISSIONS_COLLECTION = "review_submissions";
const MAX_REVIEW_LENGTH = 1000;
const REVIEW_PHOTO_UPLOADS_COLLECTION = "review_photo_uploads";
// Customers who used the unsubscribe link in a review email; keyed by email.
const REVIEW_OPT_OUTS_COLLECTION = "review_opt_outs";
export const MAX_REVIEW_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_PHOTOS_PER_REVIEW = 4;
// Caps uploads per order + product, including photos removed before submitting.
const MAX_PHOTO_UPLOADS_PER_REVIEW = 12;
const REVIEWS_CACHE_DOC = { collection: "reviews_cache", id: "latest" };
const INVENTORY_CACHE_DOC = { collection: "inventory_cache", id: "latest" };
const REVIEWS_CACHE_TTL_MS = 30 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const FIRST_REQUEST_DELAY_MS = 7 * DAY_MS;
const REMINDER_DELAY_MS = 7 * DAY_MS;
// Subscribers receive the same products repeatedly; ask them at most this often.
const REQUEST_COOLDOWN_MS = 30 * DAY_MS;

// "sending" and "reminding" claim an order while its email goes out, so a
// failure after sending can never cause the same email to be sent twice.
type RequestStatus = "queued" | "sending" | "sent" | "reminding" | "reminded" | "done" | "skipped";

// Checkboxes on the Notion "Online Orders" page, like the other "… Email Sent" columns.
// Checking one by hand stops that email from being sent.
const REQUEST_SENT_PROPERTY = "Review Request Sent";
const REMINDER_SENT_PROPERTY = "Review Reminder Sent";

interface ReviewRequestItem {
  sku: string;
  parentSku: string;
  name: string;
  imageUrl: string;
}

interface ReviewRequest {
  orderId: string;
  key: string;
  email: string;
  firstName: string;
  lastName: string;
  purchaseDate: string;
  fulfilledAt: number;
  items: ReviewRequestItem[];
  status: RequestStatus;
  firstSentAt?: number;
  reminderSentAt?: number;
  // Notion "Online Orders" page, for the sent checkboxes.
  notionOrderPageId?: string;
}

interface ReviewSubmission {
  orderId: string;
  parentSku: string;
  rating: number;
  text: string;
  photos?: string[];
  notionPageId?: string;
  updatedAt: number;
}

interface ReviewsCache {
  products: Record<string, ProductReviewSummary>;
  lastSyncedAt: number;
}

interface InventoryLookup {
  parentSku: string;
  name: string;
  imageUrl: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const plainText = (prop: any): string =>
  (prop?.rich_text || prop?.title || []).map((part: any) => part.plain_text).join("").trim();
/* eslint-enable @typescript-eslint/no-explicit-any */

const reviewRequests = () => getDatabase().collection(REVIEW_REQUESTS_COLLECTION);
const reviewSubmissions = () => getDatabase().collection(REVIEW_SUBMISSIONS_COLLECTION);
const submissionId = (orderId: string, parentSku: string) =>
  Buffer.from(`${orderId}|${parentSku}`).toString("base64url");
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const PHOTO_TYPES: { contentType: string; extension: string; matches: (bytes: Buffer) => boolean }[] = [
  { contentType: "image/jpeg", extension: "jpg", matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { contentType: "image/png", extension: "png", matches: (b) => b.subarray(0, 4).toString("hex") === "89504e47" },
  { contentType: "image/webp", extension: "webp", matches: (b) => b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP" },
];

/** Storage folder for one order + product's photos; also used to check submitted photo URLs are ours. */
const photoFolder = (orderId: string, parentSku: string): string =>
  `review-photos/${orderId.replace(/[^\w-]/g, "_")}/${parentSku.replace(/[^\w-]/g, "_")}/`;

/** Stores an image in Cloud Storage and returns its permanent download URL. */
const storeReviewPhoto = async (orderId: string, parentSku: string, bytes: Buffer): Promise<string> => {
  const type = PHOTO_TYPES.find((candidate) => candidate.matches(bytes));
  if (!type) throw new Error("Unsupported image type");
  const file = getStorageBucket().file(`${photoFolder(orderId, parentSku)}${randomUUID()}.${type.extension}`);
  await file.save(bytes, { contentType: type.contentType, metadata: { cacheControl: "public, max-age=31536000" } });
  return getDownloadURL(file);
};

const isOwnPhotoUrl = (url: string, orderId: string, parentSku: string): boolean =>
  url.includes(`/o/${encodeURIComponent(photoFolder(orderId, parentSku))}`);

const storedPhotos = (urls: string[]): ReviewPhoto[] => urls.map((url) => ({ url, hostedByNotion: false }));

/** Maps every parent and variant SKU to its parent product, using the inventory cache. */
const loadInventoryLookup = async (): Promise<Map<string, InventoryLookup>> => {
  const snapshot = await getDatabase().collection(INVENTORY_CACHE_DOC.collection).doc(INVENTORY_CACHE_DOC.id).get();
  const lookup = new Map<string, InventoryLookup>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const item of (snapshot.data()?.items || []) as any[]) {
    if (!item?.sku) continue;
    const entry = { parentSku: item.sku, name: item.name || item.sku, imageUrl: item.firebaseImageUrls?.[0] || "" };
    lookup.set(item.sku, entry);
    for (const variant of item.variants || []) {
      if (variant?.sku) lookup.set(variant.sku, entry);
    }
  }
  return lookup;
};

/**
 * Parses the Notion "Items ordered formatted" column. Each line is
 * `name,sku,quantity` with an optional `,subscription:<id>` suffix. Account
 * orders store the separator as a literal "\n", so both forms are accepted.
 */
export const parseOrderedSkus = (itemsFormatted: string): { name: string; sku: string }[] =>
  itemsFormatted.split(/\\n|\n/).map((line) => {
    const parts = line.trim().split(",");
    if (parts[parts.length - 1]?.startsWith("subscription:")) parts.pop();
    if (parts.length < 3) return null;
    parts.pop(); // quantity
    const sku = parts.pop()?.trim() || "";
    return sku ? { name: parts.join(",").trim(), sku } : null;
  }).filter((line): line is { name: string; sku: string } => !!line);

/**
 * Finds the product for a SKU that's no longer in inventory, such as a retired
 * one-off variant like B-KOIN-200G-VAR, through the longest current SKU it
 * extends (B-KOIN-200G, so Koin Blend).
 */
const retiredVariantProduct = (sku: string, lookup: Map<string, InventoryLookup>): InventoryLookup | undefined => {
  const base = [...lookup.keys()]
    .filter((known) => sku.startsWith(`${known}-`))
    .sort((a, b) => b.length - a.length)[0];
  return base ? lookup.get(base) : undefined;
};

/**
 * The products a customer is asked to review for an order: one per product,
 * however many lines, units or sizes of it they bought. Quantity is ignored,
 * and variants (e.g. 200g and 1kg of the same coffee) share their parent's review.
 */
export const reviewableItems = (itemsFormatted: string, lookup: Map<string, InventoryLookup>): ReviewRequestItem[] => {
  const items = new Map<string, ReviewRequestItem>();
  for (const line of parseOrderedSkus(itemsFormatted)) {
    const product = lookup.get(line.sku) || retiredVariantProduct(line.sku, lookup);
    const parentSku = product?.parentSku || line.sku;
    if (items.has(parentSku)) continue;
    items.set(parentSku, { sku: line.sku, parentSku, name: product?.name || line.name, imageUrl: product?.imageUrl || "" });
  }
  return [...items.values()];
};

/** When an order was placed: its "Order created" date, falling back to when its Notion page was made. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const orderPurchaseDate = (page: any): string =>
  page.properties?.["Order created"]?.date?.start || page.created_time || new Date().toISOString();

/** The order's Notion page, found by its saved page ID or by Order #. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const findOrderPage = async (request: ReviewRequest): Promise<any | null> => {
  if (request.notionOrderPageId) {
    return getNotionClient().pages.retrieve({ page_id: request.notionOrderPageId }).catch(() => null);
  }
  const databaseId = process.env.NOTION_ONLINE_ORDERS_DATABASE_ID;
  if (!databaseId) return null;
  const orders = await getNotionClient().databases.query({
    database_id: databaseId,
    filter: { property: "Order #", rich_text: { equals: request.orderId } },
  });
  return orders.results[0] || null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isRefunded = (page: any): boolean => page?.properties?.["Status"]?.status?.name === "Refunded";

/** Test-only overrides for one step of the daily review email job. */
interface StepOptions {
  ignoreTiming?: boolean;
  to?: string;
  siteUrl?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isOrderChecked = (page: any, property: string): boolean => page?.properties?.[property]?.checkbox === true;

/** Ticks a sent checkbox on the order. Failure is logged, not thrown: Firestore already records the send. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const checkOrderBox = async (page: any, property: string, orderId: string): Promise<void> => {
  if (!page?.id) return;
  await getNotionClient().pages.update({ page_id: page.id, properties: { [property]: { checkbox: true } } })
    .catch((error: Error) => logger.warn(`Unable to check "${property}" in Notion`, { orderId, error: error.message }));
};

const splitName = (fullName: string): { firstName: string; lastName: string } => {
  const [firstName = "", ...rest] = fullName.trim().split(/\s+/);
  return { firstName, lastName: rest.join(" ") };
};

/** The one link in a review email: a page listing every product in the order. */
const reviewLink = (request: ReviewRequest, siteUrl: string): string => {
  const params = new URLSearchParams({ order: request.orderId, key: request.key });
  return `${siteUrl}/review?${params.toString()}`;
};

const unsubscribeLink = (request: ReviewRequest, siteUrl: string): string => {
  const params = new URLSearchParams({ order: request.orderId, key: request.key });
  return `${siteUrl}/review/unsubscribe?${params.toString()}`;
};

const optOutRef = (email: string) =>
  getDatabase().collection(REVIEW_OPT_OUTS_COLLECTION).doc(Buffer.from(email.trim().toLowerCase()).toString("base64url"));

const hasOptedOut = async (email: string): Promise<boolean> => !!email && (await optOutRef(email).get()).exists;

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char] as string));

/** The purchased products followed by a single "Review your order" button. */
const reviewEmailHtml = (request: ReviewRequest, items: ReviewRequestItem[], siteUrl = siteUrlFor()): string => {
  const rows = items.map((item) => {
    const image = item.imageUrl
      ? `<td width="64" style="padding-right:16px;vertical-align:middle;"><img src="${item.imageUrl}" width="64" height="64" alt="" style="display:block;border-radius:8px;object-fit:cover;" /></td>`
      : "";
    return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid #f0f0f0;">
        <tr>
          ${image}
          <td style="vertical-align:middle;font-size:15px;font-weight:600;color:#2F2B39;">${escapeHtml(item.name)}</td>
        </tr>
      </table>`;
  }).join("");
  return `${rows}
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px;">
        <tr>
          <td style="border-radius:999px;background:#2F2B39;">
            <a href="${reviewLink(request, siteUrl)}" style="display:inline-block;padding:14px 32px;font-family:Arial,sans-serif;font-size:15px;font-weight:600;color:#F8F5EB;text-decoration:none;">Review your order</a>
          </td>
        </tr>
      </table>`;
};

export class ReviewService {
  /**
   * Records an order as fulfilled so the scheduled job can ask for reviews
   * later. Safe to call repeatedly: an existing request is left untouched.
   */
  static async queueReviewRequest(params: {
    orderId: string;
    email: string;
    customerFullName: string;
    purchaseDate: string;
    itemsFormatted: string;
    notionOrderPageId?: string;
    // False for requests made so a customer can review from their account:
    // they never trigger emails, and renewals are allowed.
    emailCustomer?: boolean;
  }): Promise<void> {
    const emailCustomer = params.emailCustomer !== false;
    // Orders without a real Order # can't be linked to their reviews, and would all share one request.
    if (!params.orderId || params.orderId === "N/A") {
      logger.warn("Not queueing review request for an order without an Order #");
      return;
    }
    const ref = reviewRequests().doc(params.orderId);
    if ((await ref.get()).exists) return;
    // Subscription renewals repeat the same products; only the first subscription order is asked.
    const order = await getDatabase().collection("orders").doc(params.orderId).get();
    if (emailCustomer && order.data()?.source === "subscription-renewal") {
      logger.info("Not queueing review request for a subscription renewal", { orderId: params.orderId });
      return;
    }

    const items = reviewableItems(params.itemsFormatted, await loadInventoryLookup());
    if (items.length === 0) {
      logger.warn("No reviewable items found for order", { orderId: params.orderId });
      return;
    }

    const request: ReviewRequest = {
      orderId: params.orderId,
      key: randomBytes(16).toString("base64url"),
      email: params.email.toLowerCase(),
      ...splitName(params.customerFullName),
      purchaseDate: params.purchaseDate,
      fulfilledAt: Date.now(),
      items,
      ...(params.notionOrderPageId ? { notionOrderPageId: params.notionOrderPageId } : {}),
      status: emailCustomer ? "queued" : "done",
    };
    await ref.set(request);
    logger.info("Queued review request", { orderId: params.orderId, items: request.items.length });
  }

  /** Queues a review request from a Notion "Online Orders" page. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static async queueFromOrderPage(page: any, emailCustomer: boolean): Promise<ReviewRequest | null> {
    const props = page.properties;
    const orderId = plainText(props["Order #"]);
    await ReviewService.queueReviewRequest({
      orderId,
      email: props["Email"]?.type === "email" && typeof props["Email"].email === "string" ? props["Email"].email : "",
      customerFullName: plainText(props["Customer"]),
      purchaseDate: orderPurchaseDate(page),
      itemsFormatted: plainText(props["Items ordered formatted"]),
      notionOrderPageId: page.id,
      emailCustomer,
    });
    const snapshot = await reviewRequests().doc(orderId).get();
    return snapshot.exists ? snapshot.data() as ReviewRequest : null;
  }

  /**
   * The review page link for an order, for customers reviewing from their
   * account. Uses the order's existing review request, or makes one that never
   * sends emails. Returns null when the order has nothing to review.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async reviewPathForOrderPage(page: any): Promise<string | null> {
    const orderId = plainText(page.properties?.["Order #"]);
    if (!orderId) return null;
    const existing = await reviewRequests().doc(orderId).get();
    const request = existing.exists ? existing.data() as ReviewRequest : await ReviewService.queueFromOrderPage(page, false);
    if (!request) return null;
    return `/review?${new URLSearchParams({ order: request.orderId, key: request.key }).toString()}`;
  }

  /** Whether any of these emails has opted out of review emails. */
  static async isOptedOut(emails: string[]): Promise<boolean> {
    const results = await Promise.all(emails.map(hasOptedOut));
    return results.some(Boolean);
  }

  /** Opts these emails in or out of review emails. */
  static async setOptedOut(emails: string[], optedOut: boolean, source: string): Promise<void> {
    await Promise.all(emails.filter(Boolean).map((email) => optedOut
      ? optOutRef(email).set({ email: email.trim().toLowerCase(), source, optedOutAt: Date.now() })
      : optOutRef(email).delete()));
    logger.info(optedOut ? "Opted out of review emails" : "Opted back in to review emails", { source });
  }

  /** Admin: builds (or rebuilds) the review request for a real Notion order. */
  private static async requestForNotionOrder(orderId: string, reset: boolean): Promise<ReviewRequest | null> {
    if (!reset) {
      const existing = await reviewRequests().doc(orderId).get();
      if (existing.exists) return existing.data() as ReviewRequest;
    }
    const databaseId = process.env.NOTION_ONLINE_ORDERS_DATABASE_ID;
    if (!databaseId) throw new Error("NOTION_ONLINE_ORDERS_DATABASE_ID is not configured");
    const orders = await getNotionClient().databases.query({
      database_id: databaseId,
      filter: { property: "Order #", rich_text: { equals: orderId } },
    });
    const page = orders.results[0];
    if (!page || !("properties" in page)) throw new Error(`Order ${orderId} was not found in Notion.`);
    if (reset) await reviewRequests().doc(orderId).delete();
    return ReviewService.queueFromOrderPage(page, true);
  }

  /**
   * Admin: queues a review request from a real Notion order and returns the
   * email's product list and review button, linking to the live site.
   */
  static async handleAdminReviewLinks(req: Request, res: Response): Promise<void> {
    const orderId = String(req.query.order || "");
    const siteUrl = siteUrlFor();
    try {
      const request = await ReviewService.requestForNotionOrder(orderId, req.query.reset === "true");
      if (!request) {
        res.status(422).send("No reviewable items were found on this order.");
        return;
      }
      res.type("html").send(`<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:560px;margin:40px auto;padding:0 16px;">
        <h2>Review links for order ${escapeHtml(orderId)}</h2>
        <p style="color:#59667E;font-size:13px;">Status: ${request.status} · add <code>&amp;reset=true</code> to rebuild the request.</p>
        ${reviewEmailHtml(request, request.items, siteUrl)}
      </body></html>`);
    } catch (error) {
      logger.error("Error building dev review links", { orderId, error: (error as Error).message });
      res.status(500).send(escapeHtml((error as Error).message));
    }
  }

  /**
   * Admin: sends the real review request email for a Notion order to the
   * given address, linking to the live site.
   * Doesn't change the request's status, so the scheduled job is unaffected.
   */
  static async handleAdminSendTestEmail(req: Request, res: Response): Promise<void> {
    const orderId = String(req.query.order || "");
    const to = String(req.query.to || "");
    const siteUrl = siteUrlFor();
    if (!orderId || !/^[^@\s]+@[^@\s]+$/.test(to)) {
      res.status(400).json({ error: "Pass ?order=<Order #>&to=<your email>. The test email only goes to the address you give." });
      return;
    }
    try {
      const request = await ReviewService.requestForNotionOrder(orderId, req.query.reset === "true");
      if (!request) {
        res.status(422).json({ error: "No reviewable items were found on this order." });
        return;
      }
      const isReminder = req.query.reminder === "true";
      await ReviewService.sendRequestEmail({ ...request, email: to }, request.items, isReminder, siteUrl);
      res.json({ sent: true, to, orderId, reminder: isReminder, items: request.items.map((item) => item.name), siteUrl });
    } catch (error) {
      logger.error("Error sending dev review email", { orderId, error: (error as Error).message });
      res.status(500).json({ error: (error as Error).message });
    }
  }

  private static async sendRequestEmail(
    request: ReviewRequest, items: ReviewRequestItem[], isReminder: boolean, siteUrl = siteUrlFor(),
  ): Promise<void> {
    const serviceId = process.env.EMAILJS_SERVICE_ID;
    const templateId = process.env.EMAILJS_REVIEW_REQUEST_TEMPLATE_ID;
    const publicKey = process.env.EMAILJS_PUBLIC_KEY;
    const privateKey = process.env.EMAILJS_PRIVATE_KEY;
    if (!serviceId || !templateId || !publicKey || !privateKey) throw new Error("EmailJS review request template is not configured");
    await sendEmailJs({ serviceId, publicKey, privateKey }, templateId, {
      to_email: request.email,
      customer_name: request.firstName || "there",
      order_id: request.orderId,
      subject: isReminder ? "Still enjoying your coffee?" : "How was your order?",
      heading: isReminder ? "We'd still love to hear from you" : "How was your order?",
      intro: isReminder
        ? "If you have a moment, we'd love to hear what you thought of these. It only takes a minute."
        : "Thank you for supporting Koinonia Coffee Project! Let us know what you thought of your order. It only takes a minute and helps us out greatly.",
      items_html: reviewEmailHtml(request, items, siteUrl),
      unsubscribe_url: unsubscribeLink(request, siteUrl),
    }, "EmailJS review request failed");
  }

  /** Returns the parent SKUs already reviewed for an order. */
  private static async reviewedParentSkus(orderId: string): Promise<Set<string>> {
    const reviewed = new Set<string>();
    for (const review of await findReviewsByOrder(orderId)) {
      if (review.parentProductId) reviewed.add(review.parentProductId);
      if (review.productId) reviewed.add(review.productId);
    }
    return reviewed;
  }

  /**
   * Sends first requests 7 days after fulfillment and one reminder 7 days later.
   * Each order is emailed at most once per step: the Notion sent checkboxes are
   * checked first (and can be ticked by hand to skip an order), and the order
   * is claimed in Firestore before its email goes out.
   */
  static async sendDueReviewRequests(): Promise<void> {
    const queued = await reviewRequests().where("status", "==", "queued").get();
    for (const doc of queued.docs) {
      await ReviewService.processFirstRequest(doc.ref, {}).catch((error: Error) =>
        logger.error("Failed to send review request", { orderId: doc.id, error: error.message }));
    }
    const sent = await reviewRequests().where("status", "==", "sent").get();
    for (const doc of sent.docs) {
      await ReviewService.processReminder(doc.ref, {}).catch((error: Error) =>
        logger.error("Failed to send review reminder", { orderId: doc.id, error: error.message }));
    }
  }

  /**
   * Sends one order's first review request if it's due. Returns what happened.
   * Orders that were refunded, already marked sent in Notion, or whose customer
   * was asked recently are skipped instead.
   */
  private static async processFirstRequest(ref: FirebaseFirestore.DocumentReference, options: StepOptions): Promise<string> {
    const request = (await ref.get()).data() as ReviewRequest;
    const now = Date.now();
    if (request.status !== "queued") return `not queued (status: ${request.status})`;
    if (!options.ignoreTiming && now - request.fulfilledAt < FIRST_REQUEST_DELAY_MS) return "not due yet";

    const orderPage = await findOrderPage(request);
    const skip = async (reason: string): Promise<string> => {
      await ref.update({ status: "skipped" });
      logger.info(`Skipped review request: ${reason}`, { orderId: request.orderId });
      return `skipped: ${reason}`;
    };
    if (isRefunded(orderPage)) return skip("order was refunded");
    if (await hasOptedOut(request.email)) return skip("customer unsubscribed from review emails");
    if (isOrderChecked(orderPage, REQUEST_SENT_PROPERTY)) return skip(`"${REQUEST_SENT_PROPERTY}" is already checked`);
    if (!options.ignoreTiming) {
      const recent = await reviewRequests().where("email", "==", request.email).get();
      const askedRecently = recent.docs.some((other) =>
        other.id !== ref.id && now - ((other.data() as ReviewRequest).firstSentAt || 0) < REQUEST_COOLDOWN_MS);
      if (askedRecently) return skip("customer was asked recently");
    }

    await ref.update({ status: "sending" });
    try {
      await ReviewService.sendRequestEmail({ ...request, email: options.to || request.email }, request.items, false, options.siteUrl);
    } catch (error) {
      await ref.update({ status: "queued" }); // not sent; try again tomorrow
      throw error;
    }
    await ref.update({ status: "sent", firstSentAt: now });
    await checkOrderBox(orderPage, REQUEST_SENT_PROPERTY, request.orderId);
    logger.info("Sent review request", { orderId: request.orderId });
    return "sent review request";
  }

  /** Sends one order's reminder if it's due, listing only products not yet reviewed. Returns what happened. */
  private static async processReminder(ref: FirebaseFirestore.DocumentReference, options: StepOptions): Promise<string> {
    const request = (await ref.get()).data() as ReviewRequest;
    const now = Date.now();
    if (request.status !== "sent") return `not awaiting a reminder (status: ${request.status})`;
    if (!options.ignoreTiming && now - (request.firstSentAt || now) < REMINDER_DELAY_MS) return "reminder not due yet";

    const orderPage = await findOrderPage(request);
    const finish = async (reason: string): Promise<string> => {
      await ref.update({ status: "done" });
      logger.info(`No review reminder: ${reason}`, { orderId: request.orderId });
      return `no reminder: ${reason}`;
    };
    if (isRefunded(orderPage)) return finish("order was refunded");
    if (await hasOptedOut(request.email)) return finish("customer unsubscribed from review emails");
    if (isOrderChecked(orderPage, REMINDER_SENT_PROPERTY)) return finish(`"${REMINDER_SENT_PROPERTY}" is already checked`);
    const reviewed = await ReviewService.reviewedParentSkus(request.orderId);
    const remaining = request.items.filter((item) => !reviewed.has(item.parentSku) && !reviewed.has(item.sku));
    if (remaining.length === 0) return finish("every product is already reviewed");

    await ref.update({ status: "reminding" });
    try {
      await ReviewService.sendRequestEmail({ ...request, email: options.to || request.email }, remaining, true, options.siteUrl);
    } catch (error) {
      await ref.update({ status: "sent" }); // not sent; try again tomorrow
      throw error;
    }
    await ref.update({ status: "reminded", reminderSentAt: now });
    await checkOrderBox(orderPage, REMINDER_SENT_PROPERTY, request.orderId);
    logger.info("Sent review reminder", { orderId: request.orderId, remaining: remaining.length });
    return `sent reminder for ${remaining.map((item) => item.name).join(", ")}`;
  }

  /**
   * Admin: asks every past delivered or picked-up order for a review, once.
   * A dry run unless called with ?send=true. One email per order, listing only
   * products not yet reviewed, and no reminder afterwards. Sends at most
   * ?limit= orders per call (default 15) to stay inside the request time
   * limit; each sent order gets "Review Request Sent" ticked, so calling it
   * again carries on with the rest.
   */
  static async handleAdminBackfill(req: Request, res: Response): Promise<void> {
    const send = req.query.send === "true";
    const limit = Math.max(1, Math.min(25, Number(req.query.limit) || 15));
    try {
      const databaseId = process.env.NOTION_ONLINE_ORDERS_DATABASE_ID;
      if (!databaseId) throw new Error("NOTION_ONLINE_ORDERS_DATABASE_ID is not configured");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pages: any[] = [];
      let cursor: string | undefined;
      do {
        const response = await getNotionClient().databases.query({
          database_id: databaseId,
          start_cursor: cursor,
          page_size: 100,
          filter: {
            or: [
              { property: "Fulfillment", status: { equals: "Delivered" } },
              { property: "Fulfillment", status: { equals: "Picked up" } },
            ],
          },
          sorts: [{ property: "Order created", direction: "ascending" }],
        });
        pages.push(...response.results);
        cursor = response.has_more ? response.next_cursor || undefined : undefined;
      } while (cursor);

      const lookup = await loadInventoryLookup();
      const reviewedByOrder = new Map<string, Set<string>>();
      for (const review of await listReviews()) {
        const reviewed = reviewedByOrder.get(review.orderId) || new Set<string>();
        [review.parentProductId, review.productId].filter(Boolean).forEach((sku) => reviewed.add(sku));
        reviewedByOrder.set(review.orderId, reviewed);
      }

      const eligible: { page: unknown; orderId: string; email: string; customer: string; ordered: string; items: ReviewRequestItem[] }[] = [];
      const skipped: { orderId: string; customer: string; reason: string }[] = [];
      for (const page of pages) {
        const props = page.properties || {};
        const orderId = plainText(props["Order #"]);
        const customer = plainText(props["Customer"]);
        const email = props["Email"]?.type === "email" && typeof props["Email"].email === "string" ? props["Email"].email.trim() : "";
        const skip = (reason: string) => skipped.push({ orderId: orderId || "(none)", customer, reason });
        if (!orderId) { skip("no Order #"); continue; }
        if (!email) { skip("no email"); continue; }
        if (isRefunded(page)) { skip("refunded"); continue; }
        if (isOrderChecked(page, REQUEST_SENT_PROPERTY)) { skip(`"${REQUEST_SENT_PROPERTY}" already checked`); continue; }
        if ((await reviewRequests().doc(orderId).get()).exists) { skip("already has a review request"); continue; }
        if ((await getDatabase().collection("orders").doc(orderId).get()).data()?.source === "subscription-renewal") {
          skip("subscription renewal");
          continue;
        }
        if (await hasOptedOut(email)) { skip("customer unsubscribed"); continue; }
        const reviewed = reviewedByOrder.get(orderId) || new Set<string>();
        const items = reviewableItems(plainText(props["Items ordered formatted"]), lookup)
          .filter((item) => !reviewed.has(item.parentSku) && !reviewed.has(item.sku));
        if (items.length === 0) { skip("nothing left to review"); continue; }
        eligible.push({ page, orderId, email, customer, ordered: orderPurchaseDate(page).slice(0, 10), items });
      }

      const summary = (entry: typeof eligible[number]) => ({
        orderId: entry.orderId, customer: entry.customer, email: entry.email, ordered: entry.ordered,
        products: entry.items.map((item) => item.name),
      });
      if (!send) {
        res.json({ dryRun: true, wouldEmail: eligible.length, orders: eligible.map(summary), skipped });
        return;
      }

      const results: { orderId: string; result: string }[] = [];
      for (const entry of eligible.slice(0, limit)) {
        try {
          await ReviewService.queueFromOrderPage(entry.page, true);
          const ref = reviewRequests().doc(entry.orderId);
          const request = (await ref.get()).data() as ReviewRequest | undefined;
          if (!request || request.status !== "queued") {
            results.push({ orderId: entry.orderId, result: "skipped: no queued request" });
            continue;
          }
          await ref.update({ status: "sending" });
          try {
            await ReviewService.sendRequestEmail(request, entry.items, false);
          } catch (error) {
            await ref.update({ status: "queued" });
            throw error;
          }
          // One ask only: "done" means the daily job never sends these a reminder.
          await ref.update({ status: "done", firstSentAt: Date.now(), backfill: true });
          await checkOrderBox(entry.page, REQUEST_SENT_PROPERTY, entry.orderId);
          results.push({ orderId: entry.orderId, result: "sent" });
        } catch (error) {
          results.push({ orderId: entry.orderId, result: `failed: ${(error as Error).message}` });
        }
        await sleep(1200); // stay well under EmailJS's rate limit
      }
      res.json({ dryRun: false, sent: results.filter((entry) => entry.result === "sent").length,
        remaining: Math.max(0, eligible.length - limit), results });
    } catch (error) {
      logger.error("Error running review backfill", { error: (error as Error).message });
      res.status(500).json({ error: (error as Error).message });
    }
  }

  /**
   * Admin: runs the daily job's next step for one order —
   * the first request, or the reminder once that's been sent — skipping the
   * 7-day waits and the 30-day rule. Everything else is real, including the
   * Notion checkboxes, but the email only goes to ?to=.
   */
  static async handleAdminRunReviewEmails(req: Request, res: Response): Promise<void> {
    const orderId = String(req.query.order || "");
    const to = String(req.query.to || "");
    if (!orderId || !/^[^@\s]+@[^@\s]+$/.test(to)) {
      res.status(400).json({ error: "Pass ?order=<Order #>&to=<your email>. The email only goes to the address you give." });
      return;
    }
    try {
      const request = await ReviewService.requestForNotionOrder(orderId, req.query.reset === "true");
      if (!request) {
        res.status(422).json({ error: "No review request for this order (no reviewable items, or it's a subscription renewal)." });
        return;
      }
      const options: StepOptions = { ignoreTiming: true, to, siteUrl: siteUrlFor() };
      const ref = reviewRequests().doc(orderId);
      const result = request.status === "sent"
        ? await ReviewService.processReminder(ref, options)
        : await ReviewService.processFirstRequest(ref, options);
      const after = (await ref.get()).data() as ReviewRequest;
      res.json({ orderId, result, statusBefore: request.status, statusAfter: after.status, to });
    } catch (error) {
      logger.error("Error running dev review emails", { orderId, error: (error as Error).message });
      res.status(500).json({ error: (error as Error).message });
    }
  }

  /**
   * Returns a review's photos with permanent URLs. Photos uploaded straight
   * into Notion get expiring links, so they are copied to Cloud Storage and the
   * row is updated to point at the copies.
   */
  private static async withStoredPhotos(review: ReviewModel): Promise<ReviewPhoto[]> {
    if (!review.photos.some((photo) => photo.hostedByNotion)) return review.photos;
    try {
      const photos = await Promise.all(review.photos.map(async (photo): Promise<ReviewPhoto> => {
        if (!photo.hostedByNotion) return photo;
        const response = await fetch(photo.url);
        if (!response.ok) throw new Error(`Download failed: ${response.status}`);
        const url = await storeReviewPhoto(
          review.orderId || review.id, review.parentProductId || review.productId || "unknown", Buffer.from(await response.arrayBuffer()));
        return { url, hostedByNotion: false };
      }));
      await updateReview(review.id, { photos });
      return photos;
    } catch (error) {
      logger.warn("Unable to copy Notion-hosted review photos", { reviewId: review.id, error: (error as Error).message });
      return review.photos.filter((photo) => !photo.hostedByNotion);
    }
  }

  /**
   * Rebuilds the public review cache from Notion. Star-only ratings from a
   * known order count immediately; anything with written text or photos, or
   * that can't be matched to an order, needs "Approved" checked first.
   */
  static async syncReviewsCache(): Promise<ReviewsCache> {
    const lookup = await loadInventoryLookup();
    const requestCache = new Map<string, ReviewRequest | null>();
    const findRequest = async (orderId: string): Promise<ReviewRequest | null> => {
      if (!orderId) return null;
      if (!requestCache.has(orderId)) {
        const snapshot = await reviewRequests().doc(orderId).get();
        requestCache.set(orderId, snapshot.exists ? snapshot.data() as ReviewRequest : null);
      }
      return requestCache.get(orderId) || null;
    };

    // Every Notion row counts; the review form already keeps one row per order + product.
    const publicReviews: { parentSku: string; review: ReviewModel }[] = [];
    for (const stored of await listReviews()) {
      if (!hasValidRating(stored)) continue;
      const request = await findRequest(stored.orderId);
      const requestItem = request?.items.find((item) => item.sku === stored.productId || item.parentSku === stored.productId);
      const parentSku = stored.parentProductId || requestItem?.parentSku || lookup.get(stored.productId)?.parentSku || stored.productId;
      if (!parentSku) continue;

      // Fill in what the form can't know so the Notion row is complete.
      const missing: Partial<ReviewModel> = {};
      if (!stored.parentProductId) missing.parentProductId = parentSku;
      if (!stored.purchaseDate && request?.purchaseDate) missing.purchaseDate = request.purchaseDate.slice(0, 10);
      if (Object.keys(missing).length) {
        await updateReview(stored.id, missing).catch((error: Error) =>
          logger.warn("Unable to backfill review row", { reviewId: stored.id, error: error.message }));
      }

      const review: ReviewModel = { ...stored, parentProductId: parentSku, photos: await ReviewService.withStoredPhotos(stored) };
      // Star-only ratings from a known order count right away; text and photos need approval.
      const isPublic = review.approved || (!review.text && review.photos.length === 0 && !!requestItem);
      if (isPublic) publicReviews.push({ parentSku, review: toPublishedReview(review) });
    }

    const products: Record<string, ProductReviewSummary> = {};
    const totals: Record<string, number> = {};
    for (const { parentSku, review } of publicReviews) {
      products[parentSku] ||= { average: 0, count: 0, reviews: [] };
      products[parentSku].count += 1;
      totals[parentSku] = (totals[parentSku] || 0) + review.rating;
      if (review.text || review.photos.length) products[parentSku].reviews.push(review);
    }
    for (const [parentSku, summary] of Object.entries(products)) {
      summary.average = Math.round((totals[parentSku] / summary.count) * 10) / 10;
      summary.reviews.sort((a, b) => b.reviewDate.localeCompare(a.reviewDate));
    }

    const cache: ReviewsCache = { products, lastSyncedAt: Date.now() };
    await getDatabase().collection(REVIEWS_CACHE_DOC.collection).doc(REVIEWS_CACHE_DOC.id).set(cache);
    logger.info("Reviews cache synced", { products: Object.keys(products).length, ratings: publicReviews.length });
    return cache;
  }

  private static async getReviewsCache(): Promise<ReviewsCache> {
    const snapshot = await getDatabase().collection(REVIEWS_CACHE_DOC.collection).doc(REVIEWS_CACHE_DOC.id).get();
    const cache = snapshot.exists ? snapshot.data() as ReviewsCache : null;
    if (cache && Date.now() - cache.lastSyncedAt < REVIEWS_CACHE_TTL_MS) return cache;
    try {
      return await ReviewService.syncReviewsCache();
    } catch (error) {
      if (cache) {
        logger.warn("Serving stale reviews cache", { error: (error as Error).message });
        return cache;
      }
      throw error;
    }
  }

  /** GET /reviews/:sku — public review summary for a parent product SKU. */
  static async handleGetProductReviews(req: Request, res: Response): Promise<void> {
    try {
      const cache = await ReviewService.getReviewsCache();
      const summary = cache.products[req.params.sku] || { average: 0, count: 0, reviews: [] };
      res.set("Cache-Control", "public, max-age=300");
      res.json(summary);
    } catch (error) {
      logger.error("Error fetching product reviews", { sku: req.params.sku, error: (error as Error).message });
      res.status(500).json({ error: "Unable to load reviews" });
    }
  }

  /** Loads the review request an emailed link points at, if the key matches. */
  private static async resolveRequest(orderId: string, key: string): Promise<ReviewRequest | null> {
    if (!orderId || !key) return null;
    const snapshot = await reviewRequests().doc(orderId).get();
    const request = snapshot.exists ? snapshot.data() as ReviewRequest : null;
    return request?.key === key ? request : null;
  }

  /** Loads the review request and one of its products, if the key matches. */
  private static async resolveRequestItem(orderId: string, key: string, sku: string):
    Promise<{ request: ReviewRequest; item: ReviewRequestItem } | null> {
    const request = await ReviewService.resolveRequest(orderId, key);
    const item = request?.items.find((candidate) => candidate.parentSku === sku);
    return request && item ? { request, item } : null;
  }

  /** GET /reviews/request — every product in an emailed order, with any answers already saved. */
  static async handleGetReviewRequest(req: Request, res: Response): Promise<void> {
    const orderId = String(req.query.order || "");
    try {
      const request = await ReviewService.resolveRequest(orderId, String(req.query.key || ""));
      if (!request) {
        res.status(404).json({ error: "This review link is invalid or has expired." });
        return;
      }
      const items = await Promise.all(request.items.map(async (item) => {
        const existing = await reviewSubmissions().doc(submissionId(orderId, item.parentSku)).get();
        const submission = existing.exists ? existing.data() as ReviewSubmission : null;
        return {
          sku: item.parentSku,
          productName: item.name,
          imageUrl: item.imageUrl,
          rating: submission?.rating || null,
          text: submission?.text || "",
          photos: submission?.photos || [],
        };
      }));
      res.json({ firstName: request.firstName, items });
    } catch (error) {
      logger.error("Error resolving review request", { orderId, error: (error as Error).message });
      res.status(500).json({ error: "Unable to load this review." });
    }
  }

  /**
   * POST /reviews/unsubscribe — stops all future review emails to the customer
   * an emailed link belongs to. Their existing reviews are unaffected.
   */
  static async handleUnsubscribe(req: Request, res: Response): Promise<void> {
    const orderId = String(req.body?.order || "");
    try {
      const request = await ReviewService.resolveRequest(orderId, String(req.body?.key || ""));
      if (!request) {
        res.status(404).json({ error: "This link is invalid or has expired." });
        return;
      }
      await ReviewService.setOptedOut([request.email], true, `email link (order ${orderId})`);
      res.json({ ok: true });
    } catch (error) {
      logger.error("Error unsubscribing from review emails", { orderId, error: (error as Error).message });
      res.status(500).json({ error: "We couldn't update your preferences. Please try again." });
    }
  }

  /** POST /reviews/resubscribe — undoes an unsubscribe from the same emailed link. */
  static async handleResubscribe(req: Request, res: Response): Promise<void> {
    const orderId = String(req.body?.order || "");
    try {
      const request = await ReviewService.resolveRequest(orderId, String(req.body?.key || ""));
      if (!request) {
        res.status(404).json({ error: "This link is invalid or has expired." });
        return;
      }
      await ReviewService.setOptedOut([request.email], false, `email link (order ${orderId})`);
      res.json({ ok: true });
    } catch (error) {
      logger.error("Error resubscribing to review emails", { orderId, error: (error as Error).message });
      res.status(500).json({ error: "We couldn't update your preferences. Please try again." });
    }
  }

  /** POST /reviews/photos — stores one photo for an emailed review link; the body is the raw image. */
  static async handleUploadReviewPhoto(req: Request, res: Response): Promise<void> {
    const orderId = String(req.query.order || "");
    try {
      const resolved = await ReviewService.resolveRequestItem(orderId, String(req.query.key || ""), String(req.query.sku || ""));
      if (!resolved) {
        res.status(404).json({ error: "This review link is invalid or has expired." });
        return;
      }
      // Cloud Functions may read the body before Express does and keep it on rawBody.
      const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
      const bytes = Buffer.isBuffer(req.body) && req.body.length ? req.body : rawBody || Buffer.alloc(0);
      if (!bytes.length) {
        res.status(400).json({ error: "No photo was received." });
        return;
      }
      if (bytes.length > MAX_REVIEW_PHOTO_BYTES) {
        res.status(413).json({ error: "Photos must be 5 MB or smaller." });
        return;
      }
      if (!PHOTO_TYPES.some((type) => type.matches(bytes))) {
        res.status(415).json({ error: "Photos must be JPEG, PNG, or WebP images." });
        return;
      }
      const counter = getDatabase().collection(REVIEW_PHOTO_UPLOADS_COLLECTION).doc(submissionId(orderId, resolved.item.parentSku));
      await counter.set({ count: FieldValue.increment(1) }, { merge: true });
      if (((await counter.get()).data()?.count || 0) > MAX_PHOTO_UPLOADS_PER_REVIEW) {
        res.status(429).json({ error: "Too many photos have been uploaded for this review." });
        return;
      }
      const url = await storeReviewPhoto(orderId, resolved.item.parentSku, bytes);
      res.json({ url });
    } catch (error) {
      logger.error("Error uploading review photo", { orderId, error: (error as Error).message });
      res.status(500).json({ error: "We couldn't upload that photo. Please try again." });
    }
  }

  /**
   * POST /reviews/submit — saves a rating (and optional text) for one product
   * in an order. Called when the review page opens and again on Submit, so it
   * writes one Notion row per order + product and updates it afterwards.
   */
  static async handleSubmitReview(req: Request, res: Response): Promise<void> {
    const { order, key, sku } = req.body || {};
    const rating = Number(req.body?.rating);
    const text = typeof req.body?.text === "string" ? req.body.text.trim().slice(0, MAX_REVIEW_LENGTH) : undefined;
    const photos: string[] | undefined = Array.isArray(req.body?.photos)
      ? req.body.photos.filter((url: unknown): url is string => typeof url === "string")
      : undefined;
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      res.status(400).json({ error: "Please choose between 1 and 5 stars." });
      return;
    }
    try {
      const resolved = await ReviewService.resolveRequestItem(String(order || ""), String(key || ""), String(sku || ""));
      if (!resolved) {
        res.status(404).json({ error: "This review link is invalid or has expired." });
        return;
      }
      if (photos && (photos.length > MAX_PHOTOS_PER_REVIEW ||
        photos.some((url) => !isOwnPhotoUrl(url, resolved.request.orderId, resolved.item.parentSku)))) {
        res.status(400).json({ error: `Please attach up to ${MAX_PHOTOS_PER_REVIEW} photos.` });
        return;
      }
      await ReviewService.saveSubmission(resolved.request, resolved.item, rating, text, photos);
      res.json({ ok: true });
    } catch (error) {
      logger.error("Error saving review", { orderId: order, error: (error as Error).message });
      res.status(500).json({ error: "We couldn't save your review. Please try again." });
    }
  }

  private static async saveSubmission(
    request: ReviewRequest,
    item: ReviewRequestItem,
    rating: number,
    text: string | undefined,
    photos: string[] | undefined,
  ): Promise<void> {
    const ref = reviewSubmissions().doc(submissionId(request.orderId, item.parentSku));

    // Claim the row: whoever creates the Firestore doc creates the Notion page,
    // so the open-page save and a quick Submit can't produce two rows.
    let isCreator = false;
    try {
      await ref.create({
        orderId: request.orderId, parentSku: item.parentSku, rating, text: text || "", photos: photos || [], updatedAt: Date.now(),
      });
      isCreator = true;
    } catch (error) {
      if ((error as { code?: number }).code !== 6) throw error; // 6 = ALREADY_EXISTS
    }

    if (isCreator) {
      try {
        const notionPageId = await createReview({
          productName: item.name,
          productId: item.sku,
          parentProductId: item.parentSku,
          rating,
          firstName: request.firstName,
          lastName: request.lastName,
          orderId: request.orderId,
          purchaseDate: request.purchaseDate.slice(0, 10),
          text: text || "",
          photos: storedPhotos(photos || []),
          approved: false,
          response: "",
        });
        await ref.update({ notionPageId });
      } catch (error) {
        await ref.delete(); // let the next attempt create the row
        throw error;
      }
      return;
    }

    let submission = (await ref.get()).data() as ReviewSubmission | undefined;
    for (let attempt = 0; !submission?.notionPageId && attempt < 10; attempt++) {
      await sleep(500);
      submission = (await ref.get()).data() as ReviewSubmission | undefined;
    }
    if (!submission?.notionPageId) throw new Error("Review row is still being created");

    const nextText = text ?? submission.text;
    const nextPhotos = photos ?? submission.photos ?? [];
    const changes: Partial<ReviewModel> = { rating };
    if (text !== undefined && text !== submission.text) changes.text = text;
    if (photos !== undefined && photos.join("|") !== (submission.photos || []).join("|")) changes.photos = storedPhotos(photos);
    // Edited text or photos have to be approved again before they appear on the site.
    if (changes.text !== undefined || changes.photos !== undefined) changes.approved = false;
    await updateReview(submission.notionPageId, changes);
    await ref.update({ rating, text: nextText, photos: nextPhotos, updatedAt: Date.now() });
  }
}
