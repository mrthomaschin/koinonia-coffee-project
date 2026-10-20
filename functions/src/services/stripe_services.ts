import Stripe from "stripe";
import { Request, Response } from "express";
import { createLogger } from "../logger";
import { getFirestore } from "firebase-admin/firestore";
import { sessionAccount } from "./account_service";
import { computeTax, TAX_CODES } from "./tax_service";
import {
  DeliveryInput,
  parseCartLines,
  PricingError,
  publicQuote,
  quoteCheckout,
  quoteMetadata,
} from "./checkout_pricing";
import { getStripeClient } from "../integrations/stripe/stripe_client";

const logger = createLogger("stripe");

const parseDelivery = (value: any): DeliveryInput | null => {
  if (value?.method === "pickup") return { method: "pickup" };
  if (value?.method === "shipping" && typeof value.shipmentId === "string" && typeof value.rateId === "string") {
    return { method: "shipping", shipmentId: value.shipmentId, rateId: value.rateId };
  }
  return null;
};

const getStripe = () => {
  return getStripeClient();
};

export class StripeService {
  /**
   * POST /create-payment-intent — body { items, discountCode? }, where items
   * are { sku, quantity, subscriptionPlan?, isPartnerOrder? }. The amount is
   * the server's price for the items less the discount; shipping and tax are
   * added by /checkout/quote once the customer has chosen delivery.
   */
  static async createPaymentIntent(req: Request, res: Response): Promise<void> {
    try {
      const session = await sessionAccount(req);
      const lines = parseCartLines(req.body?.items);
      const hasSubscription = lines.some((line) => !!line.subscriptionPlan);
      // Accounts are attached to the payment only for subscriptions, which renew against the saved card.
      const account = hasSubscription ? session : null;
      if (hasSubscription && !account) {
        res
          .status(401)
          .json({ error: "Please sign in before purchasing a subscription." });
        return;
      }

      const quote = await quoteCheckout({
        items: lines,
        discountCode: req.body?.discountCode,
        account: session,
      });
      if (quote.total < 50) {
        res.status(400).json({ error: "Invalid amount (minimum $0.50)" });
        return;
      }
      logger.info("Creating payment intent", { total: quote.total, discountCode: quote.discount?.code });

      let customerId: string | undefined;
      if (account) {
        const accountRef = getFirestore()
          .collection("accounts")
          .doc(account.id);
        const existingCustomerId =
          accountRef &&
          (await accountRef.get()).data()?.billing?.stripeCustomerId;
        customerId =
          typeof existingCustomerId === "string"
            ? existingCustomerId
            : undefined;
        if (!customerId) {
          const customer = await getStripe().customers.create({
            email: account.user.email,
            name: `${account.user.firstName} ${account.user.lastName}`.trim(),
            metadata: { accountId: account.id },
          });
          customerId = customer.id;
          await accountRef.set(
            {
              billing: { stripeCustomerId: customerId },
              updatedAt: Date.now(),
            },
            { merge: true },
          );
        }
      }
      const paymentIntent = await getStripe().paymentIntents.create({
        amount: quote.total,
        currency: "usd",
        customer: customerId,
        setup_future_usage: hasSubscription ? "off_session" : undefined,
        automatic_payment_methods: {
          enabled: true,
        },
        metadata: {
          ...quoteMetadata(quote),
          ...(account ? { accountId: account.id } : {}),
        },
      });

      logger.info("Payment intent created", { id: paymentIntent.id });

      res.json({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        quote: publicQuote(quote),
      });
    } catch (error: unknown) {
      if (error instanceof PricingError) {
        res.status(400).json({ error: error.message });
        return;
      }
      logger.error("Error creating payment intent", {
        error: (error as Error).message,
      });
      res.status(500).json({ error: "We couldn't start checkout. Please try again." });
    }
  }

  /**
   * POST /checkout/quote — called when the customer presses Pay. Body
   * { paymentIntentId, items, discountCode?, email, delivery }, where delivery
   * is { method: "pickup" } or { method: "shipping", shipmentId, rateId }.
   * Prices the order with shipping and tax and sets the payment to that
   * amount. The browser confirms the payment only when the quote matches the
   * total the customer saw.
   */
  static async quoteCheckout(req: Request, res: Response): Promise<void> {
    try {
      const paymentIntentId = String(req.body?.paymentIntentId || "");
      const delivery = parseDelivery(req.body?.delivery);
      if (!paymentIntentId.startsWith("pi_") || !delivery) {
        res.status(400).json({ error: "Missing checkout details. Please close checkout and try again." });
        return;
      }
      const account = await sessionAccount(req);
      const paymentIntent = await getStripe().paymentIntents.retrieve(paymentIntentId).catch(() => null);
      const openStatuses = ["requires_payment_method", "requires_confirmation", "requires_action"];
      if (
        !paymentIntent ||
        !openStatuses.includes(paymentIntent.status) ||
        (paymentIntent.metadata.accountId && paymentIntent.metadata.accountId !== account?.id)
      ) {
        res.status(409).json({ error: "This checkout has expired. Please close checkout and try again." });
        return;
      }

      const quote = await quoteCheckout({
        items: req.body?.items,
        discountCode: req.body?.discountCode,
        email: typeof req.body?.email === "string" ? req.body.email : null,
        delivery,
        account,
      });
      if (quote.cartHash !== paymentIntent.metadata.cartHash) {
        res.status(409).json({ error: "Your cart changed. Please close checkout and try again." });
        return;
      }
      if (quote.total < 50) {
        res.status(400).json({ error: "Invalid amount (minimum $0.50)" });
        return;
      }

      await getStripe().paymentIntents.update(paymentIntentId, {
        amount: quote.total,
        metadata: { ...quoteMetadata(quote), deliveryMethod: delivery.method },
      });
      logger.info("Checkout quoted", { paymentIntentId, total: quote.total, shipping: quote.shipping, tax: quote.tax });
      res.json({ quote: publicQuote(quote) });
    } catch (error: unknown) {
      if (error instanceof PricingError) {
        res.status(400).json({ error: error.message });
        return;
      }
      logger.error("Error quoting checkout", { error: (error as Error).message });
      res.status(500).json({ error: "We couldn't confirm your total. Please try again." });
    }
  }

