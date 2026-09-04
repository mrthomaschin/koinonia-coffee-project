import { setGlobalOptions } from "firebase-functions/v2";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onRequest } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { createLogger } from "./logger";
import express, { Request, Response } from "express";
import cors from "cors";
import * as dotenv from "dotenv";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { NotionService } from "./services/notion_services";
import { EmailService } from "./services/email_service";
import { StripeService } from "./services/stripe_services";
import { getShippingRates, purchaseShipment } from "./services/easypost_service";
import { AccountService, getAllEventsCalendarDetails, refreshAllEventsCalendar } from "./services/account_service";

// Load .env.local for development (emulator only)
// Production uses Firebase secrets, not .env files
dotenv.config({ path: ".env.local" });
// Reuse public EmailJS template configuration from the web app during local
// emulator development. Production values must be Firebase secrets.
dotenv.config({ path: "../.env" });
process.env.EMAILJS_CUSTOMER_TEMPLATE_ID ||= process.env.REACT_APP_EMAILJS_CUSTOMER_TEMPLATE_ID;
process.env.EMAILJS_PURCHASE_TEMPLATE_ID ||= process.env.REACT_APP_EMAILJS_PURCHASE_TEMPLATE_ID;

const logger = createLogger('index');

setGlobalOptions({ maxInstances: 10 });

// Updated secrets: 2026-07-07

// Firestore cache setup
let firestoreDb: FirebaseFirestore.Firestore | null = null;
const getFirestoreDb = () => {
  if (!firestoreDb) {
    const defaultApp = getApps().find((app) => app.name === "[DEFAULT]") || initializeApp();
    firestoreDb = getFirestore(defaultApp);
  }
  return firestoreDb;
};

const INVENTORY_CACHE_DOC = "inventory_cache/latest";
const INVENTORY_CACHE_TTL_MS = 5 * 60 * 1000; // Reduced to 5 minutes to prevent stale data
const PROCESSED_EVENTS_COLLECTION = "processed_function_events";

const processedEventRef = (functionName: string, eventId: string) =>
  getFirestoreDb().collection(PROCESSED_EVENTS_COLLECTION)
    .doc(`${functionName}_${Buffer.from(eventId).toString("base64url")}`);

const hasProcessedEvent = async (functionName: string, eventId: string): Promise<boolean> =>
  (await processedEventRef(functionName, eventId).get()).exists;

const markEventProcessed = async (functionName: string, eventId: string, subscriptionId: string): Promise<void> => {
  await processedEventRef(functionName, eventId).set({
    functionName,
    eventId,
    subscriptionId,
    processedAt: new Date(),
    // Configure this field as a Firestore TTL policy if automatic cleanup is desired.
    expiresAt: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000),
  });
};

/* eslint-disable @typescript-eslint/no-explicit-any */
interface InventoryCache {
  items: any[];
  lastSyncedAt: number;
}

const fetchInventoryFromNotion = async (): Promise<InventoryCache> => NotionService.fetchInventoryFromNotion();
/* eslint-enable @typescript-eslint/no-explicit-any */

const getInventoryCache = async (): Promise<InventoryCache | null> => {
  try {
    const db = getFirestoreDb();
    const doc = await db.collection(INVENTORY_CACHE_DOC.split("/")[0])
      .doc(INVENTORY_CACHE_DOC.split("/")[1])
      .get();
    if (!doc.exists) return null;
    return doc.data() as InventoryCache;
  } catch (error: unknown) {
    logger.error("Error reading inventory cache", { error: (error as Error).message });
    return null;
  }
};

const writeInventoryCache = async (cache: InventoryCache): Promise<void> => {
  try {
    const db = getFirestoreDb();
    await db.collection(INVENTORY_CACHE_DOC.split("/")[0])
      .doc(INVENTORY_CACHE_DOC.split("/")[1])
      .set(cache);
  } catch (error: unknown) {
    logger.error("Error writing inventory cache", { error: (error as Error).message });
    throw error;
  }
};

const getInventoryWithFallback = async (): Promise<InventoryCache> => {
  const cache = await getInventoryCache();
  const now = Date.now();

  if (cache && now - cache.lastSyncedAt < INVENTORY_CACHE_TTL_MS) {
    logger.info("Serving inventory from Firestore cache");
    return cache;
  }

  try {
    logger.info("Inventory cache missing or stale; fetching from Notion");
    const fresh = await fetchInventoryFromNotion();
    await writeInventoryCache(fresh);
    return fresh;
  } catch (error: unknown) {
    logger.error("Failed to fetch inventory from Notion", { error: (error as Error).message });
    if (cache) {
      logger.warn("Serving stale inventory cache due to Notion fetch failure");
      return cache;
    }
    throw error;
  }
};

