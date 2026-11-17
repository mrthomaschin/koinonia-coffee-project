import { FieldValue } from "firebase-admin/firestore";
import { getDatabase } from "../integrations/firebase_admin";
import { getEasyPostClient } from "../integrations/easypost/easypost_client";
import { getNotionClient } from "../integrations/notion/notion_client";
import { createLogger } from "../logger";
import { AccountService } from "../services/account_service";
import { purchaseShipmentOnce } from "../services/easypost_service";
import { EmailService, PurchaseItem } from "../services/email_service";
import { attachOrderReceipt } from "../repositories/notion_order_repository";

/**
 * Finishes a paid web checkout order after it's created: Notion page, label,
 * receipt, customer confirmation and store notification. Payment has
 * already succeeded, so nothing here charges the customer. Each step records
 * when it finished on the order (`fulfillment.*`), and a retried trigger
 * resumes at the first unfinished one.
 *
 * Notion stays in the loop until its shipping-status emails, reviews and
 * discount checks read Firestore (next migration step).
 */
const logger = createLogger("checkout_fulfillment");

interface CheckoutOrder {
  id: string;
  source: string;
  customerName: string;
  email: string;
  phone: string | null;
  createdAt: string;
  totalAmount: number;
  subtotal: number;
  discountCode: string | null;
  discountPercent: number | null;
  discountAmount: number;
  shippingCharged: number;
  taxAmount: number;
  isLocalPickup: boolean;
  shippingAddress: string | null;
  billingAddress: string | null;
  shipmentId: string | null;
  shippingRateId: string | null;
  paymentIntentId: string;
  items: Array<{ name: string; sku: string; quantity: number; price: number; selections?: { variations?: string }; image?: string }>;
  fulfillment?: Record<string, string>;
}

const findNotionPageId = async (orderId: string): Promise<string | null> => {
  const databaseId = process.env.NOTION_ONLINE_ORDERS_DATABASE_ID;
  if (!databaseId) throw new Error("NOTION_ONLINE_ORDERS_DATABASE_ID is not configured");
  const result = await getNotionClient().databases.query({
    database_id: databaseId,
    filter: { property: "Order #", rich_text: { equals: orderId } },
  });
  return result.results[0]?.id ?? null;
};

