import { Firestore, DocumentReference } from "firebase-admin/firestore";

export interface RenewableSubscription {
  status: string;
  skipNextDelivery: boolean;
  upcomingRoastDate: string;
}

/** Owns the lease/claim state that makes a subscription renewal single-flight. */
export class RenewalAttemptRepository {
  constructor(private readonly db: Firestore) {}

  async acquire<T extends RenewableSubscription>(subscriptionRef: DocumentReference, claimRef: DocumentReference, now: Date, isDue: (date: string) => boolean): Promise<T | null> {
    return this.db.runTransaction(async transaction => {
      const [subscriptionSnapshot, claimSnapshot] = await Promise.all([transaction.get(subscriptionRef), transaction.get(claimRef)]);
      const subscription = subscriptionSnapshot.data() as T | undefined;
      if (!subscription || subscription.status !== "active" || subscription.skipNextDelivery || !isDue(subscription.upcomingRoastDate)) return null;
      const dueDate = subscription.upcomingRoastDate.slice(0, 10);
      const claim = claimSnapshot.data() as { dueDate?: string; processingUntil?: number; status?: string } | undefined;
      if (claim?.dueDate === dueDate && (claim.status === "completed" || (claim.processingUntil || 0) > now.getTime())) return null;
      transaction.set(claimRef, { dueDate, status: "processing", processingUntil: now.getTime() + 10 * 60 * 1000, updatedAt: now.toISOString() }, { merge: true });
      return subscription;
    });
  }
}
