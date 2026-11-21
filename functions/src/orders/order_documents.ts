import { getDatabase, getStorageBucket } from "../integrations/firebase_admin";
import { createLogger } from "../logger";
import { generateReceiptImage, ReceiptOrderData } from "../services/pictify_service";
import type { LabelDocument, OrderDocument, OrderDocuments } from "./order_model";

const logger = createLogger("order_documents");

/**
 * Each order's receipt and purchased shipping labels live in Cloud Storage
 * under order-documents/{orderId}/. Objects carry no download token, so the
 * only way to read them is adminApi, which checks the staff member first.
 * What's stored is recorded on the order as `documents`.
 */
const orderRef = (orderId: string) => getDatabase().collection("orders").doc(orderId);

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "application/pdf": "pdf",
};

const contentTypeOf = (header: string | null, url: string, bytes: Buffer): string => {
  const declared = (header || "").split(";")[0]?.trim().toLowerCase() ?? "";
  if (EXTENSIONS[declared]) return declared;
  // Some hosts send application/octet-stream, so go by the file's own signature.
  if (bytes.subarray(0, 4).toString("latin1") === "%PDF") return "application/pdf";
  if (bytes.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return "image/png";
  if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "image/jpeg";
  const ext = url.split("?")[0]?.split(".").pop()?.toLowerCase();
  return ext === "pdf" ? "application/pdf" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/png";
};

const download = async (url: string): Promise<{ bytes: Buffer; contentType: string }> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed (${response.status})`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw new Error("Downloaded file is empty");
  return { bytes, contentType: contentTypeOf(response.headers.get("content-type"), url, bytes) };
};

const store = async (path: string, bytes: Buffer, contentType: string): Promise<void> => {
  await getStorageBucket().file(path).save(bytes, {
    contentType,
    resumable: false,
    metadata: { cacheControl: "private, max-age=0, no-store" },
  });
};

const documentsOf = async (orderId: string): Promise<{ data: Record<string, any>; documents: OrderDocuments } | null> => {
  const snapshot = await orderRef(orderId).get();
  if (!snapshot.exists) return null;
  const data = snapshot.data() as Record<string, any>;
  return { data, documents: (data.documents || {}) as OrderDocuments };
};

export type ReceiptSource = OrderDocument["source"];

/** Stores a receipt image for the order, replacing any earlier one. */
export const saveReceipt = async (orderId: string, bytes: Buffer, contentType: string, source: ReceiptSource): Promise<OrderDocument> => {
  const path = `order-documents/${orderId}/receipt.${EXTENSIONS[contentType] || "png"}`;
  await store(path, bytes, contentType);
  const document: OrderDocument = { path, contentType, size: bytes.length, storedAt: new Date().toISOString(), source };
  await orderRef(orderId).update({ "documents.receipt": document });
  return document;
};

/** Builds the Pictify receipt from an order document: web checkouts, renewals and dashboard orders. */
export const receiptInput = (orderId: string, data: Record<string, any>): ReceiptOrderData => {
  const items = ((data.items || []) as any[]).map((item) => {
    const selections = (item.selections || {}) as Record<string, unknown>;
    const variations = typeof selections.variations === "string" && selections.variations
      ? selections.variations
      : Object.values(selections).filter((value): value is string => typeof value === "string" && value.trim() !== "").join(", ");
    return {
      name: String(item.name || ""),
      ...(item.sku ? { sku: String(item.sku) } : {}),
      quantity: Number(item.quantity) || 0,
      price: Number(item.price) || 0,
      ...(variations ? { variations } : {}),
    };
  });
  const total = Number(data.totalAmount) || 0;
  const shipping = Number(data.shippingCharged) || 0;
  const tax = data.taxAmount !== undefined && data.taxAmount !== null ? Number(data.taxAmount) : undefined;
  const subtotal = data.subtotal !== undefined && data.subtotal !== null && data.subtotal !== ""
    ? Number(data.subtotal)
    : Math.round((total - shipping - (tax || 0)) * 100) / 100;
  return {
    orderId,
    customerName: String(data.customerName || ""),
    customerEmail: String(data.email || ""),
    customerAddress: String(data.billingAddress || data.renewal?.billingAddress || data.shippingAddress || "N/A"),
    items,
    subtotal,
    shipping,
    ...(tax !== undefined ? { tax } : {}),
    totalAmount: total,
    orderDate: String(data.createdAt || new Date().toISOString()),
    transactionId: String(data.paymentIntentId || data.paymentReference || orderId),
    ...(data.discountCode ? { discountCode: String(data.discountCode) } : {}),
  };
};

/**
 * Makes the order's receipt with Pictify and stores it. Does nothing if one is
 * already stored (unless `replace`). Never throws: a missing receipt must not
 * hold up the customer's emails. True when the order has a receipt afterwards.
 */
export const generateReceipt = async (orderId: string, options: { replace?: boolean } = {}): Promise<boolean> => {
  try {
    const found = await documentsOf(orderId);
    if (!found) return false;
    if (found.documents.receipt && !options.replace) return true;
    const image = await generateReceiptImage(receiptInput(orderId, found.data));
    await saveReceipt(orderId, image, "image/png", "generated");
    return true;
  } catch (error) {
    logger.error("Couldn't generate the receipt", { orderId, error: (error as Error).message });
    return false;
  }
};

/** Stores one purchased label, once per shipment. */
export const saveLabel = async (
  orderId: string,
  label: { shipmentId: string; url: string; trackingNumber?: string | null; carrier?: string | null },
): Promise<LabelDocument> => {
  const found = await documentsOf(orderId);
  const existing = found?.documents.labels?.[label.shipmentId];
  if (existing) return existing;
  const { bytes, contentType } = await download(label.url);
  const path = `order-documents/${orderId}/labels/${label.shipmentId}.${EXTENSIONS[contentType] || "png"}`;
  await store(path, bytes, contentType);
  const document: LabelDocument = {
    path, contentType, size: bytes.length, storedAt: new Date().toISOString(), source: "easypost",
    shipmentId: label.shipmentId,
    trackingNumber: label.trackingNumber ?? null,
    carrier: label.carrier ?? null,
  };
  await orderRef(orderId).update({ [`documents.labels.${label.shipmentId}`]: document });
  return document;
};

/** Stores the label currently on the order. Never throws, so a storage hiccup can't undo a purchased label. */
export const storeCurrentLabel = async (orderId: string): Promise<void> => {
  try {
    const found = await documentsOf(orderId);
    const data = found?.data;
    if (!data?.shipmentId || !data.trackingLabelUrl) return;
    await saveLabel(orderId, {
      shipmentId: data.shipmentId,
      url: data.trackingLabelUrl,
      trackingNumber: data.trackingNumber ?? null,
      carrier: data.shippingCarrier ?? data.trackingCarrier ?? null,
    });
  } catch (error) {
    logger.error("Couldn't store the shipping label", { orderId, error: (error as Error).message });
  }
};

export class DocumentNotFound extends Error {}

/** Reads a stored document for a staff download. `labelId` is a shipment id. */
export const readDocument = async (
  orderId: string,
  kind: "receipt" | "label",
  labelId?: string,
): Promise<{ bytes: Buffer; contentType: string; filename: string }> => {
  const found = await documentsOf(orderId);
  const document = kind === "receipt" ? found?.documents.receipt : found?.documents.labels?.[labelId || ""];
  if (!found || !document) throw new DocumentNotFound("That document isn't stored for this order.");
  const [bytes] = await getStorageBucket().file(document.path).download();
  const ext = EXTENSIONS[document.contentType] || "png";
  const label = kind === "label" ? ((document as LabelDocument).trackingNumber || labelId) : "";
  return {
    bytes,
    contentType: document.contentType,
    filename: kind === "receipt" ? `Receipt - Order ${orderId}.${ext}` : `Shipping label - Order ${orderId} - ${label}.${ext}`,
  };
};
