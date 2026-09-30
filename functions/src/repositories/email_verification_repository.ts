import { createHash, randomBytes } from "crypto";
import { DocumentReference, Firestore } from "firebase-admin/firestore";

/** "signup" confirms an account's email; "change" confirms a requested new email. */
export type EmailVerificationPurpose = "signup" | "change";

export interface EmailVerification {
  accountId: string;
  email: string;
  purpose: EmailVerificationPurpose;
  createdAt: number;
  // Configure as a Firestore TTL field to delete expired links automatically.
  expiresAt: Date;
}

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/** Only a hash of each token is stored, so database access alone cannot verify an email. */
const tokenHash = (token: string): string => createHash("sha256").update(token).digest("hex");

/** Owns single-use email verification links at email_verifications/{sha256(token)}. */
export class EmailVerificationRepository {
  constructor(private readonly db: Firestore) {}

  /** Creates a link token; the raw token exists only in the emailed link. */
  async issue(accountId: string, email: string, purpose: EmailVerificationPurpose): Promise<string> {
    const token = randomBytes(32).toString("base64url");
    const verification: EmailVerification = { accountId, email, purpose, createdAt: Date.now(), expiresAt: new Date(Date.now() + TOKEN_TTL_MS) };
    await this.ref(token).set(verification);
    return token;
  }

  ref(token: string): DocumentReference {
    return this.db.collection("email_verifications").doc(tokenHash(token));
  }

  static isExpired(verification: EmailVerification, now = Date.now()): boolean {
    const expiresAt = verification.expiresAt instanceof Date
      ? verification.expiresAt
      : (verification.expiresAt as unknown as { toDate(): Date }).toDate();
    return expiresAt.getTime() <= now;
  }
}