  /** POST /calculate-tax — the estimate shown during checkout. The charged tax comes from the checkout quote. */
  static async calculateTax(req: Request, res: Response): Promise<void> {
    try {
      const { lineItems, shippingAddress } = req.body;

      if (!lineItems || !Array.isArray(lineItems) || lineItems.length === 0) {
        res.status(400).json({ error: "Missing required fields: lineItems" });
        return;
      }

      if (!shippingAddress) {
        res
          .status(400)
          .json({ error: "Missing required field: shippingAddress" });
        return;
      }

      const lines = lineItems.map((item: any) => ({
        amount: Math.round(Number(item.amount) || 0),
        reference: String(item.reference || "product"),
        taxCode: String(item.tax_code || TAX_CODES.general),
      }));
      const subtotal = lines.reduce(
        (sum: number, line: { amount: number }) => sum + line.amount,
        0,
      );
      const result = await computeTax(lines, shippingAddress);
      logger.info("Tax calculated", {
        taxCents: result.taxCents,
        source: result.source,
      });
      res.json({
        taxAmount: result.taxCents / 100,
        totalAmount: (subtotal + result.taxCents) / 100,
        source: result.source,
        ...(result.taxBreakdown ? { taxBreakdown: result.taxBreakdown } : {}),
        ...(result.taxRate !== undefined
          ? { taxRate: result.taxRate * 100 }
          : {}),
      });
    } catch (error: unknown) {
      logger.error("Error calculating tax", {
        error: (error as Error).message,
      });
      res.status(500).json({ error: (error as Error).message });
    }
  }

  static async getCheckoutSession(req: Request, res: Response): Promise<void> {
    try {
      const sessionId = Array.isArray(req.params.sessionId)
        ? req.params.sessionId[0]
        : req.params.sessionId;

      const session = await getStripe().checkout.sessions.retrieve(sessionId, {
        expand: ["line_items", "customer"],
      });

      // Format shipping address
      let shippingAddress = "";
      if (session.shipping_details?.address) {
        const addr = session.shipping_details.address;
        const parts = [
          addr.line1,
          addr.line2,
          addr.city,
          addr.state,
          addr.postal_code,
          addr.country,
        ].filter(Boolean);
        shippingAddress = parts.join(", ");
      }

      // Billing address is available on customer_details even when there
      // is no shipping address, as with local-pickup orders.
      let billingAddress = "";
      if (session.customer_details?.address) {
        const addr = session.customer_details.address;
        const parts = [
          addr.line1,
          addr.line2,
          addr.city,
          addr.state,
          addr.postal_code,
          addr.country,
        ].filter(Boolean);
        billingAddress = parts.join(", ");
      }

      res.json({
        id: session.id,
        payment_status: session.payment_status,
        customer_email: session.customer_details?.email,
        customer_name: session.customer_details?.name,
        customer_phone: session.customer_details?.phone,
        amount_total: session.amount_total,
        currency: session.currency,
        line_items: session.line_items,
        shipping_address: shippingAddress,
        billing_address: billingAddress,
      });
    } catch (error: unknown) {
      logger.error("Error retrieving session", {
        error: (error as Error).message,
      });
      res.status(500).json({ error: (error as Error).message });
    }
  }

  static async handleWebhook(req: Request, res: Response): Promise<void> {
    const sig = Array.isArray(req.headers["stripe-signature"])
      ? req.headers["stripe-signature"][0]
      : req.headers["stripe-signature"];

    if (!sig) {
      logger.error("No stripe-signature header found");
      res.status(400).send("No stripe-signature header");
      return;
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      logger.error("Webhook secret not configured");
      res.status(500).send("Webhook secret not configured");
      return;
    }

    let event: Stripe.Event;

    try {
      event = getStripe().webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err: unknown) {
      logger.error("Webhook signature verification failed", {
        error: (err as Error).message,
      });
      res.status(400).send(`Webhook Error: ${(err as Error).message}`);
      return;
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        logger.info("Payment successful", { sessionId: session.id });
        break;
      }
      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        logger.info("PaymentIntent was successful", {
          paymentIntentId: paymentIntent.id,
        });
        break;
      }
      case "payment_intent.payment_failed": {
        const failedPayment = event.data.object as Stripe.PaymentIntent;
        logger.error("Payment failed", { paymentIntentId: failedPayment.id });
        break;
      }
      default:
        logger.info("Unhandled event type", { eventType: event.type });
    }

    res.json({ received: true });
  }
}
