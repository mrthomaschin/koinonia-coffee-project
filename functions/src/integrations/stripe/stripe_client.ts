import Stripe from "stripe";

let stripeInstance: Stripe | null = null;

/** Lazily creates the process-local Stripe client. */
export const getStripeClient = (): Stripe => {
  if (!stripeInstance) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
    stripeInstance = new Stripe(key, { apiVersion: "2025-02-24.acacia" });
  }
  return stripeInstance;
};
