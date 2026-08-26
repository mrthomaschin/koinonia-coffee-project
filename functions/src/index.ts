import { setGlobalOptions } from "firebase-functions/v2";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onRequest } from "firebase-functions/v2/https";
import { createLogger } from "./logger";
import express, { Request, Response } from "express";
import cors from "cors";
import * as dotenv from "dotenv";
import { initializeApp, getApps, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { NotionService } from "./services/notion_services";
import { EmailService } from "./services/email_service";
import { StripeService } from "./services/stripe_services";
import { getShippingRates, purchaseShipment } from "./services/easypost_service";
import { AccountService } from "./services/account_service";

// Load .env.local for development (emulator only)
// Production uses Firebase secrets, not .env files
dotenv.config({ path: ".env.local" });

const logger = createLogger('index');

setGlobalOptions({ maxInstances: 10 });

// Updated secrets: 2026-07-07

// Firestore cache setup
let firestoreDb: FirebaseFirestore.Firestore | null = null;
const getFirestoreDb = () => {
  if (!firestoreDb) {
    if (!getApps().length) {
      initializeApp({
        credential: applicationDefault()
      });
    }
    firestoreDb = getFirestore();
  }
  return firestoreDb;
};

const INVENTORY_CACHE_DOC = "inventory_cache/latest";
const INVENTORY_CACHE_TTL_MS = 5 * 60 * 1000; // Reduced to 5 minutes to prevent stale data

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

// Account data lives in Notion; Firestore holds only short-lived sessions and caches.
app.post("/account/login", AccountService.login);
app.post("/account/create", AccountService.createAccount);
app.get("/account/orders", AccountService.getOrders);
app.get("/account/subscriptions", AccountService.getSubscriptions);
app.post("/account/subscriptions", AccountService.createSubscription);
app.post("/account/subscriptions/:subscriptionId/cancel", AccountService.cancelSubscription);
app.post("/account/subscriptions/:subscriptionId/skip", AccountService.skipSubscription);
app.post("/account/logout", AccountService.logout);

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
    "NOTION_TOKEN",
    "NOTION_ONLINE_ORDERS_DATABASE_ID",
    "EMAILJS_SERVICE_ID",
    "EMAILJS_PUBLIC_KEY",
    "EMAILJS_PRIVATE_KEY",
    "EMAILJS_SHIPPED_TEMPLATE_ID",
    "EMAILJS_OUT_FOR_DELIVERY_TEMPLATE_ID",
    "EMAILJS_DELIVERED_TEMPLATE_ID",
    "EASYPOST_API_KEY",
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
    "NOTION_ACCOUNTS_DATABASE_ID",
    "NOTION_SUBSCRIPTIONS_DATABASE_ID"
  ];
}
export const api = onRequest(apiOptions, app);
