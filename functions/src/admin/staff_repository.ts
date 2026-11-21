import { getDatabase } from "../integrations/firebase_admin";
import type { Role } from "./permissions";

/**
 * Dashboard staff at staff/{normalized email}. Keyed by email because people
 * are invited before they ever sign in; the Firebase Auth uid is attached on
 * their first sign-in. Staff accounts are separate from customer accounts.
 */
const COLLECTION = "staff";

export type StaffStatus = "invited" | "active" | "disabled";

export interface StaffMember {
  email: string;
  name: string;
  role: Role;
  status: StaffStatus;
  uid: string | null;
  invitedBy: string | null;
  createdAt: string;
  updatedAt: string;
  lastSignInAt: string | null;
  // Profile details the person edits themselves (absent on older records).
  phone?: string;
  title?: string;
  // True once an Owner/Admin has given them an email + password login.
  passwordSignIn?: boolean;
  // True while they're still on a temporary password; the API blocks everything
  // except /me and /me/password until they choose their own.
  mustChangePassword?: boolean;
}

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const collection = () => getDatabase().collection(COLLECTION);

export const StaffRepository = {
  async get(email: string): Promise<StaffMember | null> {
    const snapshot = await collection().doc(normalizeEmail(email)).get();
    return snapshot.exists ? (snapshot.data() as StaffMember) : null;
  },

  async list(): Promise<StaffMember[]> {
    const snapshot = await collection().orderBy("createdAt", "asc").get();
    return snapshot.docs.map((doc) => doc.data() as StaffMember);
  },

  async countActiveOwners(): Promise<number> {
    const snapshot = await collection()
      .where("role", "==", "owner")
      .where("status", "in", ["active", "invited"])
      .count()
      .get();
    return snapshot.data().count;
  },

  /** Creates the record; fails if one already exists for the email. */
  async create(member: StaffMember): Promise<void> {
    await collection().doc(normalizeEmail(member.email)).create(member);
  },

  async update(email: string, changes: Partial<StaffMember>): Promise<StaffMember> {
    const ref = collection().doc(normalizeEmail(email));
    await ref.update({ ...changes, updatedAt: new Date().toISOString() });
    return (await ref.get()).data() as StaffMember;
  },
};
