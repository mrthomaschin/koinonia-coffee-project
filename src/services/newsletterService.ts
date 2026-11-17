const backendUrl = process.env.REACT_APP_BACKEND_URL || "http://localhost:3001";

export type NewsletterSignupSource = "footer" | "checkout" | "about" | "homepage";

/**
 * First-order discount for new subscribers. Keep in step with WELCOME_DISCOUNT in
 * functions/src/config/newsletters.ts, which issues each subscriber's own code.
 */
export const WELCOME_PERCENT_OFF = 10;

interface NewsletterSignup {
  email: string;
  source: NewsletterSignupSource;
  firstName?: string;
  lastName?: string;
  // Hidden honeypot field; anything here marks the request as a bot.
  website?: string;
}

export interface WelcomeDiscount {
  code: string;
  percentOff: number;
  // Pacific calendar date (YYYY-MM-DD); the code works through the end of it.
  expiresOn: string;
}

/** "Thursday, November 19" for a YYYY-MM-DD calendar date. */
export const formatWelcomeExpiry = (calendarDate: string): string => {
  const [year, month, day] = calendarDate.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
};

/**
 * Subscribes an email to the monthly newsletter. Returns the subscriber's own
 * first-order code, which works only with this email until it expires, or
 * null for checkout signups (who just ordered) and expired codes.
 */
export const subscribeToNewsletter = async (
  signup: NewsletterSignup,
): Promise<WelcomeDiscount | null> => {
  const response = await fetch(`${backendUrl}/newsletter/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(signup),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      body.error || "We couldn't sign you up right now. Please try again.",
    );
  }
  return body.discount ?? null;
};

/**
 * A subscriber's code waiting to be applied at the cart. Kept in this browser
 * only; the code's rules are still checked when it's applied and at payment.
 */
const PENDING_CODE_KEY = "newsletter_pending_discount_code";

export const savePendingDiscountCode = (code: string): void => {
  try {
    localStorage.setItem(PENDING_CODE_KEY, code);
  } catch {
    // Storage can be blocked; the code is still shown and emailed.
  }
};

export const getPendingDiscountCode = (): string | null => {
  try {
    return localStorage.getItem(PENDING_CODE_KEY);
  } catch {
    return null;
  }
};

export const clearPendingDiscountCode = (): void => {
  try {
    localStorage.removeItem(PENDING_CODE_KEY);
  } catch {
    // Nothing to clear when storage is blocked.
  }
};
