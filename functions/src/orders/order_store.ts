import { getDatabase } from "../integrations/firebase_admin";
import { AdminOrder, OrderEmailFlags } from "./order_model";
import { OrderRepository } from "./order_repository";

/**
 * Orders as the rest of the backend reads and changes them: from Firestore,
 * the source of truth. Notion's Online Orders database is kept as a
 * best-effort copy while the team still has it open; nothing reads it back.
 */

const orders = () => getDatabase().collection("orders");

/** Display name for the carrier, from Notion's column or EasyPost's code. */
export const carrierName = (order: Partial<AdminOrder> & { shippingCarrier?: string | null }): string => {
  if (order.trackingCarrier) return order.trackingCarrier;
  const code = order.shippingCarrier || "";
  if (code === "UPSDAP") return "UPS";
  if (code === "FedExDefault") return "FedEx";
  return code;
};

/** `name,sku,quantity` per line, the format review requests parse. */
export const itemsFormatted = (order: AdminOrder): string =>
  order.items
    .filter((item) => item.sku)
    .map((item) => `${item.name},${item.sku},${item.internalQuantity ?? item.quantity}`)
    .join("\n");

/** One line per item for emails, e.g. "2x Ethiopia Guji (200g)". */
export const itemsSummary = (order: AdminOrder): string =>
  order.itemsSummary ||
  order.items.map((item) => `${item.quantity}x ${item.name}`).join("\n");

const emailsOf = (emails: string[]) =>
  [...new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean))];

export const OrderStore = {
  get: (orderId: string) => OrderRepository.get(orderId),

  /** Every order placed with any of these emails, newest first. */
  async forEmails(emails: string[]): Promise<AdminOrder[]> {
    const unique = emailsOf(emails);
    const found = new Map<string, AdminOrder>();
    // Firestore's "in" takes at most 30 values.
    for (let index = 0; index < unique.length; index += 30) {
      const snapshot = await orders().where("emailNormalized", "in", unique.slice(index, index + 30)).get();
      for (const doc of snapshot.docs) {
        const order = await OrderRepository.get(doc.id);
        if (order) found.set(order.id, order);
      }
    }
    return [...found.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  /** Paid (or partly refunded) orders still waiting on their final delivered or picked-up email. */
  async awaitingStatusEmails(): Promise<AdminOrder[]> {
    const snapshot = await orders()
      .where("emails.delivered", "==", false)
      .where("emails.pickedUp", "==", false)
      .get();
    const list = await Promise.all(snapshot.docs.map((doc) => OrderRepository.get(doc.id)));
    return list.filter((order): order is AdminOrder =>
      !!order && (order.paymentStatus === "paid" || order.paymentStatus === "partially_refunded"));
  },

  /**
   * Marks a customer email as sent and, optionally, moves the fulfillment
   * status. Recorded on the Firestore order.
   */
  async markEmailSent(
    order: AdminOrder,
    flag: keyof OrderEmailFlags,
    fulfillmentStatus?: AdminOrder["fulfillmentStatus"],
  ): Promise<void> {
    // A nested object, not "emails.<flag>": update() uses set({merge: true}),
    // which stores a dotted key as a literal top-level field name.
    await OrderRepository.update(order.id, {
      emails: { [flag]: true },
      ...(fulfillmentStatus ? { fulfillmentStatus } : {}),
    } as Record<string, unknown>);
  },

  /** True when any of these emails has an order that used this code. */
  async hasUsedDiscountCode(emails: string[], code: string): Promise<boolean> {
    const target = code.trim().toUpperCase();
    return (await OrderStore.forEmails(emails))
      .some((order) => (order.discountCode || "").trim().toUpperCase() === target);
  },

  /** True when any of these emails has placed an order. */
  async hasPreviousOrders(emails: string[]): Promise<boolean> {
    const unique = emailsOf(emails);
    for (let index = 0; index < unique.length; index += 30) {
      const snapshot = await orders().where("emailNormalized", "in", unique.slice(index, index + 30)).limit(1).get();
      if (!snapshot.empty) return true;
    }
    return false;
  },
};
