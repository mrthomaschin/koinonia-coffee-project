import { setGlobalOptions } from "firebase-functions/v2";
import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import Stripe from "stripe";
import { Client } from "@notionhq/client";
import express, { Request, Response } from "express";
import cors from "cors";
import * as dotenv from "dotenv";

// Load .env.local for development (emulator only)
// Production uses Firebase secrets, not .env files
dotenv.config({ path: ".env.local" });

setGlobalOptions({ maxInstances: 10 });

// Updated secrets: 2026-07-07

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

// Lazy-initialize Notion client
let notionInstance: Client | null = null;
const getNotion = () => {
  if (!notionInstance) {
    const token = process.env.NOTION_TOKEN;
    if (!token) {
      throw new Error("NOTION_TOKEN is not configured");
    }
    notionInstance = new Client({ auth: token });
  }
  return notionInstance;
};

const app = express();

app.use(cors({ origin: true }));
app.use(express.json());

// Create Payment Intent for embedded checkout
app.post("/create-payment-intent", async (req: Request, res: Response) => {
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
});

// Keep the existing checkout session endpoint for backward compatibility
app.post("/create-checkout-session", async (req: Request, res: Response) => {
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
});

app.get("/checkout-session/:sessionId", async (req: Request, res: Response) => {
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
});

// Create Notion order entry
app.post("/create-notion-order", async (req: Request, res: Response) => {
  try {
    const {
      customerName,
      customerEmail,
      customerPhone,
      orderId,
      items,
      totalAmount,
      orderDate,
      transactionId,
      shippingAddress,
    } = req.body;

    logger.info("Creating Notion order", { orderId });

    const databaseId = process.env.NOTION_ONLINE_ORDERS_DATABASE_ID;
    if (!databaseId) {
      logger.error("Notion database ID not configured");
      res.status(500).json({ error: "Notion database ID not configured" });
      return;
    }

    const itemsOrdered = items
      .map((item: any) => {
        const itemName = item.variations ?
          `${item.name} (${item.variations})` :
          item.name;
        return `${item.quantity}x ${itemName} - $${(item.price * item.quantity).toFixed(2)}`;
      })
      .join("\n");

    const notion = getNotion();
    const response = await notion.pages.create({
      parent: { database_id: databaseId },
      properties: {
        "Customer": {
          title: [
            {
              text: {
                content: customerName,
              },
            },
          ],
        },
        "Order #": {
          rich_text: [
            {
              text: {
                content: orderId,
              },
            },
          ],
        },
        "Status": {
          status: {
            name: "Paid",
          },
        },
        "Fulfillment": {
          status: {
            name: "Pending",
          },
        },
        "Items ordered": {
          rich_text: [
            {
              text: {
                content: itemsOrdered,
              },
            },
          ],
        },
        "Email": {
          email: customerEmail,
        },
        "Phone": {
          phone_number: customerPhone || null,
        },
        "Shipping address": {
          rich_text: [
            {
              text: {
                content: shippingAddress || "N/A",
              },
            },
          ],
        },
        "Transaction ID": {
          rich_text: [
            {
              text: {
                content: transactionId,
              },
            },
          ],
        },
        "Receipt": {
          url: `https://dashboard.stripe.com/payments/${transactionId}`,
        },
        "Total": {
          number: totalAmount,
        },
        "Order created": {
          date: {
            start: new Date(orderDate).toISOString(),
          },
        },
      },
    });

    logger.info("Notion order created successfully", {
      orderId,
      pageId: response.id,
    });

    res.json({ success: true, pageId: response.id });
  } catch (error: unknown) {
    logger.error("Error creating Notion order", {
      error: (error as Error).message,
    });
    res.status(500).json({ error: (error as Error).message });
  }
});

app.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req: Request, res: Response) => {
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
);

// Configure function options based on environment
// In production: use Firebase secrets
// In emulator: use .env file (secrets config causes emulator to fetch from Firebase)
const functionOptions: any = {
  cors: true,
};

// Only add secrets in production (not in emulator)
if (process.env.FUNCTIONS_EMULATOR !== "true") {
  functionOptions.secrets = [
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "NOTION_TOKEN",
    "NOTION_ONLINE_ORDERS_DATABASE_ID",
  ];
}

export const api = onRequest(functionOptions, app);
