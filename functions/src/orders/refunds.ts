import { getDatabase } from "../integrations/firebase_admin";
import { getStripeClient } from "../integrations/stripe/stripe_client";
import { createLogger } from "../logger";
import { REFUND_APPROVAL_THRESHOLD_CENTS } from "../admin/permissions";
import type { StaffMember } from "../admin/staff_repository";
import { AdminOrder, NOTION_PAYMENT } from "./order_model";
import { OrderRepository } from "./order_repository";
import { OrderStore } from "./order_store";

/**
 * Refunds, at refunds/{id} (one document per refund, with its orderId).
 *
 * Staff with orders.refund can refund up to $50 at once; a larger refund by
 * anyone without orders.refund_large becomes a request an Owner approves.
 * Orders linked to a Stripe payment are refunded through Stripe. Older orders
 * whose payment was never linked can only record a refund made in Stripe.
 */
const logger = createLogger("refunds");

export const STRIPE_REASONS = ["requested_by_customer", "duplicate", "fraudulent"] as const;
export type StripeReason = (typeof STRIPE_REASONS)[number];

export type RefundStatus = "pending_approval" | "succeeded" | "pending" | "failed" | "declined" | "recorded";

export interface Refund {
  id: string;
  orderId: string;
  amountCents: number;
  reason: StripeReason;
  note: string;
  status: RefundStatus;
  // "stripe": made from the dashboard. "manual": made in Stripe directly, recorded here.
  method: "stripe" | "manual";
  stripeRefundId: string | null;
  failureMessage: string | null;
  requestedBy: { email: string; name: string };
  decidedBy: { email: string; name: string } | null;
  createdAt: string;
  decidedAt: string | null;
}

export class RefundError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

const refunds = () => getDatabase().collection("refunds");
const who = (staff: StaffMember) => ({ email: staff.email, name: staff.name });
const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export const hasStripePayment = (order: AdminOrder): boolean => !!order.paymentIntentId?.startsWith("pi_");

