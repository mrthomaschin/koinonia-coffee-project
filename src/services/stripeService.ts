import { loadStripe, Stripe } from "@stripe/stripe-js";
import { createLogger } from "../util/logger";

const logger = createLogger("StripeService");

/** A checkout request the server refused. The message is safe to show customers. */
export class CheckoutError extends Error {
  // True when only the discount code was refused; checkout can go ahead without it.
  constructor(
    message: string,
    readonly discountRejected = false,
  ) {
    super(message);
  }
}

/** A cart line as the server prices it. */
export interface CheckoutLine {
  sku: string;
  quantity: number;
  subscriptionPlan?: string;
  isPartnerOrder?: boolean;
}

export type CheckoutDelivery =
  | { method: "pickup" }
  | { method: "shipping"; shipmentId: string; rateId: string };

/** The server's price for a checkout. Amounts are in cents. */
export interface CheckoutQuote {
  subtotal: number;
  discount: { code: string; percentOff: number; amount: number } | null;
  shipping: number;
  tax: number;
  total: number;
  lines: {
    sku: string;
    quantity: number;
    unitPrice: number;
    amount: number;
    taxCode: string;
  }[];
  // Each line's amount after its share of the discount; tax is charged on these.
  taxableAmounts: number[];
}

class StripeService {
  private stripePromise: Promise<Stripe | null>;
  private backendUrl: string;

  constructor() {
    const publishableKey = process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY || "";
    this.stripePromise = loadStripe(publishableKey);
    this.backendUrl =
      process.env.REACT_APP_BACKEND_URL || "http://localhost:3001";
  }

  private async post<T>(
    path: string,
    body: unknown,
    token?: string | null,
  ): Promise<T> {
    const response = await fetch(`${this.backendUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new CheckoutError(
        data.error || `HTTP error! status: ${response.status}`,
        data.discountRejected === true,
      );
    }
    return data as T;
  }

  /**
   * Starts checkout. The server prices the items and discount itself; shipping
   * and tax are added by quoteCheckout when the customer pays.
   */
  async createPaymentIntent(
    items: CheckoutLine[],
    discountCode: string | null,
    token?: string | null,
  ): Promise<{
    clientSecret: string;
    paymentIntentId: string;
    quote: CheckoutQuote;
  }> {
    logger.log("[stripeService] Creating payment intent", {
      lines: items.length,
      discountCode,
    });
    return this.post("/create-payment-intent", { items, discountCode }, token);
  }

  /** Prices the order with shipping and tax and sets the payment to that amount. */
  async quoteCheckout(
    input: {
      paymentIntentId: string;
      items: CheckoutLine[];
      discountCode: string | null;
      email: string;
      delivery: CheckoutDelivery;
    },
    token?: string | null,
  ): Promise<CheckoutQuote> {
    return (
      await this.post<{ quote: CheckoutQuote }>("/checkout/quote", input, token)
    ).quote;
  }

  async retrieveSession(sessionId: string): Promise<any> {
    try {
      const response = await fetch(
        `${this.backendUrl}/checkout-session/${sessionId}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      logger.error("Error retrieving session:", error);
      throw error;
    }
  }

  getStripe(): Promise<Stripe | null> {
    return this.stripePromise;
  }
}

export const stripeService = new StripeService();
