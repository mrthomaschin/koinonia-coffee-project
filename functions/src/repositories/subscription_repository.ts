import { Firestore, DocumentSnapshot } from "firebase-admin/firestore";

/** Owns Firestore access to account subscription documents. */
export class SubscriptionRepository {
  constructor(private readonly db: Firestore) {}

  async findForAccount(accountId: string, subscriptionId: string): Promise<DocumentSnapshot | null> {
    const snapshot = await this.db.collection("account_subscriptions").doc(subscriptionId).get();
    return snapshot.exists && snapshot.data()?.accountId === accountId ? snapshot : null;
  }

  async listForAccount(accountId: string): Promise<DocumentSnapshot[]> {
    const response = await this.db.collection("account_subscriptions")
      .where("accountId", "==", accountId)
      .get();
    return response.docs;
  }

  async save(subscriptionId: string, value: object): Promise<void> {
    await this.db.collection("account_subscriptions").doc(subscriptionId).set(value);
  }
}
