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

/** Emails a link that subscribes the address to the monthly newsletter once clicked. */
export const subscribeToNewsletter = async (
  signup: NewsletterSignup,
): Promise<void> => {
  const response = await fetch(`${backendUrl}/newsletter/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(signup),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      body.error || "We couldn't sign you up right now. Please try again.",
    );
  }
};

export interface NewsletterConfirmation {
  email: string;
  // The first-order code, only for people who have never ordered.
  discount: { code: string; percentOff: number } | null;
}

/** Confirms a signup from its emailed link. Each link works once. */
export const confirmNewsletter = async (
  token: string,
): Promise<NewsletterConfirmation> => {
  const response = await fetch(`${backendUrl}/newsletter/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      body.error ||
        "We couldn't confirm your subscription right now. Please try again.",
    );
  }
  return body as NewsletterConfirmation;
};
