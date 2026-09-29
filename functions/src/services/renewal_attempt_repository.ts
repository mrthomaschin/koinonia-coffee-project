import { Firestore, DocumentReference, FieldValue } from "firebase-admin/firestore";
import { RenewalState, SubscriptionService } from "./subscription_domain";

/**
 * Per-roast renewal record at subscription_renewal_claims/{subscriptionId}.
 * The quote and PaymentIntent are saved before the card is charged, so every
 * retry for the same roast reuses them instead of starting a new payment.
 */
export interface RenewalClaim<Q = unknown> {
  dueDate: string;
  status: "processing" | "failed" | "completed";
  processingUntil: number;
  quote?: Q;
  paymentIntentId?: string;
  lastError?: string;
}

const LEASE_MS = 10 * 60 * 1000;

/** Owns the lease/claim state that makes a subscription renewal single-flight. */
export class RenewalAttemptRepository {
  constructor(private readonly db: Firestore) {}

  /**
   * Leases a due, renewable subscription for one charge attempt. A new roast
   * date starts a fresh claim; a retry for the same roast keeps its quote and
   * PaymentIntent.
   */
  async acquire<T extends RenewalState, Q>(subscriptionRef: DocumentReference, claimRef: DocumentReference, now: Date): Promise<{ subscription: T; claim: RenewalClaim<Q> } | null> {
    return this.db.runTransaction(async transaction => {
      const [subscriptionSnapshot, claimSnapshot] = await Promise.all([transaction.get(subscriptionRef), transaction.get(claimRef)]);
      const subscription = subscriptionSnapshot.data() as T | undefined;
      if (!subscription || SubscriptionService.dueAction(subscription, now) !== "charge") return null;
      const dueDate = SubscriptionService.roastDateKey(subscription.upcomingRoastDate);
      const previous = claimSnapshot.data() as RenewalClaim<Q> | undefined;
      const sameRoast = previous?.dueDate === dueDate;
      if (sameRoast && (previous.status === "completed" || previous.processingUntil > now.getTime())) return null;
      const lease = { dueDate, status: "processing" as const, processingUntil: now.getTime() + LEASE_MS, updatedAt: now.toISOString() };
      if (sameRoast) transaction.set(claimRef, lease, { merge: true });
      else transaction.set(claimRef, { subscriptionId: subscriptionRef.id, ...lease });
      return { subscription, claim: { ...(sameRoast ? previous : {}), ...lease } };
    });
  }

  async recordQuote<Q>(claimRef: DocumentReference, quote: Q): Promise<void> {
    await claimRef.update({ quote, updatedAt: new Date().toISOString() });
  }

  async recordPaymentIntent(claimRef: DocumentReference, paymentIntentId: string): Promise<void> {
    await claimRef.update({ paymentIntentId, updatedAt: new Date().toISOString() });
  }

  /** Releases the lease after a failed attempt, keeping the quote and PaymentIntent for the retry. */
  async recordFailure(claimRef: DocumentReference, error: string, retryAfterMs: number): Promise<void> {
    await claimRef.set({ status: "failed", processingUntil: Date.now() + retryAfterMs,
      lastError: error, updatedAt: new Date().toISOString() }, { merge: true });
  }

  /**
   * Moves a due, skipped subscription to its next roast without charging.
   * Returns false when the subscription changed since the caller read it.
   */
  async advanceSkipped(subscriptionRef: DocumentReference, skippedRoastDate: string, nextRoastDate: string, now: Date): Promise<boolean> {
    return this.db.runTransaction(async transaction => {
      const subscription = (await transaction.get(subscriptionRef)).data() as RenewalState | undefined;
      if (!subscription || SubscriptionService.dueAction(subscription, now) !== "advance-skipped" ||
        SubscriptionService.roastDateKey(subscription.upcomingRoastDate) !== skippedRoastDate) return false;
      transaction.update(subscriptionRef, {
        upcomingRoastDate: nextRoastDate,
        skippedRoastDate: FieldValue.delete(),
        lastSkippedRoastDate: skippedRoastDate,
        lastSkipAdvancedAt: now.toISOString(),
      });
      return true;
    });
  }
}
