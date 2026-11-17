import { getDatabase } from "../integrations/firebase_admin";
import { getNotionClient } from "../integrations/notion/notion_client";
import { createLogger } from "../logger";
import {
  AdminOrder,
  fulfillmentFromNotion,
  FulfillmentStatus,
  legacyStatus,
  NOTION_FULFILLMENT,
  OrderItem,
  paymentFromNotion,
} from "./order_model";

/**
 * Keeps orders/{id} in step with the Notion "Online Orders" database while web
 * checkout still writes there. Notion is read, never changed, except for the
 * fulfillment status set from the dashboard (setNotionFulfillment).
 *
 * Orders that already exist in Firestore from another source (subscription
 * checkouts) keep their own money and item fields; only the fulfillment,
 * shipping and email fields come from Notion.
 */
const logger = createLogger("notion_order_sync");

const STATE_DOC = "admin_sync/notion_orders";

const databaseId = (): string => {
  const id = process.env.NOTION_ONLINE_ORDERS_DATABASE_ID;
  if (!id) throw new Error("NOTION_ONLINE_ORDERS_DATABASE_ID is not configured");
  return id;
};

// ---- Reading Notion properties ----

type Props = Record<string, any>;

const richText = (property: any): string =>
  ((property?.rich_text || property?.title || []) as any[]).map((part) => part.plain_text || "").join("").trim();
const checkbox = (property: any): boolean => property?.checkbox === true;
const select = (property: any): string => property?.select?.name || property?.status?.name || "";
const nullable = (value: string): string | null => (value && value !== "N/A" ? value : null);

/** "Name (variant),SKU,qty" per line, as createNotionOrder writes it. */
export const parseItems = (formatted: string, summary: string): OrderItem[] => {
  const fromFormatted = formatted
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      // The name can contain commas; SKU and quantity are the last two fields.
      const parts = line.split(",");
      const quantity = Number(parts.pop());
      const sku = (parts.pop() || "").trim();
      return {
        name: parts.join(",").trim(),
        sku,
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
        price: null,
      };
    })
    .filter((item) => item.name);
  if (fromFormatted.length) return fromFormatted;
  // Older orders only have "2x Name (variant)" lines.
  return summary
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)\s*x\s*(.+)$/i);
      return { name: (match ? match[2] : line).trim(), sku: "", quantity: match ? Number(match[1]) : 1, price: null };
    });
};

const toIsoDate = (value: string | undefined, fallback: string): string => {
  const parsed = value ? Date.parse(value) : NaN;
  return new Date(Number.isNaN(parsed) ? fallback : parsed).toISOString();
};

/** Maps one Notion page to order fields; null for pages without an order number. */
export const orderFromNotionPage = (page: any, now: string): AdminOrder | null => {
  const p: Props = page.properties || {};
  // Kept exactly as written: it's the document id customers' account pages match on.
  const id = richText(p["Order #"]);
  if (!id || id.includes("/")) return null;
  const email = (p.Email?.email || "").trim();
  const paymentStatus = paymentFromNotion(select(p.Status));
  const itemsSummary = richText(p["Items ordered"]);
  return {
    id,
    origin: "notion",
    seq: p["Seq #"]?.unique_id?.number ?? null,
    customerName: richText(p.Customer),
    email,
    emailNormalized: email.toLowerCase(),
    phone: p.Phone?.phone_number || null,
    createdAt: toIsoDate(p["Order created"]?.date?.start, page.created_time),
    status: legacyStatus(paymentStatus),
    paymentStatus,
    fulfillmentStatus: fulfillmentFromNotion(select(p.Fulfillment)),
    totalAmount: typeof p.Total?.number === "number" ? p.Total.number : 0,
    shippingLabelPrice: typeof p["Shipping Price"]?.number === "number" ? p["Shipping Price"].number : null,
    discountCode: nullable(richText(p["Discount Code"])),
    firstTimer: checkbox(p["First Timer"]),
    items: parseItems(richText(p["Items ordered formatted"]), itemsSummary),
    itemsSummary,
    isLocalPickup: checkbox(p["Local Pickup"]),
    orderPickupId: nullable(richText(p["Order Pickup ID"])),
    shippingAddress: nullable(richText(p["Shipping address"])),
    shippingBox: nullable(richText(p["Shipping Box"])),
    shipmentId: nullable(richText(p["Shipment ID"])),
    trackingNumber: nullable(richText(p["Tracking Info"])),
    trackingCarrier: nullable(select(p["Tracking Carrier"])),
    shippingService: nullable(select(p["Carrier Type"])),
    trackingLabelUrl: p["Tracking Label"]?.url || null,
    paymentIntentId: nullable(richText(p["Transaction ID"])),
    receiptUrl: p.Receipt?.url || null,
    emails: {
      orderConfirmed: checkbox(p["Order Confirmed Email Sent"]),
      shipped: checkbox(p["Shipped Email Sent"]),
      outForDelivery: checkbox(p["Out For Delivery Email Sent"]),
      delivered: checkbox(p["Delivered Email Sent"]),
      readyForPickup: checkbox(p["Ready For Pickup Email Sent"]),
      pickedUp: checkbox(p["Picked Up Email Sent"]),
      reviewRequest: checkbox(p["Review Request Sent"]),
      reviewReminder: checkbox(p["Review Reminder Sent"]),
    },
    notion: { pageId: page.id, lastEditedAt: page.last_edited_time, syncedAt: now },
    updatedAt: now,
  };
};

