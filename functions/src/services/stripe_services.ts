import Stripe from "stripe";
import { Request, Response } from "express";
import { createLogger } from "../logger";
import { getFirestore } from "firebase-admin/firestore";
import { sessionAccount } from "./account_service";

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
            const cartItems = JSON.parse(metadata?.items || "[]") as Array<{ subscriptionPlan?: string }>;
            const hasSubscription = cartItems.some((item) => !!item.subscriptionPlan);
            const account = hasSubscription ? await sessionAccount(req) : null;
            if (hasSubscription && !account) {
                res.status(401).json({ error: "Please sign in before purchasing a subscription." });
                return;
            }

            logger.info("Creating payment intent", { amount, currency, metadata });

            if (!amount || amount < 50) {
                res.status(400).json({ error: "Invalid amount (minimum $0.50)" });
                return;
            }

            let customerId: string | undefined;
            if (account) {
                const accountRef = getFirestore().collection("accounts").doc(account.id);
                const existingCustomerId = accountRef && (await accountRef.get()).data()?.billing?.stripeCustomerId;
                customerId = typeof existingCustomerId === "string" ? existingCustomerId : undefined;
                if (!customerId) {
                    const customer = await getStripe().customers.create({
                        email: account.user.email,
                        name: `${account.user.firstName} ${account.user.lastName}`.trim(),
                        metadata: { accountId: account.id },
                    });
                    customerId = customer.id;
                    await accountRef.set({ billing: { stripeCustomerId: customerId }, updatedAt: Date.now() }, { merge: true });
                }
            }
            const paymentIntent = await getStripe().paymentIntents.create({
                amount: Math.round(amount),
                currency,
                customer: customerId,
                setup_future_usage: hasSubscription ? "off_session" : undefined,
                automatic_payment_methods: {
                    enabled: true,
                },
                metadata: { ...(metadata || {}), ...(account ? { accountId: account.id } : {}) },
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

    static async calculateTax(req: Request, res: Response): Promise<void> {
        try {
            const { lineItems, currency = "usd", shippingAddress } = req.body;

            logger.info("Calculating tax", { lineItems, currency, shippingAddress });

            if (!lineItems || !Array.isArray(lineItems) || lineItems.length === 0) {
                res.status(400).json({ error: "Missing required fields: lineItems" });
                return;
            }

            if (!shippingAddress) {
                res.status(400).json({ error: "Missing required field: shippingAddress" });
                return;
            }

            // Calculate total amount from line items
            const totalAmount = lineItems.reduce((sum: number, item: any) => sum + (item.amount || 0), 0);

            // Try Stripe Tax API first with line items
            try {
                const stripeLineItems = lineItems.map((item: any) => ({
                    amount: Math.round(item.amount),
                    reference: item.reference || "product",
                    tax_code: item.tax_code || "txcd_10000000", // Use tax code from line item
                }));

                const taxCalculation = await getStripe().tax.calculations.create({
                    currency,
                    line_items: stripeLineItems,
                    customer_details: {
                        address: {
                            line1: shippingAddress.line1,
                            line2: shippingAddress.line2 || "",
                            city: shippingAddress.city,
                            state: shippingAddress.state,
                            postal_code: shippingAddress.postal_code,
                            country: shippingAddress.country || "US",
                        },
                        address_source: "shipping",
                    },
                });

                const taxAmount = taxCalculation.tax_amount_exclusive;
                const totalWithTax = taxCalculation.amount_total;

                logger.info("Tax calculated using Stripe Tax", {
                    taxAmount,
                    totalWithTax,
                    taxBreakdown: taxCalculation.tax_breakdown,
                    taxabilityReason: taxCalculation.tax_breakdown[0]?.taxability_reason
                });

                // Accept Stripe Tax result even if tax is 0 (could be legitimately exempt)
                // Only fall back on actual API errors
                res.json({
                    taxAmount: taxAmount / 100,
                    totalAmount: totalWithTax / 100,
                    taxBreakdown: taxCalculation.tax_breakdown,
                    source: 'stripe_tax',
                });
                return;
            } catch (stripeTaxError) {
                logger.warn("Stripe Tax API failed, using fallback rates", { error: (stripeTaxError as Error).message });
            }

            // Fallback tax calculation using state tax rates
            const stateTaxRates: { [key: string]: number } = {
                'AL': 0.04, 'AK': 0.00, 'AZ': 0.056, 'AR': 0.065, 'CA': 0.0725,
                'CO': 0.029, 'CT': 0.0635, 'DE': 0.00, 'FL': 0.06, 'GA': 0.04,
                'HI': 0.04, 'ID': 0.06, 'IL': 0.0625, 'IN': 0.07, 'IA': 0.06,
                'KS': 0.065, 'KY': 0.06, 'LA': 0.0445, 'ME': 0.055, 'MD': 0.06,
                'MA': 0.0625, 'MI': 0.06, 'MN': 0.06875, 'MS': 0.07, 'MO': 0.04225,
                'MT': 0.00, 'NE': 0.055, 'NV': 0.0685, 'NH': 0.00, 'NJ': 0.06625,
                'NM': 0.05125, 'NY': 0.04, 'NC': 0.0475, 'ND': 0.05, 'OH': 0.0575,
                'OK': 0.045, 'OR': 0.00, 'PA': 0.06, 'RI': 0.07, 'SC': 0.06,
                'SD': 0.045, 'TN': 0.07, 'TX': 0.0625, 'UT': 0.0595, 'VT': 0.06,
                'VA': 0.053, 'WA': 0.065, 'WV': 0.06, 'WI': 0.05, 'WY': 0.04,
                'DC': 0.06,
            };

            const state = shippingAddress.state?.toUpperCase() || 'CA';
            const taxRate = stateTaxRates[state] || 0.0725;
            const taxAmount = Math.round(totalAmount * taxRate);
            const totalWithTax = totalAmount + taxAmount;

            logger.info("Tax calculated using fallback rates", {
                state,
                taxRate,
                taxAmount,
                totalWithTax
            });

            res.json({
                taxAmount: taxAmount / 100,
                totalAmount: totalWithTax / 100,
                taxRate: taxRate * 100,
                source: 'fallback',
            });
        } catch (error: unknown) {
            logger.error("Error calculating tax", { error: (error as Error).message });
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
