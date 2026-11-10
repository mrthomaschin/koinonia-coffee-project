const backendUrl = process.env.REACT_APP_BACKEND_URL || "http://localhost:3001";

export interface DiscountCartLine {
  subscriptionPlan?: string;
  isPartnerOrder?: boolean;
}

export interface DiscountValidation {
  valid: boolean;
  code?: string;
  percentOff?: number;
  // The percentage only comes off the subscription items.
  subscriptionsOnly?: boolean;
  message: string;
  // Which rule refused the code. "first-order" means the buyer has ordered before.
  reason?:
    | "subscription"
    | "no-subscription"
    | "partner-pricing"
    | "first-order";
}

/**
 * Checks a discount code against its rules. Send the cart's lines so codes
 * that can't be combined with subscriptions or partner pricing are caught,
 * and the buyer's email (once known) so first-order codes are checked.
 */
export const validateDiscountCode = async (
  input: { code: string; email?: string; items?: DiscountCartLine[] },
  token?: string | null,
): Promise<DiscountValidation> => {
  const response = await fetch(`${backendUrl}/validate-discount-code`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(input),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Unable to validate discount code.");
  }
  return {
    ...data,
    message:
      data.message ||
      (data.valid ? "Discount applied!" : "Invalid discount code"),
  };
};

export interface AutomaticDiscount {
  code: string;
  percentOff: number;
  subscriptionsOnly: boolean;
}

/**
 * The promotion that applies to this cart without a code (one marked
 * "Automatically Applied" in Notion), or null. Checkout applies it on the
 * server whenever no code is entered; the cart only shows it.
 */
export const fetchAutomaticDiscount = async (
  items: DiscountCartLine[],
  token?: string | null,
): Promise<AutomaticDiscount | null> => {
  const response = await fetch(`${backendUrl}/automatic-discount`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ items }),
  });
  if (!response.ok) return null;
  const data = await response.json().catch(() => ({}));
  return data.discount || null;
};
