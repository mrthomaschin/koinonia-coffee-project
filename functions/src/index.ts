import { setGlobalOptions } from "firebase-functions/v2";
import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
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

// Configure CORS for deployed environment (v2)
const allowedOrigins = [
  'https://koinoniacoffeeproject.com',
  'https://koinonia-coffee-project.web.app',
  'http://localhost:3001',
  'http://localhost:3000'
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Handle preflight requests
app.options('*', cors());

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

// Get inventory items from Notion
app.get("/get-inventory", async (req: Request, res: Response) => {
  try {
    logger.info("Fetching inventory from Notion");

    const databaseId = process.env.NOTION_INVENTORY_DATABASE_ID;
    if (!databaseId) {
      logger.error("Notion inventory database ID not configured");
      res.status(500).json({ error: "Notion inventory database ID not configured" });
      return;
    }

    const notion = getNotion();

    // Verify notion client is properly initialized
    if (!notion) {
      logger.error("Notion client not initialized");
      res.status(500).json({ error: "Notion client initialization failed" });
      return;
    }

    const response = await notion.databases.query({
      database_id: databaseId,
      filter: {
        property: "Active",
        checkbox: {
          equals: true,
        },
      },
      sorts: [
        {
          property: "Index",
          direction: "ascending",
        },
        {
          property: "Created At",
          direction: "descending",
        },
      ],
    });

    // Separate parent items and variants
    const parentItems = new Map<string, any>();
    const variants = new Map<string, any[]>();

    response.results.forEach((page: any) => {
      if (!("properties" in page)) return;

      const properties = page.properties;
      const isVariant = properties["Is Variant"]?.checkbox || false;
      const parentSKU = properties["Parent SKU"]?.rich_text?.[0]?.plain_text || "";
      const sku = properties["SKU"]?.rich_text?.[0]?.plain_text || "";

      if (isVariant && parentSKU) {
        // This is a variant - store it under parent SKU
        if (!variants.has(parentSKU)) {
          variants.set(parentSKU, []);
        }
        variants.get(parentSKU)!.push(properties);
      } else if (!isVariant) {
        // This is a parent item
        if (sku) {
          parentItems.set(sku, properties);
        }
      }
    });

    // Build final items with variants
    const items = Array.from(parentItems.entries()).map(([sku, properties]) => {
      // Extract common properties
      const name = properties["Name"]?.title?.[0]?.plain_text || "";
      const description = properties["Description"]?.rich_text?.[0]?.plain_text || "";
      const price = properties["Price"]?.number || 0;
      const itemType = properties["Item Type"]?.select?.name || "";
      // Default to quantity 1 if not set, so items can display
      const quantity = properties["Quantity"]?.number ?? 1;
      const createdAt = properties["Created At"]?.date?.start || new Date().toISOString();

      // Extract images - prefer Firebase Storage URLs over Notion images
      const firebaseImageUrlsArray = properties["Firebase Image URLs"]?.rich_text || [];
      const firebaseImageUrls = firebaseImageUrlsArray
        .map((text: any) => text.plain_text)
        .join("");
      let images: string[] = [];

      if (firebaseImageUrls) {
        // Parse multiple Firebase Storage URLs (comma or newline separated)
        images = firebaseImageUrls
          .split(/[,\n]/)
          .map((url: string) => url.trim())
          .filter((url: string) => url && (url.startsWith("http://") || url.startsWith("https://")));
      }

      // Fallback to Notion images if no Firebase URLs
      if (images.length === 0) {
        const imagesProperty = properties["Images"]?.files || [];
        images = imagesProperty.map((file: any) => {
          if (file.type === "external") {
            return file.external.url;
          } else if (file.type === "file") {
            return file.file.url;
          }
          return "";
        }).filter((url: string) => url);
      }

      // Use placeholder if no images available
      if (images.length === 0) {
        images = ["/assets/images/shop_placeholder.png"];
      }

      // Coffee-specific properties
      const weights = properties["Weights"]?.multi_select?.map((w: any) => w.name) || [];
      const roastLevel = properties["Roast Level"]?.select?.name || "";
      const origin = properties["Origin"]?.rich_text?.[0]?.plain_text || "";
      const tastingNotes = properties["Tasting Notes"]?.multi_select?.map((n: any) => n.name) || [];

      // Merch-specific properties
      const sizes = properties["Sizes"]?.multi_select?.map((s: any) => s.name) || [];
      const colors = properties["Colors"]?.multi_select?.map((c: any) => c.name) || [];

      // Process variants if they exist
      const itemVariants = variants.get(sku);
      let variantInventory = null;

      if (itemVariants && itemVariants.length > 0) {
        variantInventory = itemVariants.map((variantProps: any) => ({
          sku: variantProps["SKU"]?.rich_text?.[0]?.plain_text || "",
          size: variantProps["Variant Size"]?.select?.name || "",
          color: variantProps["Variant Color"]?.select?.name || "",
          weight: variantProps["Variant Weight"]?.select?.name || "",
          quantity: variantProps["Quantity"]?.number || 0,
          price: variantProps["Price"]?.number || 0,
        }));
      }

      return {
        sku,
        name,
        description,
        price,
        images,
        itemType,
        createdAt,
        quantity,
        // Coffee-specific
        weights,
        roastLevel,
        origin,
        tastingNotes,
        // Merch-specific
        sizes,
        colors,
        // Variant inventory
        variants: variantInventory,
      };
    }).filter((item: any) => item !== null);

    logger.info(`Successfully fetched ${items.length} inventory items`);
    res.json({ items });
  } catch (error: unknown) {
    logger.error("Error fetching inventory", { error: (error as Error).message });
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
        return `${item.quantity}x ${itemName}`;
      })
      .join("\n");


    const itemsOrderedFormatted = items
      .map((item: any) => {
        const itemName = item.variations ?
          `${item.name} (${item.variations})` :
          item.name;
        return `${itemName},${item.sku},${item.quantity}`;
      })
      .join("\n");


    const notion = getNotion();
    const response = await notion.pages.create({
      parent: {
        database_id: databaseId,
      },
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
        "Items ordered formatted": {
          rich_text: [
            {
              text: {
                content: itemsOrderedFormatted,
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
  cors: [
    'https://koinoniacoffeeproject.com',
    'https://koinonia-coffee-project.web.app',
    'http://localhost:3001',
    'http://localhost:3000'
  ],
  corsOptions: {
    maxAge: 3600,
  }
};

// Only add secrets in production (not in emulator)
if (process.env.FUNCTIONS_EMULATOR !== "true") {
  functionOptions.secrets = [
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "NOTION_TOKEN",
    "NOTION_ONLINE_ORDERS_DATABASE_ID",
    "NOTION_INVENTORY_DATABASE_ID",
    "EMAILJS_SERVICE_ID",
    "EMAILJS_PUBLIC_KEY",
    "EMAILJS_PRIVATE_KEY",
    "EMAILJS_SHIPPED_TEMPLATE_ID",
    "EMAILJS_DELIVERED_TEMPLATE_ID",
  ];
}

export const api = onRequest(functionOptions, app);

// Manual trigger endpoint for testing order status updates (development only)
const testOrderStatusCheckOptions: any = {
  cors: true,
};

if (process.env.FUNCTIONS_EMULATOR !== "true") {
  testOrderStatusCheckOptions.secrets = [
    "NOTION_TOKEN",
    "NOTION_ONLINE_ORDERS_DATABASE_ID",
    "EMAILJS_SERVICE_ID",
    "EMAILJS_PUBLIC_KEY",
    "EMAILJS_PRIVATE_KEY",
    "EMAILJS_SHIPPED_TEMPLATE_ID",
    "EMAILJS_DELIVERED_TEMPLATE_ID",
  ];
}

export const testOrderStatusCheck = onRequest(
  testOrderStatusCheckOptions,
  async (req: Request, res: Response) => {
    try {
      logger.info("🧪 Manual test trigger: Starting order status check...");

      const databaseId = process.env.NOTION_ONLINE_ORDERS_DATABASE_ID;
      const emailjsServiceId = process.env.EMAILJS_SERVICE_ID;
      const emailjsPublicKey = process.env.EMAILJS_PUBLIC_KEY;
      const emailjsPrivateKey = process.env.EMAILJS_PRIVATE_KEY;
      const shippedTemplateId = process.env.EMAILJS_SHIPPED_TEMPLATE_ID;
      const deliveredTemplateId = process.env.EMAILJS_DELIVERED_TEMPLATE_ID;

      if (!databaseId) {
        res.status(500).json({ error: "NOTION_ONLINE_ORDERS_DATABASE_ID not configured" });
        return;
      }

      if (!emailjsServiceId || !emailjsPublicKey || !emailjsPrivateKey) {
        res.status(500).json({ error: "EmailJS configuration missing" });
        return;
      }

      const notion = getNotion();

      // Query orders updated in the last 15 minutes
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

      const response = await notion.databases.query({
        database_id: databaseId,
        filter: {
          and: [
            {
              timestamp: "last_edited_time",
              last_edited_time: {
                after: fifteenMinutesAgo,
              },
            },
          ],
        },
      });

      logger.info(`Found ${response.results.length} recently updated orders`);

      const results = {
        ordersChecked: response.results.length,
        emailsSent: 0,
        errors: [] as string[],
      };

      for (const page of response.results) {
        if (!("properties" in page)) continue;

        const properties = page.properties;

        // Extract order data
        const fulfillmentProp = properties["Fulfillment"];
        const shippedEmailSentProp = properties["Shipped Email Sent"];
        const deliveredEmailSentProp = properties["Delivered Email Sent"];
        const emailProp = properties["Email"];
        const customerProp = properties["Customer"];
        const orderIdProp = properties["Order #"];
        const itemsOrderedProp = properties["Items ordered"];
        const shippingAddressProp = properties["Shipping address"];
        const trackingCarrierProp = properties["Tracking Carrier"];
        const trackingInfoProp = properties["Tracking Info"];

        if (
          fulfillmentProp?.type !== "status" ||
          shippedEmailSentProp?.type !== "checkbox" ||
          deliveredEmailSentProp?.type !== "checkbox" ||
          emailProp?.type !== "email" ||
          customerProp?.type !== "title" ||
          orderIdProp?.type !== "rich_text"
        ) {
          continue;
        }

        const fulfillmentStatus = (fulfillmentProp.status as any)?.name;
        const shippedEmailSent = shippedEmailSentProp.checkbox;
        const deliveredEmailSent = deliveredEmailSentProp.checkbox;
        const customerEmail = emailProp.email as string;
        const customerFullName = (customerProp.title as any)[0]?.plain_text || "Customer";
        const customerName = getFirstName(customerFullName);
        const orderId = (orderIdProp.rich_text as any)[0]?.plain_text || "N/A";
        const itemsOrdered = (itemsOrderedProp?.type === "rich_text" ?
          (itemsOrderedProp.rich_text as any)[0]?.plain_text || "" : "") as string;
        const shippingAddress = shippingAddressProp?.type === "rich_text" ?
          (shippingAddressProp.rich_text as any)[0]?.plain_text || "N/A" : "N/A";
        const trackingCarrier = trackingCarrierProp?.type === "select" ?
          (trackingCarrierProp.select as any)?.name || "" : "";
        const trackingInfo = trackingInfoProp?.type === "rich_text" ?
          (trackingInfoProp.rich_text as any)[0]?.plain_text || "" : "";

        if (!customerEmail) {
          logger.warn(`Order ${orderId} has no email address, skipping`);
          results.errors.push(`Order ${orderId}: No email address`);
          continue;
        }

        // Parse items for HTML rendering
        const itemsHtml: string = parseItemsToHtml(itemsOrdered);

        // Check if we need to send "Shipped" notification
        if (fulfillmentStatus === "Shipped" && !shippedEmailSent && shippedTemplateId) {
          logger.info(`Sending shipped notification for order ${orderId}`);

          try {
            await sendShippedNotification({
              serviceId: emailjsServiceId,
              templateId: shippedTemplateId,
              publicKey: emailjsPublicKey,
              privateKey: emailjsPrivateKey,
              toEmail: customerEmail,
              customerName,
              orderId,
              itemsHtml,
              shippingAddress,
              trackingCarrier,
              trackingInfo,
            });

            // Mark as sent in Notion
            await notion.pages.update({
              page_id: page.id,
              properties: {
                "Shipped Email Sent": {
                  checkbox: true,
                },
              },
            });

            logger.info(`✅ Shipped notification sent for order ${orderId}`);
            results.emailsSent++;
          } catch (error) {
            const errorMsg = `Failed to send shipped notification for ${orderId}: ${(error as Error).message}`;
            logger.error(errorMsg);
            results.errors.push(errorMsg);
          }
        }

        // Check if we need to send "Delivered" notification
        if (fulfillmentStatus === "Delivered" && !deliveredEmailSent && deliveredTemplateId) {
          logger.info(`Sending delivered notification for order ${orderId}`);

          try {
            await sendDeliveredNotification({
              serviceId: emailjsServiceId,
              templateId: deliveredTemplateId,
              publicKey: emailjsPublicKey,
              privateKey: emailjsPrivateKey,
              toEmail: customerEmail,
              customerName,
              orderId,
              itemsHtml,
              deliveryDate: new Date().toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              }),
            });

            // Mark as sent in Notion
            await notion.pages.update({
              page_id: page.id,
              properties: {
                "Delivered Email Sent": {
                  checkbox: true,
                },
              },
            });

            logger.info(`✅ Delivered notification sent for order ${orderId}`);
            results.emailsSent++;
          } catch (error) {
            const errorMsg = `Failed to send delivered notification for ${orderId}: ${(error as Error).message}`;
            logger.error(errorMsg);
            results.errors.push(errorMsg);
          }
        }
      }

      logger.info("Order status check completed");
      res.json({
        success: true,
        message: "Order status check completed",
        results,
      });
    } catch (error) {
      logger.error("Error in manual test trigger:", error);
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  }
);

// Scheduled function to check for order status updates and send notifications
// Runs every 10 minutes
const schedulerOptions: any = {
  schedule: "every 10 minutes",
  timeZone: "America/Los_Angeles",
};

// Only add secrets in production (not in emulator)
if (process.env.FUNCTIONS_EMULATOR !== "true") {
  schedulerOptions.secrets = [
    "NOTION_TOKEN",
    "NOTION_ONLINE_ORDERS_DATABASE_ID",
    "EMAILJS_SERVICE_ID",
    "EMAILJS_PUBLIC_KEY",
    "EMAILJS_PRIVATE_KEY",
    "EMAILJS_SHIPPED_TEMPLATE_ID",
    "EMAILJS_DELIVERED_TEMPLATE_ID",
  ];
}

export const checkOrderStatusUpdates = onSchedule(
  schedulerOptions,
  async (event) => {
    try {
      logger.info("Starting order status check...");

      const databaseId = process.env.NOTION_ONLINE_ORDERS_DATABASE_ID;
      const emailjsServiceId = process.env.EMAILJS_SERVICE_ID;
      const emailjsPublicKey = process.env.EMAILJS_PUBLIC_KEY;
      const emailjsPrivateKey = process.env.EMAILJS_PRIVATE_KEY;
      const shippedTemplateId = process.env.EMAILJS_SHIPPED_TEMPLATE_ID;
      const deliveredTemplateId = process.env.EMAILJS_DELIVERED_TEMPLATE_ID;

      if (!databaseId) {
        logger.error("NOTION_ONLINE_ORDERS_DATABASE_ID not configured");
        return;
      }

      if (!emailjsServiceId || !emailjsPublicKey || !emailjsPrivateKey) {
        logger.error("EmailJS configuration missing");
        return;
      }

      const notion = getNotion();

      // Query orders updated in the last 15 minutes
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

      const response = await notion.databases.query({
        database_id: databaseId,
        filter: {
          and: [
            {
              timestamp: "last_edited_time",
              last_edited_time: {
                after: fifteenMinutesAgo,
              },
            },
          ],
        },
      });

      logger.info(`Found ${response.results.length} recently updated orders`);

      for (const page of response.results) {
        if (!("properties" in page)) continue;

        const properties = page.properties;

        // Extract order data
        const fulfillmentProp = properties["Fulfillment"];
        const shippedEmailSentProp = properties["Shipped Email Sent"];
        const deliveredEmailSentProp = properties["Delivered Email Sent"];
        const emailProp = properties["Email"];
        const customerProp = properties["Customer"];
        const orderIdProp = properties["Order #"];
        const itemsOrderedProp = properties["Items ordered"];
        const shippingAddressProp = properties["Shipping address"];
        const trackingCarrierProp = properties["Tracking Carrier"];
        const trackingInfoProp = properties["Tracking Info"];

        if (
          fulfillmentProp?.type !== "status" ||
          shippedEmailSentProp?.type !== "checkbox" ||
          deliveredEmailSentProp?.type !== "checkbox" ||
          emailProp?.type !== "email" ||
          customerProp?.type !== "title" ||
          orderIdProp?.type !== "rich_text"
        ) {
          continue;
        }

        const fulfillmentStatus = (fulfillmentProp.status as any)?.name;
        const shippedEmailSent = shippedEmailSentProp.checkbox;
        const deliveredEmailSent = deliveredEmailSentProp.checkbox;
        const customerEmail = emailProp.email as string;
        const customerFullName = (customerProp.title as any)[0]?.plain_text || "Customer";
        const customerName = getFirstName(customerFullName);
        const orderId = (orderIdProp.rich_text as any)[0]?.plain_text || "N/A";
        const itemsOrdered = (itemsOrderedProp?.type === "rich_text" ?
          (itemsOrderedProp.rich_text as any)[0]?.plain_text || "" : "") as string;
        const shippingAddress = shippingAddressProp?.type === "rich_text" ?
          (shippingAddressProp.rich_text as any)[0]?.plain_text || "N/A" : "N/A";
        const trackingCarrier = trackingCarrierProp?.type === "select" ?
          (trackingCarrierProp.select as any)?.name || "" : "";
        const trackingInfo = trackingInfoProp?.type === "rich_text" ?
          (trackingInfoProp.rich_text as any)[0]?.plain_text || "" : "";

        if (!customerEmail) {
          logger.warn(`Order ${orderId} has no email address, skipping`);
          continue;
        }

        // Parse items for HTML rendering
        const itemsHtml: string = parseItemsToHtml(itemsOrdered);

        // Check if we need to send "Shipped" notification
        if (fulfillmentStatus === "Shipped" && !shippedEmailSent && shippedTemplateId) {
          logger.info(`Sending shipped notification for order ${orderId}`);

          try {
            await sendShippedNotification({
              serviceId: emailjsServiceId,
              templateId: shippedTemplateId,
              publicKey: emailjsPublicKey,
              privateKey: emailjsPrivateKey,
              toEmail: customerEmail,
              customerName,
              orderId,
              itemsHtml,
              shippingAddress,
              trackingCarrier,
              trackingInfo,
            });

            // Mark as sent in Notion
            await notion.pages.update({
              page_id: page.id,
              properties: {
                "Shipped Email Sent": {
                  checkbox: true,
                },
              },
            });

            logger.info(`✅ Shipped notification sent for order ${orderId}`);
          } catch (error) {
            logger.error(`Failed to send shipped notification for ${orderId}:`, error);
          }
        }

        // Check if we need to send "Delivered" notification
        if (fulfillmentStatus === "Delivered" && !deliveredEmailSent && deliveredTemplateId) {
          logger.info(`Sending delivered notification for order ${orderId}`);

          try {
            await sendDeliveredNotification({
              serviceId: emailjsServiceId,
              templateId: deliveredTemplateId,
              publicKey: emailjsPublicKey,
              privateKey: emailjsPrivateKey,
              toEmail: customerEmail,
              customerName,
              orderId,
              itemsHtml,
              deliveryDate: new Date().toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              }),
            });

            // Mark as sent in Notion
            await notion.pages.update({
              page_id: page.id,
              properties: {
                "Delivered Email Sent": {
                  checkbox: true,
                },
              },
            });

            logger.info(`✅ Delivered notification sent for order ${orderId}`);
          } catch (error) {
            logger.error(`Failed to send delivered notification for ${orderId}:`, error);
          }
        }
      }

      logger.info("Order status check completed");
    } catch (error) {
      logger.error("Error checking order status updates:", error);
    }
  }
);

// Helper function to extract first name from full name
function getFirstName(fullName: string): string {
  if (!fullName) return "Customer";
  const trimmed = fullName.trim();
  const firstSpace = trimmed.indexOf(" ");
  return firstSpace > 0 ? trimmed.substring(0, firstSpace) : trimmed;
}

// Helper function to parse items text into HTML for email templates
function parseItemsToHtml(itemsText: string): string {
  if (!itemsText) return "<p>No items found</p>";

  const lines = itemsText.split("\n").filter((line) => line.trim());

  return lines.map((line) => {
    const trimmed = line.trim();
    return `
      <div style="display: table; width: 100%; margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid #f0f0f0;">
        <div style="display: table-cell; vertical-align: top; padding-left: 16px;">
          <div style="font-size: 14px; font-weight: 500; color: #000000; margin-bottom: 4px;">${trimmed}</div>
        </div>
      </div>
    `;
  }).join("");
}

// Helper function to send shipped notification
async function sendShippedNotification(params: {
  serviceId: string;
  templateId: string;
  publicKey: string;
  privateKey: string;
  toEmail: string;
  customerName: string;
  orderId: string;
  itemsHtml: string;
  shippingAddress: string;
  trackingCarrier: string;
  trackingInfo: string;
}): Promise<void> {
  const { serviceId, templateId, publicKey, privateKey, toEmail, customerName, orderId, itemsHtml, shippingAddress, trackingCarrier, trackingInfo } = params;

  // Generate tracking URL based on carrier
  let trackingUrl = "https://tools.usps.com/go/TrackConfirmAction";
  if (trackingCarrier === "UPS") {
    trackingUrl = "https://www.ups.com/track";
  } else if (trackingCarrier === "Fedex") {
    trackingUrl = "https://www.fedex.com/fedextrack/";
  }

  const emailData = {
    service_id: serviceId,
    template_id: templateId,
    user_id: publicKey,
    accessToken: privateKey,
    template_params: {
      to_email: toEmail,
      customer_name: customerName,
      order_id: orderId,
      items_html: itemsHtml,
      shipping_address: shippingAddress,
      carrier: trackingCarrier || "USPS",
      tracking_info: trackingInfo || "Tracking information will be updated soon",
      tracking_number: trackingInfo || "Available soon",
      estimated_delivery: "3-5 business days",
      tracking_url: trackingUrl,
    },
  };

  const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(emailData),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`EmailJS API error: ${response.status} - ${errorText}`);
  }
}

// Helper function to send delivered notification
async function sendDeliveredNotification(params: {
  serviceId: string;
  templateId: string;
  publicKey: string;
  privateKey: string;
  toEmail: string;
  customerName: string;
  orderId: string;
  itemsHtml: string;
  deliveryDate: string;
}): Promise<void> {
  const { serviceId, templateId, publicKey, privateKey, toEmail, customerName, orderId, itemsHtml, deliveryDate } = params;

  const emailData = {
    service_id: serviceId,
    template_id: templateId,
    user_id: publicKey,
    accessToken: privateKey,
    template_params: {
      to_email: toEmail,
      customer_name: customerName,
      order_id: orderId,
      items_html: itemsHtml,
      delivery_date: deliveryDate,
      delivery_location: "Front door",
      review_url: "https://koinoniacoffeeproject.com/reviews",
    },
  };

  const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(emailData),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`EmailJS API error: ${response.status} - ${errorText}`);
  }
}
