import Stripe from "stripe";
import { Request, Response } from "express";
import { createLogger } from "../logger";

const logger = createLogger("stripe");

// Lazy-initialize Stripe to avoid errors during deployment
let stripeInstance: Stripe | null = null;
const getStripe = () => {
    if (!stripeInstance) {
        const key = process.env.STRIPE_SECRET_KEY;
        if (!key) {
            throw new Error("STRIPE_SECRET_KEY is not configured");
        }
        stripeInstance = new Stripe(key, {
            apiVersion: "2025-02-24.acacia",
        });
    }
    return stripeInstance;
};

export class StripeService {
    static async createPaymentIntent(req: Request, res: Response): Promise<void> {
        try {
            const { amount, currency = "usd", metadata, shippingOptions } = req.body;

            logger.info("Creating payment intent", { amount, currency, metadata });

            if (!amount || amount < 50) {
                res.status(400).json({ error: "Invalid amount (minimum $0.50)" });
                return;
            }

            const paymentIntent = await getStripe().paymentIntents.create({
                amount: Math.round(amount),
                currency,
                automatic_payment_methods: {
                    enabled: true,
                },
                metadata: metadata || {},
                shipping: shippingOptions ? {
                    name: shippingOptions.name || "Customer",
                    address: shippingOptions.address,
                } : undefined,
            });

            logger.info("Payment intent created", { id: paymentIntent.id });

            res.json({
                clientSecret: paymentIntent.client_secret,
                paymentIntentId: paymentIntent.id,
            });
        } catch (error: unknown) {
            logger.error("Error creating payment intent", { error: (error as Error).message });
            res.status(500).json({ error: (error as Error).message });
        }
    }

    static async createCheckoutSession(req: Request, res: Response): Promise<void> {
        try {
            const { lineItems, successUrl, cancelUrl } = req.body;

            logger.info("Received checkout request", {
                lineItemsCount: lineItems?.length || 0,
                successUrl,
                cancelUrl,
            });

            if (!lineItems || lineItems.length === 0) {
                res.status(400).json({ error: "No line items provided" });
                return;
            }

            const sessionConfig: Stripe.Checkout.SessionCreateParams = {
                payment_method_types: ["card"],
                line_items: lineItems.map((item: Record<string, unknown>) => {
                    const validImages = ((item.images as string[]) || []).filter(
                        (img: string) =>
                            img && (img.startsWith("http://") || img.startsWith("https://"))
                    );

                    return {
                        price_data: {
                            currency: (item.currency as string) || "usd",
                            product_data: {
                                name: item.name as string,
                                images: validImages.length > 0 ? validImages : undefined,
                            },
                            unit_amount: Math.max(item.amount as number, 50),
                        },
                        quantity: item.quantity as number,
                    };
                }),
                mode: "payment",
                success_url: successUrl,
                cancel_url: cancelUrl,
                shipping_address_collection: {
                    allowed_countries: ["US", "CA"],
                },
                billing_address_collection: "required",
            };

            logger.info("Creating Stripe session", { sessionConfig });

            const session = await getStripe().checkout.sessions.create(sessionConfig);

            logger.info("Session created successfully", {
                sessionId: session.id,
                url: session.url,
            });

            res.json({ url: session.url, sessionId: session.id });
        } catch (error: unknown) {
            logger.error("Error creating checkout session", { error: (error as Error).message });
            res.status(500).json({ error: (error as Error).message });
        }
    }

    static async getCheckoutSession(req: Request, res: Response): Promise<void> {
        try {
            const sessionId = Array.isArray(req.params.sessionId) ?
                req.params.sessionId[0] :
                req.params.sessionId;

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
            });
        } catch (error: unknown) {
            logger.error("Error retrieving session", { error: (error as Error).message });
            res.status(500).json({ error: (error as Error).message });
        }
    }

    static async handleWebhook(req: Request, res: Response): Promise<void> {
        const sig = Array.isArray(req.headers["stripe-signature"]) ?
            req.headers["stripe-signature"][0] :
            req.headers["stripe-signature"];

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
