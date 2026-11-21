import { FieldValue } from "firebase-admin/firestore";
import { getDatabase } from "../integrations/firebase_admin";
import { getEasyPostClient } from "../integrations/easypost/easypost_client";
import { createLogger } from "../logger";
import { purchaseShipmentOnce } from "../services/easypost_service";
import { EmailService, PurchaseItem } from "../services/email_service";
import { generateReceipt, storeCurrentLabel } from "./order_documents";
import { autoPrintOrder } from "./printing";

/**
 * Finishes a paid web checkout order after it's created: label, stored receipt and label,
 * customer confirmation and store notification. Payment has
 * already succeeded, so nothing here charges the customer. Each step records
 * when it finished on the order (`fulfillment.*`), and a retried trigger
 * resumes at the first unfinished one.
 */
const logger = createLogger("checkout_fulfillment");

interface CheckoutOrder {
  id: string;
  source: string;
  // Subscription checkouts set up on the server are fulfilled here too.
  serverFulfilled?: boolean;
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

/** Orders this module fulfills: web checkouts, and subscription checkouts set up on the server. */
export const isServerFulfilled = (order: { source?: string; serverFulfilled?: boolean } | undefined): boolean =>
  !!order && (order.source === "web-checkout" || (order.source === "subscription-checkout" && order.serverFulfilled === true));

export const fulfillCheckoutOrder = async (orderId: string): Promise<void> => {
  const orderRef = getDatabase().collection("orders").doc(orderId);
  const order = (await orderRef.get()).data() as CheckoutOrder | undefined;
  if (!order || !isServerFulfilled(order)) return;
  const done = order.fulfillment || {};
  const mark = (step: string, extra: Record<string, unknown> = {}) =>
    orderRef.update({ [`fulfillment.${step}`]: new Date().toISOString(), ...extra });

  try {
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
    }

    // Receipt and label copies for staff (Cloud Storage). Neither can hold up the customer's emails.
    await storeCurrentLabel(orderId);
    await generateReceipt(orderId);

    // Receipt, then label, on the shop's printer (when auto-print is on). Never throws.
    if (!done.printedAt && await autoPrintOrder(orderId)) await mark("printedAt");

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