/** Fields Notion owns even on orders that started in Firestore. */
const OPERATIONAL_FIELDS: (keyof AdminOrder)[] = [
  "seq", "paymentStatus", "fulfillmentStatus", "shippingLabelPrice", "firstTimer", "shipmentId",
  "trackingNumber", "trackingCarrier", "shippingService", "trackingLabelUrl", "receiptUrl",
  "emails", "notion", "updatedAt",
];

// ---- Sync ----

export interface SyncResult {
  scanned: number;
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  since: string | null;
}

/**
 * Imports Notion orders edited since the last run (or all of them when
 * `full`). Safe to run repeatedly: unchanged pages are skipped by their
 * last-edited time.
 */
export const syncNotionOrders = async (options: { full?: boolean } = {}): Promise<SyncResult> => {
  const db = getDatabase();
  const stateRef = db.doc(STATE_DOC);
  const state = (await stateRef.get()).data() as { lastEditedCursor?: string } | undefined;
  // Notion's last_edited_time is minute-precision; overlap so nothing is missed.
  const since = options.full || !state?.lastEditedCursor
    ? null
    : new Date(Date.parse(state.lastEditedCursor) - 2 * 60 * 1000).toISOString();

  const notion = getNotionClient();
  const now = new Date().toISOString();
  const result: SyncResult = { scanned: 0, created: 0, updated: 0, unchanged: 0, skipped: 0, since };
  let newestEdit = state?.lastEditedCursor || "";
  let cursor: string | undefined;

  do {
    const response: any = await notion.databases.query({
      database_id: databaseId(),
      start_cursor: cursor,
      page_size: 100,
      sorts: [{ timestamp: "last_edited_time", direction: "ascending" }],
      ...(since ? { filter: { timestamp: "last_edited_time", last_edited_time: { on_or_after: since } } } : {}),
    } as any);

    const pages = response.results.filter((page: any) => "properties" in page && !page.archived);
    const mapped = pages
      .map((page: any) => orderFromNotionPage(page, now))
      .filter((order: AdminOrder | null): order is AdminOrder => {
        if (!order) result.skipped += 1;
        return order !== null;
      });
    result.scanned += pages.length;

    const refs = mapped.map((order: AdminOrder) => db.collection("orders").doc(order.id));
    const existing = refs.length ? await db.getAll(...refs) : [];
    const batch = db.batch();
    mapped.forEach((order: AdminOrder, index: number) => {
      const snapshot = existing[index];
      if (order.notion!.lastEditedAt > newestEdit) newestEdit = order.notion!.lastEditedAt;
      if (!snapshot.exists) {
        batch.set(refs[index], order);
        batch.create(refs[index].collection("events").doc(), {
          at: now,
          type: "imported",
          actor: null,
          message: "Imported from Notion",
        });
        result.created += 1;
        return;
      }
      const current = snapshot.data() as Partial<AdminOrder>;
      if (current.notion?.lastEditedAt === order.notion!.lastEditedAt && !options.full) {
        result.unchanged += 1;
        return;
      }
      const changes = current.origin === "notion"
        // accountId is set by account linking, never by Notion.
        ? { ...order, ...(current.accountId ? { accountId: current.accountId } : {}) }
        : Object.fromEntries(OPERATIONAL_FIELDS.map((field) => [field, order[field]]));
      batch.set(refs[index], changes, { merge: true });
      result.updated += 1;
    });
    await batch.commit();
    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);

  await stateRef.set({ lastEditedCursor: newestEdit || now, lastRunAt: now, lastResult: result }, { merge: true });
  logger.info("Notion orders synced", result);
  return result;
};

/** Sets the order's Fulfillment status in Notion, which the email automation watches. */
export const setNotionFulfillment = async (pageId: string, status: FulfillmentStatus): Promise<string> => {
  const page: any = await getNotionClient().pages.update({
    page_id: pageId,
    properties: { Fulfillment: { status: { name: NOTION_FULFILLMENT[status] } } } as any,
  });
  return page.last_edited_time;
};
