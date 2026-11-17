import { getDatabase } from "../integrations/firebase_admin";
import { pacificCalendarDate } from "../domain/dates/calendar_dates";
import type { StaffMember } from "../admin/staff_repository";
import type { DiscountCode, DiscountCodeLookup } from "../repositories/notion_discount_repository";

/**
 * Discount codes at discount_codes/{CODE}, edited in the dashboard. The same
 * rules the Notion database had: active, optional start and expiry (a date
 * without a time covers that whole Pacific day), a percentage, and the
 * first-order / no-other-discounts / subscriptions-only / automatic flags.
 */
export interface StoredDiscount {
  code: string;
  percentOff: number;
  active: boolean;
  startDate: string | null;
  expirationDate: string | null;
  firstOrderOnly: boolean;
  noOtherDiscounts: boolean;
  subscriptionsOnly: boolean;
  automatic: boolean;
  note: string;
  createdAt: string;
  updatedAt: string;
  updatedBy: { email: string; name: string } | null;
}

const codes = () => getDatabase().collection("discount_codes");
export const normalizeCode = (code: string) => code.trim().toUpperCase();

/** Same checks, in the same order, as the Notion version. */
export const evaluateDiscount = (stored: StoredDiscount | null): DiscountCodeLookup => {
  if (!stored) return { valid: false, message: "Invalid discount code" };
  if (!stored.active) return { valid: false, message: "This discount code is no longer active" };
  const start = stored.startDate;
  const notStarted = !start ? false : start.length === 10 ? pacificCalendarDate() < start : new Date() < new Date(start);
  if (notStarted) return { valid: false, message: "This discount code isn't active yet" };
  const end = stored.expirationDate;
  const expired = !end ? false : end.length === 10 ? pacificCalendarDate() > end : new Date() > new Date(end);
  if (expired) return { valid: false, message: "This discount code has expired" };
  if (!stored.percentOff || stored.percentOff <= 0) return { valid: false, message: "Invalid discount percentage" };
  const discount: DiscountCode = {
    code: stored.code,
    percentOff: stored.percentOff,
    firstOrderOnly: stored.firstOrderOnly,
    noOtherDiscounts: stored.noOtherDiscounts,
    subscriptionsOnly: stored.subscriptionsOnly,
  };
  return { valid: true, discount };
};

export const DiscountStore = {
  async list(): Promise<StoredDiscount[]> {
    const snapshot = await codes().get();
    return snapshot.docs.map((doc) => doc.data() as StoredDiscount).sort((a, b) => a.code.localeCompare(b.code));
  },
  async get(code: string): Promise<StoredDiscount | null> {
    const snapshot = await codes().doc(normalizeCode(code)).get();
    return snapshot.exists ? (snapshot.data() as StoredDiscount) : null;
  },
  async find(code: string): Promise<DiscountCodeLookup> {
    return evaluateDiscount(await DiscountStore.get(code));
  },
  async automatic(): Promise<DiscountCode[]> {
    const snapshot = await codes().where("automatic", "==", true).where("active", "==", true).get();
    return snapshot.docs
      .map((doc) => evaluateDiscount(doc.data() as StoredDiscount))
      .flatMap((lookup) => (lookup.valid ? [lookup.discount] : []))
      .sort((a, b) => b.percentOff - a.percentOff);
  },
  async save(input: Omit<StoredDiscount, "createdAt" | "updatedAt" | "updatedBy">, staff: StaffMember | null): Promise<StoredDiscount> {
    const existing = await DiscountStore.get(input.code);
    const now = new Date().toISOString();
    const stored: StoredDiscount = {
      ...input,
      code: normalizeCode(input.code),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      updatedBy: staff ? { email: staff.email, name: staff.name } : null,
    };
    await codes().doc(stored.code).set(stored);
    return stored;
  },
  async remove(code: string): Promise<void> {
    await codes().doc(normalizeCode(code)).delete();
  },
};
