/**
 * The dashboard's view of an order at orders/{orderId}, where orderId is the
 * 8-character order number customers see.
 *
 * The collection already holds subscription checkout and renewal orders
 * written by account_service and the renewal use case. Those keep their own
 * fields; the fields below are added alongside them. Orders that started in the
 * Notion "Online Orders" database (every web checkout today) are imported with
 * origin "notion" and kept in step by the Notion sync until checkout writes to
 * Firestore directly. Money is in dollars, matching the existing documents.
 */

export const FULFILLMENT_STATUSES = [
  "pending",
  "processing",
  "dropped_off",
  "shipped",
  "out_for_delivery",
  "ready_for_pickup",
  "picked_up",
  "delivered",
] as const;
export type FulfillmentStatus = (typeof FULFILLMENT_STATUSES)[number];

export const PAYMENT_STATUSES = ["pending", "paid", "partially_refunded", "refunded"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** Notion's status names, which the email automation still keys off. */
export const NOTION_FULFILLMENT: Record<FulfillmentStatus, string> = {
  pending: "Pending",
  processing: "Processing",
  dropped_off: "Dropped off",
  shipped: "Shipped",
  out_for_delivery: "Out for delivery",
  ready_for_pickup: "Ready for pickup",
  picked_up: "Picked up",
  delivered: "Delivered",
};

export const NOTION_PAYMENT: Record<PaymentStatus, string> = {
  pending: "Pending",
  paid: "Paid",
  // Notion has no partial status; it stays Paid.
  partially_refunded: "Paid",
  refunded: "Refunded",
};

export const isFulfillmentStatus = (value: unknown): value is FulfillmentStatus =>
  typeof value === "string" && (FULFILLMENT_STATUSES as readonly string[]).includes(value);

export const fulfillmentFromNotion = (name: string | undefined): FulfillmentStatus => {
  const match = (Object.keys(NOTION_FULFILLMENT) as FulfillmentStatus[])
    .find((status) => NOTION_FULFILLMENT[status].toLowerCase() === (name || "").toLowerCase());
  return match ?? "pending";
};

export const paymentFromNotion = (name: string | undefined): PaymentStatus => {
  const value = (name || "").toLowerCase();
  return value === "paid" ? "paid" : value === "refunded" ? "refunded" : "pending";
};

/** The legacy `status` the customer account pages read. */
export const legacyStatus = (payment: PaymentStatus): "pending" | "completed" | "canceled" =>
  payment === "refunded" ? "canceled" : payment === "pending" ? "pending" : "completed";

export interface OrderItem {
  name: string;
  sku: string;
  quantity: number;
  internalQuantity?: number;
  // Not recorded for Notion-era orders.
  price: number | null;
  selections?: Record<string, unknown>;
}

/** Which customer emails have gone out; mirrors Notion's checkboxes. */
export interface OrderEmailFlags {
  orderConfirmed: boolean;
  shipped: boolean;
  outForDelivery: boolean;
  delivered: boolean;
  readyForPickup: boolean;
  pickedUp: boolean;
  reviewRequest: boolean;
  reviewReminder: boolean;
}

/**
 * Status fields every new paid order starts with. The status-email job finds
 * orders by these flags, so every code path that creates an order adds them.
 */
export const newPaidOrderStatus = (): {
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
  emails: OrderEmailFlags;
} => ({
  paymentStatus: "paid",
  fulfillmentStatus: "pending",
  emails: {
    orderConfirmed: false, shipped: false, outForDelivery: false, delivered: false,
    readyForPickup: false, pickedUp: false, reviewRequest: false, reviewReminder: false,
  },
});

export interface AdminOrder {
  id: string;
  origin: "notion" | "firestore";
  seq: number | null;
  customerName: string;
  email: string;
  emailNormalized: string;
  phone: string | null;
  accountId?: string;
  createdAt: string;
  status: "pending" | "completed" | "canceled";
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
  totalAmount: number;
  // Dollars refunded so far (refunds/{id} has each one).
  refundedAmount?: number;
  // What the label cost us (EasyPost), not what the customer paid for shipping.
  shippingLabelPrice: number | null;
  discountCode: string | null;
  firstTimer: boolean;
  items: OrderItem[];
  itemsSummary: string;
  isLocalPickup: boolean;
  orderPickupId: string | null;
  shippingAddress: string | null;
  shippingBox: string | null;
  shipmentId: string | null;
  trackingNumber: string | null;
  trackingCarrier: string | null;
  shippingService: string | null;
  trackingLabelUrl: string | null;
  paymentIntentId: string | null;
  receiptUrl: string | null;
  emails: OrderEmailFlags;
  notion: { pageId: string; lastEditedAt: string; syncedAt: string } | null;
  updatedAt: string;
}

/** One line on an order's timeline, at orders/{id}/events/{auto id}. */
export interface OrderEvent {
  id: string;
  at: string;
  type: "note" | "fulfillment" | "imported" | "email" | "refund";
  actor: { email: string; name: string } | null;
  message: string;
  data?: Record<string, unknown>;
}
