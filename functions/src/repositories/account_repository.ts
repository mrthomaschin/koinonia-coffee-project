import { Firestore } from "firebase-admin/firestore";

export interface AccountRecord {
  id: string;
  user: { firstName: string; lastName: string; email: string };
  username: string;
  label?: string;
  passwordHash?: string;
  [key: string]: unknown;
}

/** Owns Firestore reads and writes for account identity records. */
export class AccountRepository {
  constructor(private readonly db: Firestore) {}

  async findByUsername(username: string, defaultLabel: string): Promise<AccountRecord | null> {
    const usernameKey = Buffer.from(username.trim().toLowerCase()).toString("base64url");
    const usernameRecord = await this.db.collection("account_usernames").doc(usernameKey).get();
    const accountId = usernameRecord.data()?.accountId;
    if (!usernameRecord.exists || typeof accountId !== "string") return null;
    return this.findById(accountId, defaultLabel);
  }

  async findById(accountId: string, defaultLabel: string): Promise<AccountRecord | null> {
    const account = await this.db.collection("accounts").doc(accountId).get();
    if (!account.exists) return null;
    const accountData = account.data() as AccountRecord;
    if (!accountData.label) {
      await account.ref.set({ label: defaultLabel, updatedAt: Date.now() }, { merge: true });
      accountData.label = defaultLabel;
    }
    return accountData;
  }

  async createSession(accountId: string, token: string, expiresAt: number): Promise<void> {
    await this.db.collection("account_sessions").doc(token).set({ accountId, expiresAt });
  }

  async findSession(token: string): Promise<{ accountId?: string; expiresAt?: number } | null> {
    const session = await this.db.collection("account_sessions").doc(token).get();
    const data = session.data() as { accountId?: string; expiresAt?: number } | undefined;
    if (!session.exists || !data) return null;
    if (data.expiresAt !== undefined && data.expiresAt < Date.now()) {
      await session.ref.delete();
      return null;
    }
    return data;
  }

  async deleteSession(token: string): Promise<void> {
    await this.db.collection("account_sessions").doc(token).delete();
  }
}
