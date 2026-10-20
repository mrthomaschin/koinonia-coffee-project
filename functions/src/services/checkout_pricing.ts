import { createHash } from "crypto";
import { getDatabase } from "../integrations/firebase_admin";
import { getEasyPostClient } from "../integrations/easypost/easypost_client";
import { NotionService } from "./notion_services";
import {
  AccountProfile,
  isPartnerLabel,
  partnerPriceOverridesFor,
  subscriptionPlans,
} from "./account_service";
import { DiscountService } from "./discount_service";
import { computeTax, TAX_CODES, TaxAddress } from "./tax_service";
import {
  parcelForOunces,
  shippingWeightOunces,
  SubscriptionParcel,
} from "../domain/shipping/parcel_rules";

/**
 * The server's price for a web checkout. The browser shows its own running
 * total while the customer fills in checkout, but the amount charged is always
 * this quote, built from the inventory cache, the Notion discount codes, the
 * EasyPost rate, and Stripe Tax.
 */

export const FREE_SHIPPING_THRESHOLD_CENTS = 4000;
// Consumer orders to the contiguous US pay a flat rate instead of the label
// price. Standard is USPS Ground Advantage (free over the threshold); express is
// UPS 2nd Day Air at one flat price, about its average label cost.
export const FLAT_RATE_STANDARD_CENTS = 700;
export const FLAT_RATE_EXPRESS_CENTS = 1200;
// Heavier parcels (gear like grinders and brewers) pay the express label price.
export const FLAT_RATE_EXPRESS_MAX_OUNCES = 48;
export const STANDARD_SERVICE = { carrier: "USPS", service: "GroundAdvantage" };
export const EXPRESS_SERVICE = { carrier: "UPSDAP", service: "2ndDayAir" };
// Alaska, Hawaii, territories, and military addresses pay the label price.
const NON_CONTIGUOUS_STATES = new Set([
  "AK",
  "HI",
  "PR",
  "VI",
  "GU",
  "AS",
  "MP",
  "AA",
  "AE",
  "AP",
]);
const SUBSCRIPTION_PRICE_FACTOR = 0.95;

/** Whether an order pays flat-rate shipping: consumer accounts (or guests) shipping to the contiguous US. */
export const usesFlatRateShipping = (
  accountLabel: string | null | undefined,
  to: { country?: string | null; state?: string | null },
): boolean =>
  !(accountLabel && isPartnerLabel(accountLabel as AccountProfile["label"])) &&
  (to.country || "US") === "US" &&
  !NON_CONTIGUOUS_STATES.has(String(to.state || "").toUpperCase());
const MAX_LINE_QUANTITY = 100;
// Local pickup orders are taxed where they are picked up.
const PICKUP_TAX_ADDRESS: TaxAddress = {
  line1: "15215 Avis Ave",
  city: "Lawndale",
  state: "CA",
  postal_code: "90260",
  country: "US",
};

/** A customer-facing reason the checkout can't be priced; safe to show as is. */
export class PricingError extends Error {
  // True when the discount code is the problem, so the checkout can go ahead without it.
  constructor(
    message: string,
    readonly discountRejected = false,
  ) {
    super(message);
  }
}

export interface CartLineInput {
  sku: string;
  quantity: number;
  subscriptionPlan?: string;
  isPartnerOrder?: boolean;
}

export interface PricedLine {
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number; // dollars, as the cart shows it
  amount: number; // cents
  taxCode: string;
  subscriptionPlan?: string;
}

export type DeliveryInput =
  | { method: "pickup" }
  | { method: "shipping"; shipmentId: string; rateId: string };

