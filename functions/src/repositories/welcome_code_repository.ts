import { randomInt } from "crypto";
import { getDatabase } from "../integrations/firebase_admin";
import {
  calendarDateOffset,
  pacificCalendarDate,
} from "../domain/dates/calendar_dates";
import { WELCOME_DISCOUNT } from "../config/newsletters";

/**
 * One document per newsletter welcome code, keyed by the code. Each code
 * belongs to the email it was issued to, works only for that email, and
 * expires at the end of `expiresOn` (Pacific). The code's other rules (first
 * order only, no other discounts) are checked when it's used, like any code.
 */
const COLLECTION = "welcome_discount_codes";

export interface WelcomeCode {
  code: string;
  email: string;
  // Pacific calendar date (YYYY-MM-DD); the code works through the end of it.
  expiresOn: string;
  issuedAt: Date;
  reminderSentAt: Date | null;
}

// No 0/O, 1/I/L: codes are read off a screen or an email and typed by hand.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const RANDOM_LENGTH = 8;
const PREFIX = `${WELCOME_DISCOUNT.prefix}-`;

const randomCode = (): string =>
  PREFIX +
  Array.from({ length: RANDOM_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

/** True when the text has the shape of a welcome code, so it's looked up here rather than in Notion. */
export const isWelcomeCodeFormat = (code: string): boolean =>
  new RegExp(`^${PREFIX}[${ALPHABET}]{${RANDOM_LENGTH}}$`).test(code.trim().toUpperCase());

/** Whether the code still works today (Pacific). */
export const isWelcomeCodeActive = (code: WelcomeCode, now: Date = new Date()): boolean =>
  pacificCalendarDate(now) <= code.expiresOn;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fromDocument = (data: any): WelcomeCode => ({
  code: data.code,
  email: data.email,
  expiresOn: data.expiresOn,
  issuedAt: data.issuedAt?.toDate ? data.issuedAt.toDate() : new Date(data.issuedAt),
  reminderSentAt: data.reminderSentAt?.toDate ? data.reminderSentAt.toDate() : null,
});

export const findWelcomeCode = async (code: string): Promise<WelcomeCode | null> => {
  const snapshot = await getDatabase()
    .collection(COLLECTION)
    .doc(code.trim().toUpperCase())
    .get();
  return snapshot.exists ? fromDocument(snapshot.data()) : null;
};

/** The code already issued to this email, if any. Emails are stored normalized (trimmed, lowercase). */
export const findWelcomeCodeForEmail = async (email: string): Promise<WelcomeCode | null> => {
  const snapshot = await getDatabase()
    .collection(COLLECTION)
    .where("email", "==", email)
    .limit(1)
    .get();
  return snapshot.empty ? null : fromDocument(snapshot.docs[0].data());
};

/**
 * The email's welcome code, issuing one the first time. An email only ever
 * gets one code, so unsubscribing and signing up again doesn't restart the
 * week. `issued` is true when the code was created by this call.
 */
export const ensureWelcomeCode = async (
  email: string,
  now: Date = new Date(),
): Promise<{ code: WelcomeCode; issued: boolean }> => {
  const existing = await findWelcomeCodeForEmail(email);
  if (existing) return { code: existing, issued: false };

  const collection = getDatabase().collection(COLLECTION);
  for (let attempt = 0; attempt < 5; attempt++) {
    const code: WelcomeCode = {
      code: randomCode(),
      email,
      expiresOn: calendarDateOffset(pacificCalendarDate(now), WELCOME_DISCOUNT.validDays),
      issuedAt: now,
      reminderSentAt: null,
    };
    try {
      // create() fails if the document exists, so two people can never share a code.
      await collection.doc(code.code).create(code);
      return { code, issued: true };
    } catch (error: unknown) {
      // 6 = ALREADY_EXISTS: a collision with an earlier code; draw again.
      if ((error as { code?: number }).code !== 6) throw error;
    }
  }
  throw new Error("Could not generate a unique welcome code");
};

/** Codes that expire within `daysLeft` days (Pacific) and haven't had a reminder. */
export const welcomeCodesNeedingReminder = async (
  daysLeft: number,
  now: Date = new Date(),
): Promise<WelcomeCode[]> => {
  const today = pacificCalendarDate(now);
  const snapshot = await getDatabase()
    .collection(COLLECTION)
    .where("expiresOn", ">=", today)
    .where("expiresOn", "<=", calendarDateOffset(today, daysLeft))
    .get();
  return snapshot.docs
    .map((doc) => fromDocument(doc.data()))
    .filter((code) => !code.reminderSentAt);
};

export const markWelcomeReminderSent = async (code: string, now: Date = new Date()): Promise<void> => {
  await getDatabase().collection(COLLECTION).doc(code).update({ reminderSentAt: now });
};