const syncInventoryToCache = async (): Promise<void> => {
  const fresh = await fetchInventoryFromNotion();
  await writeInventoryCache(fresh);
};

const app = express();

// Configure CORS for deployed environment (v2)
const allowedOrigins = [
  'https://koinoniacoffeeproject.com',
  'https://koinonia-coffee-project.web.app',
  'http://localhost:3001',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5001'
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
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Handle preflight requests explicitly
app.options('*', cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Create Payment Intent for embedded checkout
app.post("/create-payment-intent", StripeService.createPaymentIntent);

// Calculate tax for embedded checkout
app.post("/calculate-tax", StripeService.calculateTax);

// Keep the existing checkout session endpoint for backward compatibility
app.post("/create-checkout-session", StripeService.createCheckoutSession);

app.get("/checkout-session/:sessionId", StripeService.getCheckoutSession);

// Get inventory items from cache (Firestore) with Notion fallback
app.get("/get-inventory", async (req: Request, res: Response) => {
  try {
    const bypassCache = req.query.bypass === "true";
    let cache: InventoryCache;

    if (bypassCache) {
      logger.info("Bypassing cache, fetching fresh from Notion");
      cache = await fetchInventoryFromNotion();
      await writeInventoryCache(cache);
    } else {
      cache = await getInventoryWithFallback();
    }

    logger.info(`Returning ${cache.items.length} inventory items`);
    res.json({ items: cache.items, lastSyncedAt: cache.lastSyncedAt });
  } catch (error: unknown) {
    logger.error("Error fetching inventory", { error: (error as Error).message });
    res.status(500).json({ error: (error as Error).message });
  }
});

// Get upcoming local pickup options from Notion
app.get("/get-order-pickup-options", async (req: Request, res: Response) => NotionService.getOrderPickupOptions(req, res));

app.get("/events", async (_req: Request, res: Response) => {
  try {
    res.json({ events: await getAllEventsCalendarDetails() });
  } catch (error: unknown) {
    logger.error("Error fetching website events", { error: (error as Error).message });
    res.status(500).json({ error: "Unable to load events" });
  }
});

// Create Notion order entry
app.post("/create-notion-order", async (req: Request, res: Response) => NotionService.createNotionOrder(req, res));

// Check if order confirmed email was sent
app.get("/check-order-confirmed-email-sent", async (req: Request, res: Response) => NotionService.handleCheckOrderConfirmedEmailSent(req, res));

// Mark order confirmed email as sent
app.post("/mark-order-confirmed-email-sent", async (req: Request, res: Response) => NotionService.handleMarkOrderConfirmedEmailSent(req, res));

// Uncheck order confirmed email as sent
app.post("/uncheck-order-confirmed-email-sent", async (req: Request, res: Response) => NotionService.handleUncheckOrderConfirmedEmailSent(req, res));

// Validate discount code
app.post("/validate-discount-code", async (req: Request, res: Response) => NotionService.validateDiscountCode(req, res));

// Account and subscription data live in Firestore. Notion is an operations-facing mirror.
app.post("/account/login", AccountService.login);
app.post("/account/create", AccountService.createAccount);
app.get("/account/orders", AccountService.getOrders);
app.get("/account/subscriptions", AccountService.getSubscriptions);
app.get("/account/partner-prices", AccountService.getPartnerPrices);
app.post("/account/subscriptions", AccountService.createSubscription);
app.post("/account/subscription-checkout/complete", AccountService.completeSubscriptionCheckout);
app.post("/account/subscriptions/:subscriptionId/cancel", AccountService.cancelSubscription);
app.post("/account/subscriptions/:subscriptionId/skip", AccountService.skipSubscription);
app.post("/account/subscriptions/:subscriptionId/add-on", AccountService.addSubscriptionAddOn);
app.post("/account/logout", AccountService.logout);

// One-way Firestore -> Notion projection. Notion is an operations view only;
// it never writes subscription state back to Firestore.
const notionMirrorOptions = {
  region: "us-central1" as const,
  retry: true,
  secrets: ["NOTION_TOKEN", "NOTION_ONLINE_ORDERS_DATABASE_ID", "NOTION_SUBSCRIPTIONS_DATABASE_ID"],
};

export const syncSubscriptionToNotion = onDocumentWritten(
  { ...notionMirrorOptions, document: "account_subscriptions/{subscriptionId}" },
  async (event) => {
    if (!event.data?.after.exists) return;
    if (await hasProcessedEvent("syncSubscriptionToNotion", event.id)) {
      logger.info("Skipping previously processed subscription-mirror event", { eventId: event.id });
      return;
    }
    await AccountService.syncSubscriptionMirrorById(event.params.subscriptionId);
    await markEventProcessed("syncSubscriptionToNotion", event.id, event.params.subscriptionId);
  }
);

// Project durable orders to the operations database. This keeps Notion
// independent of the customer's redirect/browser state and makes retries safe.
export const syncAccountOrderToNotion = onDocumentWritten(
  { ...notionMirrorOptions, document: "orders/{orderId}" },
  async (event) => {
    if (!event.data?.after.exists) return;
    if (await hasProcessedEvent("syncAccountOrderToNotion", event.id)) return;
    await AccountService.syncOrderMirrorById(event.params.orderId);
    await markEventProcessed("syncAccountOrderToNotion", event.id, event.params.orderId);
  }
);

// When a customer creates an account after placing guest orders, associate
// those existing order-history records by normalized email. This does not
// create accounts or subscriptions and is safe to retry.
export const linkHistoricalOrdersToAccount = onDocumentWritten(
  { document: "accounts/{accountId}", region: "us-central1", retry: true },
  async (event) => {
    if (!event.data?.after.exists) return;
    await AccountService.linkOrdersToAccount(event.params.accountId);
  }
);

// Time-based eligibility check. Firestore write checks below make a newly due
// or edited subscription eligible immediately; this schedule catches passage
// of time without a database write.
export const checkDueSubscriptions = onSchedule(
  { schedule: "every 15 minutes", timeZone: "America/Los_Angeles", region: "us-central1" },
  () => AccountService.checkDueSubscriptions()
);

export const checkUpdatedSubscriptionForRenewal = onDocumentWritten(
  { document: "account_subscriptions/{subscriptionId}", region: "us-central1", retry: true },
  async (event) => {
    if (!event.data?.after.exists) return;
    if (await hasProcessedEvent("checkUpdatedSubscriptionForRenewal", event.id)) {
      logger.info("Skipping previously processed subscription-renewal event", { eventId: event.id });
      return;
    }
    const before = event.data.before.data();
    const after = event.data.after.data();
    // Ignore writes made solely by the fulfillment processor itself. Eligibility
    // must change before a database-write event starts another payment attempt.
    if (before && before.upcomingRoastDate === after?.upcomingRoastDate && before.status === after?.status && before.skipNextDelivery === after?.skipNextDelivery) return;
    await AccountService.checkDueSubscriptions(event.params.subscriptionId);
    await markEventProcessed("checkUpdatedSubscriptionForRenewal", event.id, event.params.subscriptionId);
  }
);

// Get shipping rates from EasyPost
app.post("/get-shipping-rates", getShippingRates);

// Purchase shipment with EasyPost
app.post("/purchase-shipment", async (req: Request, res: Response): Promise<void> => {
  try {
    logger.info('Purchase shipment request received', {
      step: 'endpoint_start',
      body: req.body
    });

    const { toAddress, rateId, shipmentId, fromAddress, parcel } = req.body;

    logger.info('Validating request parameters', {
      step: 'validate_params',
      hasToAddress: !!toAddress,
      hasRateId: !!rateId,
      hasShipmentId: !!shipmentId,
      hasFromAddress: !!fromAddress,
      hasParcel: !!parcel
    });

    if (!toAddress || !rateId) {
      logger.error('Missing required fields', {
        step: 'validation_error',
        toAddress: !!toAddress,
        rateId: !!rateId
      });
      res.status(400).json({ error: 'Missing required fields: toAddress, rateId' });
      return;
    }

    logger.info('Calling purchaseShipment function', {
      step: 'call_service',
      rateId,
      toCity: toAddress.city,
      hasShipmentId: !!shipmentId
    });

    const result = await purchaseShipment(toAddress, rateId, fromAddress, parcel, shipmentId);

    logger.info('Shipment purchased successfully, preparing response', {
      step: 'prepare_response',
      shipmentId: result.shipmentId,
      trackingNumber: result.trackingNumber,
      hasLabelUrl: !!result.labelUrl
    });

    // Use actual parcel dimensions as box size description
    let boxSize = '';
    if (parcel) {
      const { length, width, height } = parcel;
      boxSize = `${length}x${width}x${height}`;
      logger.info('Using parcel dimensions as box size', { boxSize });
    } else {
      logger.info('No parcel provided, cannot determine box size');
    }

    res.json({
      trackingNumber: result.trackingNumber,
      labelUrl: result.labelUrl,
      shipmentId: result.shipmentId,
      carrier: result.carrier,
      service: result.service,
      shippingPrice: result.shippingPrice,
      boxSize: boxSize,
    });

    logger.info('Response sent successfully', {
      step: 'endpoint_complete',
      shipmentId: result.shipmentId
    });
  } catch (error: unknown) {
    logger.error('Error purchasing shipment', {
      step: 'endpoint_error',
      error: (error as Error).message,
      stack: (error as Error).stack
    });
    res.status(500).json({ error: (error as Error).message });
  }
});

// Test endpoint for order status check (manual trigger)
app.post("/test-order-status-check", async (req: Request, res: Response) => NotionService.handleTestOrderStatus(req, res));

// Export as a separate function for direct access (matches documentation)
export const testOrderStatusCheck = onRequest(async (req: Request, res: Response) => {
  NotionService.handleTestOrderStatus(req, res);
});

// Scheduled function to check for order status updates and send notifications
// Runs every 60 minutes
const schedulerOptions: any = {
  schedule: "every 60 minutes",
  timeZone: "America/Los_Angeles",
};

// Only add secrets in production (not in emulator)
if (process.env.FUNCTIONS_EMULATOR !== "true") {
  schedulerOptions.secrets = [
    // Notion
    "NOTION_TOKEN",
    "NOTION_ONLINE_ORDERS_DATABASE_ID",
    "NOTION_INVENTORY_DATABASE_ID",
    "NOTION_DISCOUNT_CODES_DATABASE_ID",
    "NOTION_SUBSCRIPTIONS_DATABASE_ID",
    "NOTION_ALL_EVENTS_DATABASE_ID",
    "NOTION_ORDER_PICKUP_DATABASE_ID",
    "NOTION_CHURCH_AND_MINISTRY_DATABASE_ID",

    // EmailJS
    "EMAILJS_SERVICE_ID",
    "EMAILJS_PUBLIC_KEY",
    "EMAILJS_PRIVATE_KEY",
    "EMAILJS_SHIPPED_TEMPLATE_ID",
    "EMAILJS_OUT_FOR_DELIVERY_TEMPLATE_ID",
    "EMAILJS_DELIVERED_TEMPLATE_ID",
    "EMAILJS_READY_FOR_PICKUP_TEMPLATE_ID",
    "EMAILJS_PICKED_UP_TEMPLATE_ID",

    // EasyPost
    "EASYPOST_API_KEY",

    // Pictify
    "PICTIFY_API_KEY",
    "PICTIFY_RECEIPT_TEMPLATE_UID",
  ];
}

export const checkOrderStatusUpdates = onSchedule(
  schedulerOptions,
  EmailService.handleOrderStatusUpdates
);

// Scheduled function to keep inventory cache warm
// Runs every 15 minutes
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const syncInventoryCacheOptions: any = {
  schedule: "every 15 minutes",
  timeZone: "America/Los_Angeles",
};

// Only add secrets in production (not in emulator)
if (process.env.FUNCTIONS_EMULATOR !== "true") {
  syncInventoryCacheOptions.secrets = [
    "NOTION_TOKEN",
    "NOTION_INVENTORY_DATABASE_ID",
    "EASYPOST_API_KEY",
  ];
}

export const syncInventoryCache = onSchedule(
  syncInventoryCacheOptions,
  async () => {
    try {
      logger.info("Starting scheduled inventory cache sync");
      await syncInventoryToCache();
      logger.info("Scheduled inventory cache sync completed");
    } catch (error) {
      logger.error("Error syncing inventory cache:", error);
    }
  }
);

export const syncEventsCalendar = onSchedule(
  { schedule: "every day 03:00", timeZone: "America/Los_Angeles", region: "us-central1", secrets: ["NOTION_TOKEN", "NOTION_ALL_EVENTS_DATABASE_ID"] },
  async () => {
    try {
      logger.info("Starting scheduled events calendar sync");
      await refreshAllEventsCalendar();
      logger.info("Scheduled events calendar sync completed");
    } catch (error) {
      logger.error("Error syncing events calendar", { error: (error as Error).message });
    }
  }
);

// Export the Express app as a Firebase Functions v2 HTTP function
const apiOptions: any = {};
// Only add secrets in production (not in emulator)
if (process.env.FUNCTIONS_EMULATOR !== "true") {
  apiOptions.secrets = [
    "EASYPOST_API_KEY",
    "STRIPE_SECRET_KEY",
    "NOTION_TOKEN",
    "NOTION_ONLINE_ORDERS_DATABASE_ID",
    "NOTION_INVENTORY_DATABASE_ID",
    "NOTION_DISCOUNT_CODES_DATABASE_ID",
    "NOTION_SUBSCRIPTIONS_DATABASE_ID",
    "NOTION_ORDER_PICKUP_DATABASE_ID",
    "NOTION_ALL_EVENTS_DATABASE_ID",
    "PICTIFY_API_KEY",
    "PICTIFY_RECEIPT_TEMPLATE_UID"
  ];
}
export const api = onRequest(apiOptions, app);
