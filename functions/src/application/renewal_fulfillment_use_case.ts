import { DocumentReference, FieldValue, Firestore } from "firebase-admin/firestore";
import { createLogger } from "../logger";
import { purchaseShipmentOnce } from "../services/easypost_service";
import { EmailService } from "../services/email_service";
import { AccountService } from "../services/account_service";
import { attachRenewalReceipt } from "../repositories/notion_order_repository";
import { RenewalFulfillment, RenewalOrder } from "../domain/subscriptions/renewal_order";

const logger = createLogger("renewal-fulfillment");

/**
 * Completes a paid renewal order: Notion projection, shipping label, receipt,
 * and emails. Payment has already succeeded, so nothing here can charge the
 * customer. Each step records its completion on the order, and a retried
 * trigger resumes at the first unfinished step.
 */
export class RenewalFulfillmentUseCase {
  constructor(private readonly db: Firestore) {}

  async execute(orderId: string): Promise<void> {
    const orderRef = this.db.collection("orders").doc(orderId);
    const order = (await orderRef.get()).data() as RenewalOrder | undefined;
    if (!order || order.source !== "subscription-renewal") return;
    const done = order.fulfillment || {};

    try {
      // Mirror first so operations sees the paid order even if a later step fails.
      if (!done.notionSyncedAt) {
        await AccountService.syncOrderMirrorById(orderId);
        await this.mark(orderRef, { notionSyncedAt: new Date().toISOString() });
      }

      const shipping = order.renewal.shipping;
      if (shipping && !done.labelPurchasedAt) {
        const shipment = await purchaseShipmentOnce(shipping.toAddress, shipping.rateId, shipping.parcel, shipping.easypostShipmentId);
        await orderRef.update({
          shipmentId: shipment.shipmentId,
          trackingNumber: shipment.trackingNumber,
          trackingLabelUrl: shipment.labelUrl,
          shippingCarrier: shipment.carrier || null,
          shippingService: shipment.service || null,
          shippingLabelPrice: shipment.shippingPrice || shipping.estimatedLabelPrice,
          "fulfillment.labelPurchasedAt": new Date().toISOString(),
        });
        // Re-mirror so the Notion page carries tracking and the label.
        await AccountService.syncOrderMirrorById(orderId);
      }

      if (!done.receiptAttachedAt && await attachRenewalReceipt(order)) {
        await this.mark(orderRef, { receiptAttachedAt: new Date().toISOString() });
      }

      const itemName = order.items.map((item) => `${item.name} (${item.selections.weight})`).join(", ");
      const quantity = order.items.reduce((sum, item) => sum + item.quantity, 0);
      if (!done.customerEmailSentAt) {
        await EmailService.sendSubscriptionOrderConfirmation({
          toEmail: order.email, customerName: order.customerName, orderId, itemName, quantity,
          totalAmount: order.totalAmount, shippingAmount: order.shippingCharged,
        });
        await this.mark(orderRef, { customerEmailSentAt: new Date().toISOString() });
      }
      if (!done.purchaseNotificationSentAt) {
        await EmailService.sendSubscriptionPurchaseNotification({
          customerEmail: order.email, customerName: order.customerName, orderId, itemName, quantity,
          unitAmount: order.items[0]?.price || 0, totalAmount: order.totalAmount,
          shippingAddress: order.isLocalPickup ? "Not applicable - Local pickup" : order.shippingAddress || "N/A",
          billingAddress: order.renewal.billingAddress || "N/A",
          deliveryMethod: order.isLocalPickup ? "Local Pickup" : "Shipping",
        });
        await this.mark(orderRef, { purchaseNotificationSentAt: new Date().toISOString() });
      }

      if (done.lastError) await orderRef.update({ "fulfillment.lastError": FieldValue.delete(), "fulfillment.lastErrorAt": FieldValue.delete() });
      logger.info("Renewal order fulfilled", { orderId });
    } catch (error: unknown) {
      const message = (error as Error).message || "Unknown fulfillment error";
      await this.mark(orderRef, { lastError: message, lastErrorAt: new Date().toISOString() });
      logger.error("Renewal order fulfillment failed; the trigger will retry", { orderId, error: message });
      throw error;
    }
  }

  private async mark(orderRef: DocumentReference, fields: Partial<RenewalFulfillment>): Promise<void> {
    await orderRef.update(Object.fromEntries(Object.entries(fields).map(([key, value]) => [`fulfillment.${key}`, value])));
  }
}
