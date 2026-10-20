const backendUrl = process.env.REACT_APP_BACKEND_URL || "http://localhost:3001";

export type NewsletterSignupSource = "footer" | "checkout" | "about";

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
}

/**
 * Subscribes an email to the monthly newsletter. Returns the first-order code
 * to show the new subscriber, or null for checkout signups, who just ordered.
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