export const RefundStore = {
  async forOrder(orderId: string): Promise<Refund[]> {
    const snapshot = await refunds().where("orderId", "==", orderId).get();
    return snapshot.docs.map((doc) => doc.data() as Refund).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async pendingApproval(): Promise<Refund[]> {
    const snapshot = await refunds().where("status", "==", "pending_approval").get();
    return snapshot.docs.map((doc) => doc.data() as Refund).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  async get(id: string): Promise<Refund | null> {
    const snapshot = await refunds().doc(id).get();
    return snapshot.exists ? (snapshot.data() as Refund) : null;
  },
};

/** Cents already refunded on this order, counting refunds still processing. */
const refundedCents = (list: Refund[]) =>
  list
    .filter((refund) => ["succeeded", "pending", "recorded"].includes(refund.status))
    .reduce((sum, refund) => sum + refund.amountCents, 0);

/** What can still be refunded, in cents. Uses Stripe's own figures when the payment is linked. */
export const refundableCents = async (order: AdminOrder, list?: Refund[]): Promise<number> => {
  const history = list ?? (await RefundStore.forOrder(order.id));
  const ours = Math.round(order.totalAmount * 100) - refundedCents(history);
  if (!hasStripePayment(order)) return Math.max(0, ours);
  const paymentIntent = await getStripeClient().paymentIntents.retrieve(order.paymentIntentId!, { expand: ["latest_charge"] });
  const charge = paymentIntent.latest_charge as { amount_captured?: number; amount_refunded?: number } | null;
  const stripeLeft = (charge?.amount_captured ?? paymentIntent.amount_received) - (charge?.amount_refunded ?? 0);
  return Math.max(0, Math.min(ours, stripeLeft));
};

/** Updates the order's payment status and refunded total after a refund changes. */
const applyToOrder = async (order: AdminOrder): Promise<void> => {
  const total = refundedCents(await RefundStore.forOrder(order.id));
  const full = total >= Math.round(order.totalAmount * 100);
  const paymentStatus = total === 0 ? "paid" : full ? "refunded" : "partially_refunded";
  await OrderRepository.update(order.id, {
    refundedAmount: total / 100,
    paymentStatus,
    status: full ? "canceled" : "completed",
  } as Partial<AdminOrder>);
  if (full) await OrderStore.copyToNotion(order, { Status: { status: { name: NOTION_PAYMENT.refunded } } });
};

const executeStripeRefund = async (order: AdminOrder, refund: Refund): Promise<Refund> => {
  try {
    const stripeRefund = await getStripeClient().refunds.create(
      {
        payment_intent: order.paymentIntentId!,
        amount: refund.amountCents,
        reason: refund.reason,
        metadata: { orderId: order.id, refundId: refund.id, requestedBy: refund.requestedBy.email },
      },
      // A retried request can never refund twice.
      { idempotencyKey: `refund-${refund.id}` },
    );
    const status: RefundStatus = stripeRefund.status === "succeeded" ? "succeeded"
      : stripeRefund.status === "failed" || stripeRefund.status === "canceled" ? "failed" : "pending";
    return { ...refund, status, stripeRefundId: stripeRefund.id, failureMessage: null };
  } catch (error) {
    logger.error("Stripe refund failed", { orderId: order.id, refundId: refund.id, error: (error as Error).message });
    return { ...refund, status: "failed", failureMessage: (error as Error).message };
  }
};

/**
 * Refunds an order, or files the request for an Owner when it's over the
 * limit for this staff member. `manual` records a refund already made in Stripe.
 */
export const requestRefund = async (input: {
  order: AdminOrder;
  staff: StaffMember;
  canRefundLarge: boolean;
  amountCents: number;
  reason: StripeReason;
  note: string;
  manual: boolean;
}): Promise<Refund> => {
  const { order, staff } = input;
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new RefundError(400, "Enter an amount to refund.");
  if (!input.manual && !hasStripePayment(order)) {
    throw new RefundError(409, "This order isn't linked to its Stripe payment. Refund it in Stripe, then record it here.");
  }
  const history = await RefundStore.forOrder(order.id);
  if (history.some((refund) => refund.status === "pending_approval")) {
    throw new RefundError(409, "This order already has a refund waiting for approval.");
  }
  const left = await refundableCents(order, history);
  if (input.amountCents > left) throw new RefundError(400, `At most ${dollars(left)} can be refunded on this order.`);

  const ref = refunds().doc();
  const needsApproval = !input.manual && input.amountCents > REFUND_APPROVAL_THRESHOLD_CENTS && !input.canRefundLarge;
  let refund: Refund = {
    id: ref.id,
    orderId: order.id,
    amountCents: input.amountCents,
    reason: input.reason,
    note: input.note,
    status: needsApproval ? "pending_approval" : input.manual ? "recorded" : "pending",
    method: input.manual ? "manual" : "stripe",
    stripeRefundId: null,
    failureMessage: null,
    requestedBy: who(staff),
    decidedBy: needsApproval ? null : who(staff),
    createdAt: new Date().toISOString(),
    decidedAt: needsApproval ? null : new Date().toISOString(),
  };
  // Saved before calling Stripe, so a crash mid-refund still leaves a record.
  await ref.set(refund);
  if (!needsApproval && !input.manual) {
    refund = await executeStripeRefund(order, refund);
    await ref.set(refund);
  }
  if (refund.status !== "pending_approval") await applyToOrder(order);

  await OrderRepository.addEvent(order.id, {
    type: "refund",
    actor: who(staff),
    message: needsApproval
      ? `Requested a ${dollars(refund.amountCents)} refund (needs Owner approval)`
      : refund.status === "failed"
        ? `Refund of ${dollars(refund.amountCents)} failed: ${refund.failureMessage}`
        : input.manual
          ? `Recorded a ${dollars(refund.amountCents)} refund made in Stripe`
          : `Refunded ${dollars(refund.amountCents)}`,
    ...(refund.note ? { data: { note: refund.note } } : {}),
  });
  return refund;
};

/** Owner decision on a refund over the limit. */
export const decideRefund = async (input: {
  refund: Refund;
  staff: StaffMember;
  approve: boolean;
}): Promise<Refund> => {
  const { staff } = input;
  // Claim the request first so two Owners can't both approve it.
  const ref = refunds().doc(input.refund.id);
  const claimed = await getDatabase().runTransaction(async (transaction) => {
    const fresh = (await transaction.get(ref)).data() as Refund | undefined;
    if (!fresh || fresh.status !== "pending_approval") return null;
    const next: Refund = {
      ...fresh,
      status: input.approve ? "pending" : "declined",
      decidedBy: who(staff),
      decidedAt: new Date().toISOString(),
    };
    transaction.set(ref, next);
    return next;
  });
  if (!claimed) throw new RefundError(409, "This refund has already been decided.");

  const order = await OrderRepository.get(claimed.orderId);
  if (!order) throw new RefundError(404, "The order no longer exists.");
  let refund = claimed;
  if (input.approve) {
    const left = await refundableCents(order, (await RefundStore.forOrder(order.id)).filter((r) => r.id !== refund.id));
    if (refund.amountCents > left) {
      refund = { ...refund, status: "failed", failureMessage: `Only ${dollars(left)} is left to refund.` };
    } else {
      refund = await executeStripeRefund(order, refund);
    }
    await ref.set(refund);
    await applyToOrder(order);
  }
  await OrderRepository.addEvent(order.id, {
    type: "refund",
    actor: who(staff),
    message: !input.approve
      ? `Declined the ${dollars(refund.amountCents)} refund request`
      : refund.status === "failed"
        ? `Approved the ${dollars(refund.amountCents)} refund, but it failed: ${refund.failureMessage}`
        : `Approved and refunded ${dollars(refund.amountCents)}`,
  });
  return refund;
};