export interface CheckoutQuote {
  lines: PricedLine[];
  subtotal: number; // all amounts in cents
  discount: { code: string; percentOff: number; amount: number } | null;
  shipping: number;
  tax: number;
  total: number;
  // Identifies the cart the quote was built from, so a payment can't be repriced with different items.
  cartHash: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const inventoryItems = async (): Promise<any[]> => {
  const cached = (
    await getDatabase().collection("inventory_cache").doc("latest").get()
  ).data();
  if (Array.isArray(cached?.items) && cached.items.length) return cached.items;
  return (await NotionService.fetchInventoryFromNotion()).items;
};

const sameSku = (a: unknown, b: string): boolean =>
  typeof a === "string" && a.trim().toUpperCase() === b;

export const parseCartLines = (value: unknown): CartLineInput[] => {
  if (!Array.isArray(value) || !value.length)
    throw new PricingError("Your cart is empty.");
  return value.map((line: any) => {
    const sku =
      typeof line?.sku === "string" ? line.sku.trim().toUpperCase() : "";
    const quantity = Number(line?.quantity);
    const subscriptionPlan =
      typeof line?.subscriptionPlan === "string" && line.subscriptionPlan
        ? line.subscriptionPlan
        : undefined;
    if (
      !sku ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > MAX_LINE_QUANTITY
    ) {
      throw new PricingError(
        "Your cart has an invalid item. Please update your cart and try again.",
      );
    }
    if (
      subscriptionPlan &&
      !Object.prototype.hasOwnProperty.call(subscriptionPlans, subscriptionPlan)
    ) {
      throw new PricingError(
        "Your cart has an invalid subscription. Please update your cart and try again.",
      );
    }
    return {
      sku,
      quantity,
      ...(subscriptionPlan ? { subscriptionPlan } : {}),
      isPartnerOrder: line?.isPartnerOrder === true,
    };
  });
};

export const cartHashFor = (lines: CartLineInput[]): string =>
  createHash("sha256")
    .update(
      JSON.stringify(
        lines
          .map((line) => [line.sku, line.quantity, line.subscriptionPlan || ""])
          .sort(),
      ),
    )
    .digest("hex");

/**
 * Prices each line the way the site lists it: the variant's price (or the
 * item's when the variant has none), 5% off for subscriptions, and a partner's
 * price override for one-time partner orders. Wholesale SKUs need a partner account.
 */
export const priceCartLines = async (
  lines: CartLineInput[],
  account: AccountProfile | null,
): Promise<PricedLine[]> => {
  const [items, overrides] = await Promise.all([
    inventoryItems(),
    account
      ? partnerPriceOverridesFor(account)
      : Promise.resolve({} as Record<string, number>),
  ]);
  const isPartner = !!account && isPartnerLabel(account.label);

  return lines.map((line) => {
    const item = items.find(
      (candidate) =>
        sameSku(candidate?.sku, line.sku) ||
        candidate?.variants?.some((variant: any) =>
          sameSku(variant?.sku, line.sku),
        ),
    );
    const variant = item?.variants?.find((candidate: any) =>
      sameSku(candidate?.sku, line.sku),
    );
    if (!item || variant?.active === false) {
      throw new PricingError(
        `An item in your cart (${line.sku}) is no longer available. Please remove it and try again.`,
      );
    }
    const isWholesale =
      !!item.isWholesale || !!variant?.isWholesale || line.sku.endsWith("-WS");
    if (isWholesale && !isPartner) {
      throw new PricingError(
        "Your cart has a wholesale item, which needs a partner account.",
      );
    }

    const listPrice =
      variant && Number(variant.price) > 0
        ? Number(variant.price)
        : Number(item.price);
    const unitPrice = line.subscriptionPlan
      ? listPrice * SUBSCRIPTION_PRICE_FACTOR
      : (overrides[variant?.sku ?? item.sku] ?? listPrice);
    if (!(unitPrice > 0)) {
      throw new PricingError(
        `An item in your cart (${line.sku}) is no longer available. Please remove it and try again.`,
      );
    }
    return {
      sku: variant?.sku ?? item.sku,
      name: String(item.name || line.sku),
      quantity: line.quantity,
      unitPrice,
      amount: Math.round(unitPrice * line.quantity * 100),
      taxCode:
        item.itemType === "Coffee" ? TAX_CODES.coffee : TAX_CODES.general,
      ...(line.subscriptionPlan
        ? { subscriptionPlan: line.subscriptionPlan }
        : {}),
    };
  });
};

/**
 * The parcel a cart ships in, from each item's inventory shipping weight. Items
 * without a weight add nothing, matching how the storefront has always quoted.
 */
export const parcelForCartLines = async (
  lines: CartLineInput[],
): Promise<SubscriptionParcel> => {
  const items = await inventoryItems();
  const ounces = lines.reduce((total, line) => {
    const item = items.find(
      (candidate) =>
        sameSku(candidate?.sku, line.sku) ||
        candidate?.variants?.some((variant: any) =>
          sameSku(variant?.sku, line.sku),
        ),
    );
    if (!item) {
      throw new PricingError(
        `An item in your cart (${line.sku}) is no longer available. Please remove it and try again.`,
      );
    }
    const variant = item.variants?.find((candidate: any) =>
      sameSku(candidate?.sku, line.sku),
    );
    const weight =
      Number(variant?.shippingWeight) || Number(item.shippingWeight);
    return weight > 0
      ? total + shippingWeightOunces(weight) * line.quantity
      : total;
  }, 0);
  return parcelForOunces(ounces);
};

const shippingQuote = async (
  delivery: DeliveryInput,
  subtotalAfterDiscount: number,
  account: AccountProfile | null,
  cartHash: string,
): Promise<{ amount: number; taxAddress: TaxAddress }> => {
  if (delivery.method === "pickup")
    return { amount: 0, taxAddress: PICKUP_TAX_ADDRESS };

  const shipment: any = await getEasyPostClient()
    .Shipment.retrieve(delivery.shipmentId)
    .catch(() => null);
  const rate = shipment?.rates?.find(
    (candidate: any) => candidate.id === delivery.rateId,
  );
  if (!rate)
    throw new PricingError(
      "That shipping option is no longer available. Please choose shipping again.",
    );
  // The shipment's parcel was sized for one cart; a different cart needs new rates.
  if (shipment.reference !== cartHash) {
    throw new PricingError(
      "Your cart changed after shipping was quoted. Please choose shipping again.",
    );
  }

  const to = shipment.to_address || {};
  const isPartner = !!account && isPartnerLabel(account.label);
  const freeStandard =
    subtotalAfterDiscount >= FREE_SHIPPING_THRESHOLD_CENTS && !isPartner;
  const isGroundAdvantage =
    rate.carrier === STANDARD_SERVICE.carrier &&
    rate.service === STANDARD_SERVICE.service;
  const isExpress =
    rate.carrier === EXPRESS_SERVICE.carrier &&
    rate.service === EXPRESS_SERVICE.service;
  const isFlatRate = usesFlatRateShipping(account?.label, to);
  const standardCents = freeStandard ? 0 : FLAT_RATE_STANDARD_CENTS;

  let amount: number;
  if (isFlatRate && isGroundAdvantage) amount = standardCents;
  else if (
    isFlatRate &&
    isExpress &&
    Number(shipment.parcel?.weight) <= FLAT_RATE_EXPRESS_MAX_OUNCES
  ) {
    amount = FLAT_RATE_EXPRESS_CENTS;
  } else if (freeStandard && isGroundAdvantage) amount = 0;
  else amount = Math.round(Number.parseFloat(rate.rate) * 100);
  return {
    amount,
    // Tax follows where the order actually ships, not an address the browser sends.
    taxAddress: {
      line1: to.street1,
      line2: to.street2 || "",
      city: to.city,
      state: to.state,
      postal_code: to.zip,
      country: to.country || "US",
    },
  };
};
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Spreads the order discount across lines, so tax is charged on what the customer pays. */
const discountedLineAmounts = (
  lines: PricedLine[],
  subtotal: number,
  discountAmount: number,
): number[] => {
  let remaining = discountAmount;
  return lines.map((line, index) => {
    const share =
      index === lines.length - 1
        ? remaining
        : Math.round((discountAmount * line.amount) / subtotal);
    remaining -= share;
    return line.amount - share;
  });
};

/**
 * Prices a checkout. Without `delivery` the quote covers items and discount
 * only (used when checkout opens); with it, shipping and tax are added.
 */
export const quoteCheckout = async (input: {
  items: unknown;
  discountCode?: unknown;
  email?: string | null;
  delivery?: DeliveryInput;
  account: AccountProfile | null;
}): Promise<CheckoutQuote> => {
  const cartLines = parseCartLines(input.items);
  const lines = await priceCartLines(cartLines, input.account);
  const subtotal = lines.reduce((sum, line) => sum + line.amount, 0);

  let discount: CheckoutQuote["discount"] = null;
  if (typeof input.discountCode === "string" && input.discountCode.trim()) {
    const result = await DiscountService.checkoutDiscount(
      input.discountCode,
      input.account,
      input.email ?? null,
      cartLines,
    );
    if (!result.ok) throw new PricingError(result.message, true);
    discount = {
      code: result.discount.code,
      percentOff: result.discount.percentOff,
      amount: Math.round((subtotal * result.discount.percentOff) / 100),
    };
  }
  const subtotalAfterDiscount = subtotal - (discount?.amount || 0);

  const cartHash = cartHashFor(cartLines);
  let shipping = 0;
  let tax = 0;
  if (input.delivery) {
    const delivery = await shippingQuote(
      input.delivery,
      subtotalAfterDiscount,
      input.account,
      cartHash,
    );
    shipping = delivery.amount;
    const taxLines = discountedLineAmounts(
      lines,
      subtotal,
      discount?.amount || 0,
    ).map((amount, index) => ({
      amount,
      reference: lines[index].sku,
      taxCode: lines[index].taxCode,
    }));
    tax = (await computeTax(taxLines, delivery.taxAddress)).taxCents;
  }

  return {
    lines,
    subtotal,
    discount,
    shipping,
    tax,
    total: subtotalAfterDiscount + shipping + tax,
    cartHash,
  };
};

/** The quote as sent to the browser. */
export const publicQuote = (quote: CheckoutQuote) => ({
  subtotal: quote.subtotal,
  discount: quote.discount,
  shipping: quote.shipping,
  tax: quote.tax,
  total: quote.total,
  lines: quote.lines.map(({ sku, quantity, unitPrice, amount, taxCode }) => ({
    sku,
    quantity,
    unitPrice,
    amount,
    taxCode,
  })),
  // What tax is charged on: each line after its share of the discount.
  taxableAmounts: discountedLineAmounts(
    quote.lines,
    quote.subtotal,
    quote.discount?.amount || 0,
  ),
});

/** Stripe allows 50 metadata keys of up to 500 characters each. */
export const quoteMetadata = (
  quote: CheckoutQuote,
): Record<string, string> => ({
  items: quote.lines
    .map((line) => `${line.sku} x${line.quantity}`)
    .join(", ")
    .slice(0, 500),
  hasSubscription: quote.lines.some((line) => line.subscriptionPlan)
    ? "true"
    : "false",
  cartHash: quote.cartHash,
  subtotal: String(quote.subtotal),
  discountCode: quote.discount?.code || "",
  discountPercent: quote.discount ? String(quote.discount.percentOff) : "",
  discountAmount: String(quote.discount?.amount || 0),
  shipping: String(quote.shipping),
  tax: String(quote.tax),
});
