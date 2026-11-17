import { getDatabase } from "../integrations/firebase_admin";
import type { StaffMember } from "./staff_repository";

/**
 * Every change made through the dashboard, at audit_log/{auto id}: who did it,
 * what it touched, and the values before and after. Written by the API only;
 * never edited or deleted.
 */
const COLLECTION = "audit_log";

export interface AuditEntry {
  id: string;
  at: string;
  actor: { email: string; name: string; role: string };
  // Dotted verb, e.g. "staff.invite", "order.refund".
  action: string;
  target: { type: string; id: string };
  before: unknown;
  after: unknown;
  note: string | null;
}

export interface AuditInput {
  action: string;
  target: { type: string; id: string };
  before?: unknown;
  after?: unknown;
  note?: string;
}

// Firestore rejects `undefined`; JSON round-trip drops it and copies the value.
const plain = (value: unknown): unknown =>
  value === undefined ? null : JSON.parse(JSON.stringify(value));

export const AuditLog = {
  async record(actor: StaffMember, input: AuditInput): Promise<void> {
    const ref = getDatabase().collection(COLLECTION).doc();
    const entry: AuditEntry = {
      id: ref.id,
      at: new Date().toISOString(),
      actor: { email: actor.email, name: actor.name, role: actor.role },
      action: input.action,
      target: input.target,
      before: plain(input.before),
      after: plain(input.after),
      note: input.note ?? null,
    };
    await ref.set(entry);
  },

  /** Newest first. `before` is the `at` of the last entry on the previous page. */
  async list(options: { limit: number; before?: string; targetType?: string }): Promise<AuditEntry[]> {
    let query = getDatabase().collection(COLLECTION).orderBy("at", "desc");
    if (options.targetType) query = query.where("target.type", "==", options.targetType);
    if (options.before) query = query.startAfter(options.before);
    const snapshot = await query.limit(options.limit).get();
    return snapshot.docs.map((doc) => doc.data() as AuditEntry);
  },
};