export const fulfillCheckoutOrder = async (orderId: string): Promise<void> => {
  const orderRef = getDatabase().collection("orders").doc(orderId);
  const order = (await orderRef.get()).data() as CheckoutOrder | undefined;
  if (!order || order.source !== "web-checkout") return;
  const done = order.fulfillment || {};
  const mark = (step: string, extra: Record<string, unknown> = {}) =>
    orderRef.update({ [`fulfillment.${step}`]: new Date().toISOString(), ...extra });

  try {
    // Notion first, so the order shows up for packing even if a later step fails.
    if (!done.notionSyncedAt) {
      await AccountService.syncOrderMirrorById(orderId, { allowGuest: true });
      // Link the page now, so a dashboard status change reaches Notion (and its
      // emails) before the next scheduled sync.
      const pageId = await findNotionPageId(orderId);
      const now = new Date().toISOString();
      await mark("notionSyncedAt", pageId ? { notion: { pageId, lastEditedAt: "", syncedAt: now } } : {});
    }

    if (!order.isLocalPickup && order.shipmentId && order.shippingRateId && !done.labelPurchasedAt) {
      // The shipment and rate quoted at checkout, never ones the browser sends.
      const shipment: any = await getEasyPostClient().Shipment.retrieve(order.shipmentId);
      const to = shipment.to_address || {};
      const { length, width, height, weight } = shipment.parcel || {};
      const label = await purchaseShipmentOnce(
        { street1: to.street1, street2: to.street2 || undefined, city: to.city, state: to.state, zip: to.zip, country: to.country || "US" },
        order.shippingRateId,
        { length, width, height, weight },
        order.shipmentId,
      );
      await mark("labelPurchasedAt", {
        trackingNumber: label.trackingNumber,
        trackingLabelUrl: label.labelUrl,
        shippingCarrier: label.carrier || null,
        shippingService: label.service || null,
        shippingLabelPrice: label.shippingPrice ?? null,
        shippingBox: length ? `${length}x${width}x${height}` : null,
      });
      // Re-mirror so the Notion page carries tracking and the label.
      await AccountService.syncOrderMirrorById(orderId, { allowGuest: true });
    }

    if (!done.receiptAttachedAt) {
      const attached = await attachOrderReceipt({
        id: order.id,
        customerName: order.customerName,
        email: order.email,
        billingAddress: order.billingAddress || "N/A",
        items: order.items.map((item) => ({
          name: item.name, sku: item.sku, quantity: item.quantity, price: item.price,
          ...(item.selections?.variations ? { variations: item.selections.variations } : {}),
        })),
        subtotal: order.subtotal,
        shipping: order.shippingCharged,
        tax: order.taxAmount,
        totalAmount: order.totalAmount,
        createdAt: order.createdAt,
        paymentIntentId: order.paymentIntentId,
        ...(order.discountCode ? { discountCode: order.discountCode } : {}),
      });
      if (attached) await mark("receiptAttachedAt");
    }

    const items: PurchaseItem[] = order.items.map((item) => ({
      name: item.name,
      sku: item.sku,
      quantity: item.quantity,
      price: item.price,
      ...(item.selections?.variations ? { variations: item.selections.variations } : {}),
      ...(item.image ? { image: item.image } : {}),
    }));
    const discount = order.discountCode ? {
      discountCode: order.discountCode,
      ...(order.discountPercent !== null ? { discountPercent: order.discountPercent } : {}),
      discountAmount: order.discountAmount,
    } : {};

    if (!done.customerEmailSentAt) {
      await EmailService.sendCustomerConfirmation({
        customerEmail: order.email,
        customerName: order.customerName,
        ...(order.phone ? { customerPhone: order.phone } : {}),
        items,
        subtotal: order.subtotal,
        ...discount,
        shipping: order.shippingCharged,
        tax: order.taxAmount,
        totalAmount: order.totalAmount,
        orderDate: order.createdAt,
        orderId: order.id,
      });
      await mark("customerEmailSentAt", { "emails.orderConfirmed": true });
      // Keep Notion's checkbox in step while it's still the operations view.
      const pageId = await findNotionPageId(order.id);
      if (pageId) {
        await getNotionClient().pages.update({
          page_id: pageId,
          properties: { "Order Confirmed Email Sent": { checkbox: true } } as any,
        });
      }
    }

    if (!done.purchaseNotificationSentAt) {
      await EmailService.sendPurchaseNotification({
        customerEmail: order.email,
        customerName: order.customerName,
        ...(order.phone ? { customerPhone: order.phone } : {}),
        items,
        subtotal: order.subtotal,
        ...discount,
        totalAmount: order.totalAmount,
        orderDate: order.createdAt,
        sessionId: order.id,
        shippingAddress: order.shippingAddress || "",
        billingAddress: order.billingAddress || "",
        shippingMethod: order.isLocalPickup ? "Local Pickup" : "Shipping",
        isLocalPickup: order.isLocalPickup,
      });
      await mark("purchaseNotificationSentAt");
    }

    if (done.lastError) {
      await orderRef.update({ "fulfillment.lastError": FieldValue.delete(), "fulfillment.lastErrorAt": FieldValue.delete() });
    }
    logger.info("Web checkout order fulfilled", { orderId });
  } catch (error: unknown) {
    const message = (error as Error).message || "Unknown fulfillment error";
    await orderRef.update({ "fulfillment.lastError": message, "fulfillment.lastErrorAt": new Date().toISOString() });
    logger.error("Web checkout fulfillment failed; the trigger will retry", { orderId, error: message });
    throw error;
  }
};
