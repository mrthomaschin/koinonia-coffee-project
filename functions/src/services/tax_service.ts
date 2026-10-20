import { createLogger } from "../logger";
import { getStripeClient } from "../integrations/stripe/stripe_client";

const logger = createLogger("tax");

/** Stripe product tax codes (docs.stripe.com/tax/tax-codes). */
export const TAX_CODES = {
  // Packaged whole-bean or ground coffee for consumption off premises.
  coffee: "txcd_40040000",
  general: "txcd_99999999",
} as const;

export interface TaxLine {
  amount: number; // cents, after any discount
  reference: string;
  taxCode: string;
}

export interface TaxAddress {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postal_code: string;
  country?: string;
}

export interface TaxResult {
  taxCents: number;
  source: "stripe_tax" | "fallback";
  taxBreakdown?: unknown;
  taxRate?: number;
}

// Used only when Stripe Tax is unavailable.
const FALLBACK_STATE_TAX_RATES: Record<string, number> = {
  AL: 0.04,
  AK: 0.0,
  AZ: 0.056,
  AR: 0.065,
  CA: 0.0725,
  CO: 0.029,
  CT: 0.0635,
  DE: 0.0,
  FL: 0.06,
  GA: 0.04,
  HI: 0.04,
  ID: 0.06,
  IL: 0.0625,
  IN: 0.07,
  IA: 0.06,
  KS: 0.065,
  KY: 0.06,
  LA: 0.0445,
  ME: 0.055,
  MD: 0.06,
  MA: 0.0625,
  MI: 0.06,
  MN: 0.06875,
  MS: 0.07,
  MO: 0.04225,
  MT: 0.0,
  NE: 0.055,
  NV: 0.0685,
  NH: 0.0,
  NJ: 0.06625,
  NM: 0.05125,
  NY: 0.04,
  NC: 0.0475,
  ND: 0.05,
  OH: 0.0575,
  OK: 0.045,
  OR: 0.0,
  PA: 0.06,
  RI: 0.07,
  SC: 0.06,
  SD: 0.045,
  TN: 0.07,
  TX: 0.0625,
  UT: 0.0595,
  VT: 0.06,
  VA: 0.053,
  WA: 0.065,
  WV: 0.06,
  WI: 0.05,
  WY: 0.04,
  DC: 0.06,
};

/** Sales tax on the lines for delivery to the address. Shipping is not taxed. */
export const computeTax = async (
  lines: TaxLine[],
  address: TaxAddress,
): Promise<TaxResult> => {
  const taxableLines = lines.filter((line) => line.amount > 0);
  if (!taxableLines.length) return { taxCents: 0, source: "stripe_tax" };

  try {
    const calculation = await getStripeClient().tax.calculations.create({
      currency: "usd",
      line_items: taxableLines.map((line) => ({
        amount: Math.round(line.amount),
        reference: line.reference,
        tax_code: line.taxCode,
      })),
      customer_details: {
        address: {
          line1: address.line1,
          line2: address.line2 || "",
          city: address.city,
          state: address.state,
          postal_code: address.postal_code,
          country: address.country || "US",
        },
        address_source: "shipping",
      },
    });
    // A result of 0 is accepted; the order may be legitimately exempt.
    return {
      taxCents: calculation.tax_amount_exclusive,
      source: "stripe_tax",
      taxBreakdown: calculation.tax_breakdown,
    };
  } catch (error: unknown) {
    logger.warn("Stripe Tax API failed, using fallback rates", {
      error: (error as Error).message,
    });
  }

  const state = address.state?.toUpperCase() || "CA";
  const isCaliforniaCoffeeOnly =
    state === "CA" &&
    taxableLines.every((line) => line.taxCode === TAX_CODES.coffee);
  const taxRate = isCaliforniaCoffeeOnly
    ? 0
    : (FALLBACK_STATE_TAX_RATES[state] ?? 0.0725);
  const subtotal = taxableLines.reduce((sum, line) => sum + line.amount, 0);
  return {
    taxCents: Math.round(subtotal * taxRate),
    source: "fallback",
    taxRate,
  };
};
