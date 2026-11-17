import { Query } from "firebase-admin/firestore";
import { getDatabase } from "../integrations/firebase_admin";
import {
  AdminOrder,
  FULFILLMENT_STATUSES,
  FulfillmentStatus,
  OrderEvent,
  PaymentStatus,
} from "./order_model";

const orders = () => getDatabase().collection("orders");

/** Older Firestore-only orders lack the dashboard fields until the Notion sync fills them in. */
const normalize = (data: Partial<AdminOrder> & { id: string }): AdminOrder => ({
  origin: "firestore",
  seq: null,
  customerName: "",
  email: "",
  emailNormalized: "",
  phone: null,
  createdAt: "",
  status: "pending",
  paymentStatus: data.status === "completed" ? "paid" : data.status === "canceled" ? "refunded" : "pending",
  fulfillmentStatus: "pending",
  totalAmount: 0,
  shippingLabelPrice: null,
  discountCode: null,
  firstTimer: false,
  items: [],
  itemsSummary: "",
  isLocalPickup: false,
  orderPickupId: null,
  shippingAddress: null,
  shippingBox: null,
  shipmentId: null,
  trackingNumber: null,
  trackingCarrier: null,
  shippingService: null,
  trackingLabelUrl: null,
  paymentIntentId: null,
  receiptUrl: null,
  emails: {
    orderConfirmed: false, shipped: false, outForDelivery: false, delivered: false,
    readyForPickup: false, pickedUp: false, reviewRequest: false, reviewReminder: false,
  },
  notion: null,
  updatedAt: "",
  ...data,
});

export interface OrderListOptions {
  fulfillment?: FulfillmentStatus;
  payment?: PaymentStatus;
  query?: string;
  limit: number;
  // createdAt of the last order on the previous page.
  after?: string;
}

const ORDER_NUMBER = /^[A-Z0-9]{8}$/;
// Free-text search scans this many recent orders; plenty at current volume.
const SEARCH_WINDOW = 1500;

export const OrderRepository = {
  async get(id: string): Promise<AdminOrder | null> {
    if (!id || id.includes("/")) return null;
    // Order numbers are upper case, but people type them however.
    let snapshot = await orders().doc(id).get();
    if (!snapshot.exists && id !== id.toUpperCase()) snapshot = await orders().doc(id.toUpperCase()).get();
    return snapshot.exists ? normalize({ ...(snapshot.data() as AdminOrder), id: snapshot.id }) : null;
  },

  async list(options: OrderListOptions): Promise<{ orders: AdminOrder[]; nextAfter: string | null }> {
    const text = options.query?.trim();
    const applyFilters = (query: Query) => {
      let q = query;
      if (options.fulfillment) q = q.where("fulfillmentStatus", "==", options.fulfillment);
      if (options.payment) q = q.where("paymentStatus", "==", options.payment);
      return q;
    };
    const toOrders = (docs: FirebaseFirestore.QueryDocumentSnapshot[]) =>
      docs.map((doc) => normalize({ ...(doc.data() as AdminOrder), id: doc.id }));

    if (text && ORDER_NUMBER.test(text.toUpperCase())) {
      // Falls through to a text search when no order has that number.
      const order = await this.get(text);
      if (order) return { orders: [order], nextAfter: null };
    }
    if (text && text.includes("@")) {
      // Status filters are applied here rather than in the query, so no extra index is needed.
      const snapshot = await orders().where("emailNormalized", "==", text.toLowerCase())
        .orderBy("createdAt", "desc").limit(200).get();
      const matches = toOrders(snapshot.docs).filter((order) =>
        (!options.fulfillment || order.fulfillmentStatus === options.fulfillment) &&
        (!options.payment || order.paymentStatus === options.payment));
      return { orders: matches, nextAfter: null };
    }
    if (text) {
      const needle = text.toLowerCase();
      const snapshot = await applyFilters(orders()).orderBy("createdAt", "desc").limit(SEARCH_WINDOW).get();
      const matches = toOrders(snapshot.docs).filter((order) =>
        [order.customerName, order.email, order.itemsSummary, order.discountCode, order.trackingNumber]
          .some((value) => (value || "").toLowerCase().includes(needle)));
      return { orders: matches.slice(0, options.limit), nextAfter: null };
    }

    let query = applyFilters(orders()).orderBy("createdAt", "desc");
    if (options.after) query = query.startAfter(options.after);
    const snapshot = await query.limit(options.limit).get();
    const list = toOrders(snapshot.docs);
    return { orders: list, nextAfter: list.length === options.limit ? list[list.length - 1].createdAt : null };
  },

  /** How many orders are in each fulfillment status, for the list's tabs. */
  async countsByFulfillment(): Promise<Record<FulfillmentStatus | "all", number>> {
    const entries = await Promise.all(FULFILLMENT_STATUSES.map(async (status) => {
      const snapshot = await orders().where("fulfillmentStatus", "==", status).count().get();
      return [status, snapshot.data().count] as const;
    }));
    const all = (await orders().count().get()).data().count;
    return { all, ...Object.fromEntries(entries) } as Record<FulfillmentStatus | "all", number>;
  },

  async events(id: string): Promise<OrderEvent[]> {
    const snapshot = await orders().doc(id).collection("events").orderBy("at", "desc").limit(200).get();
    return snapshot.docs.map((doc) => ({ ...(doc.data() as OrderEvent), id: doc.id }));
  },

  /** Writes dashboard changes, marked so the Notion mirror trigger ignores them. */
  async update(id: string, changes: Partial<AdminOrder> & Record<string, unknown>): Promise<void> {
    const now = new Date().toISOString();
    await orders().doc(id).set({ ...changes, updatedAt: now, adminUpdatedAt: now }, { merge: true });
  },

  async addEvent(id: string, event: Omit<OrderEvent, "id" | "at">): Promise<OrderEvent> {
    const ref = orders().doc(id).collection("events").doc();
    const full = { ...event, at: new Date().toISOString() };
    // Only the subcollection is written: a write to the order itself would
    // wake the Notion mirror trigger.
    await ref.set(full);
    return { ...full, id: ref.id };
  },
};
