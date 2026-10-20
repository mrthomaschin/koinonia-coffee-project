const backendUrl = process.env.REACT_APP_BACKEND_URL || "http://localhost:3001";

export interface DiscountCartLine {
  subscriptionPlan?: string;
  isPartnerOrder?: boolean;
}

export interface DiscountValidation {
  valid: boolean;
  code?: string;
  percentOff?: number;
  message: string;
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
    message: data.message || (data.valid ? "Discount applied!" : "Invalid discount code"),
  };
};
