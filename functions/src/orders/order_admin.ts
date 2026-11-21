import { getDatabase } from "../integrations/firebase_admin";
import type { StaffMember } from "../admin/staff_repository";
import { AccountAdmin } from "../services/account_service";
import { AdminOrder } from "./order_model";
import { OrderRepository } from "./order_repository";
import { hasStripePayment } from "./refunds";

/**
 * Editing an order's customer and delivery details, and deleting orders.
 *
 * Deleting moves the order (and its timeline) to deleted_orders/{id}, where
 * an Owner can restore it. Nothing else reads that collection, so a deleted
 * order drops out of lists, customer history, status emails and discount
 * checks, and the Notion import skips it instead of bringing it back.
 */
export class OrderAdminError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

const db = () => getDatabase();
const DELETED = "deleted_orders";
const who = (staff: StaffMember) => ({ email: staff.email, name: staff.name });

// ---- Editing details ----

export interface DetailChanges {
  customerName?: string;
  email?: string;
  phone?: string | null;
  shippingAddress?: string | null;
  orderPickupId?: string | null;
}

const LABELS: Record<keyof DetailChanges, string> = {
  customerName: "name",
  email: "email",
  phone: "phone",
  shippingAddress: "shipping address",
  orderPickupId: "pickup details",
};

export const parseDetailChanges = (body: any): DetailChanges => {
  const changes: DetailChanges = {};
  const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");
  if (body?.customerName !== undefined) {
    changes.customerName = text(body.customerName, 120);
    if (!changes.customerName) throw new OrderAdminError(400, "The name can't be empty.");
  }
  if (body?.email !== undefined) {
    changes.email = text(body.email, 254).toLowerCase();
    if (changes.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(changes.email)) {
      throw new OrderAdminError(400, "That email doesn't look right.");
    }
  }
  if (body?.phone !== undefined) changes.phone = text(body.phone, 40) || null;
  if (body?.shippingAddress !== undefined) changes.shippingAddress = text(body.shippingAddress, 500) || null;
  if (body?.orderPickupId !== undefined) changes.orderPickupId = text(body.orderPickupId, 120) || null;
  return changes;
};

export const editOrderDetails = async (order: AdminOrder, changes: DetailChanges, staff: StaffMember): Promise<AdminOrder> => {
  const changed = (Object.keys(changes) as (keyof DetailChanges)[])
    .filter((field) => (changes[field] ?? null) !== ((order as any)[field] ?? null));
  if (!changed.length) return order;

  const update: Record<string, unknown> = {};
  for (const field of changed) update[field] = changes[field] ?? null;
  if (changed.includes("email")) {
    update.emailNormalized = changes.email || "";
    // The order stays on its account only if the new email is one of the account's.
    if (order.accountId) {
      const account = await AccountAdmin.details(order.accountId);
      if (!account || !account.emails.includes(changes.email || "")) update.accountId = null;
    }
  }
  await OrderRepository.update(order.id, update as Partial<AdminOrder>);

  await OrderRepository.addEvent(order.id, {
    type: "note",
    actor: who(staff),
    message: "Edited " + changed.map((field) => {
      const before = (order as any)[field] || "—";
      const after = changes[field] || "—";
      return field === "shippingAddress" ? LABELS[field] : `${LABELS[field]}: ${before} → ${after}`;
    }).join("; "),
  });
  return (await OrderRepository.get(order.id))!;
};

// ---- Deleting and restoring ----

/** Why an order can't be deleted, or null if it can. */
export const deleteBlocker = (order: AdminOrder): string | null => {
  if (hasStripePayment(order) && order.paymentStatus !== "refunded") {
    return "This order was paid through Stripe. Refund it in full first, so the payment isn't lost from your records.";
  }
  return null;
};

export const deleteOrder = async (order: AdminOrder, staff: StaffMember, reason: string): Promise<void> => {
  const blocker = deleteBlocker(order);
  if (blocker) throw new OrderAdminError(409, blocker);

  const orderRef = db().collection("orders").doc(order.id);
  const deletedRef = db().collection(DELETED).doc(order.id);
  const [raw, events] = await Promise.all([orderRef.get(), orderRef.collection("events").get()]);
  if (!raw.exists) throw new OrderAdminError(404, "No order with that number.");

  const batch = db().batch();
  batch.set(deletedRef, {
    order: raw.data(),
    deletedAt: new Date().toISOString(),
    deletedBy: who(staff),
    reason,
  });
  for (const event of events.docs) {
    batch.set(deletedRef.collection("events").doc(event.id), event.data());
    batch.delete(event.ref);
  }
  batch.delete(orderRef);
  await batch.commit();

  // A review email must never go out for an order that no longer exists.
  const review = db().collection("review_requests").doc(order.id);
  const request = await review.get();
  if (request.exists && ["queued", "sent"].includes(request.data()?.status)) {
    await review.update({ status: "skipped", skippedReason: "order deleted" });
  }
};

export const listDeleted = async () => {
  const snapshot = await db().collection(DELETED).get();
  return snapshot.docs
    .map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        customerName: data.order?.customerName || "",
        email: data.order?.email || "",
        totalAmount: Number(data.order?.totalAmount) || 0,
        createdAt: data.order?.createdAt || "",
        deletedAt: data.deletedAt as string,
        deletedBy: data.deletedBy as { email: string; name: string },
        reason: (data.reason as string) || "",
      };
    })
    .sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
};

export const restoreOrder = async (id: string, staff: StaffMember): Promise<void> => {
  const deletedRef = db().collection(DELETED).doc(id);
  const orderRef = db().collection("orders").doc(id);
  const [deleted, existing, events] = await Promise.all([deletedRef.get(), orderRef.get(), deletedRef.collection("events").get()]);
  if (!deleted.exists) throw new OrderAdminError(404, "That order isn't in Deleted orders.");
  if (existing.exists) throw new OrderAdminError(409, "An order with that number already exists.");

  const now = new Date().toISOString();
  const batch = db().batch();
  // adminUpdatedAt marks this as a dashboard write, so the Notion mirror trigger ignores it.
  batch.set(orderRef, { ...deleted.data()!.order, adminUpdatedAt: now, updatedAt: now });
  for (const event of events.docs) {
    batch.set(orderRef.collection("events").doc(event.id), event.data());
    batch.delete(event.ref);
  }
  batch.delete(deletedRef);
  await batch.commit();
  await OrderRepository.addEvent(id, { type: "note", actor: who(staff), message: "Restored from Deleted orders" });
};

/** Which of these order numbers were deleted (the Notion import skips them). */
export const deletedIds = async (ids: string[]): Promise<Set<string>> => {
  if (!ids.length) return new Set();
  const snapshots = await db().getAll(...ids.map((id) => db().collection(DELETED).doc(id)));
  return new Set(snapshots.filter((snapshot) => snapshot.exists).map((snapshot) => snapshot.id));
};
