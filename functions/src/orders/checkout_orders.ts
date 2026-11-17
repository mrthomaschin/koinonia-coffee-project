import { randomInt } from "crypto";
import { getDatabase } from "../integrations/firebase_admin";
import { getStripeClient } from "../integrations/stripe/stripe_client";
import { getEasyPostClient } from "../integrations/easypost/easypost_client";
import { AccountAdmin, activateSubscriptionCheckout } from "../services/account_service";
import { createLogger } from "../logger";
import { newPaidOrderStatus } from "./order_model";
import type { CheckoutQuote, DeliveryInput } from "../services/checkout_pricing";

/**
 * Web checkout orders, created on the server from the paid Stripe payment.
 *
 * 1. /checkout/quote saves everything about the checkout at checkouts/{paymentIntentId}:
 *    the server's priced quote, delivery choice, and the customer's contact and
 *    address details. It also assigns the order number.
 * 2. When the payment succeeds, recordPaidCheckout writes orders/{orderId}. The
 *    browser asks for this right after paying (/checkout/complete), and a
 *    scheduled sweep catches payments whose browser never did.
 * 3. A trigger on the new order buys the label, creates the Notion page, attaches
 *    the receipt and sends the emails (checkout_fulfillment.ts).
 *
 * Subscription carts keep their own flow (account_service).
 */
const logger = createLogger("checkout_orders");

const CHECKOUTS = "checkouts";

export interface CheckoutDetails {
  customerName: string;
  email: string;
  phone: string | null;
  shippingAddress: string | null;
  billingAddress: string | null;
  orderPickupId: string | null;
}

export interface StoredCheckout {
  paymentIntentId: string;
  orderId: string;
  // "activating": a subscription cart is being set up (see activateSubscriptionCart).
  status: "quoted" | "activating" | "ordered";
  accountId: string | null;
  details: CheckoutDetails;
  delivery: DeliveryInput;
  quote: Pick<CheckoutQuote, "lines" | "subtotal" | "discount" | "shipping" | "tax" | "total" | "cartHash">;
  hasSubscription: boolean;
  quotedAt: string;
  orderedAt: string | null;
}

// No 0/O, 1/I: order numbers get read aloud and typed from emails.
const ORDER_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const newOrderId = async (): Promise<string> => {
  const db = getDatabase();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const id = Array.from({ length: 8 }, () => ORDER_ALPHABET[randomInt(ORDER_ALPHABET.length)]).join("");
    if (!(await db.collection("orders").doc(id).get()).exists) return id;
  }
  throw new Error("Couldn't assign an order number");
};

const clean = (value: unknown, max = 500): string | null => {
  const text = typeof value === "string" ? value.trim().slice(0, max) : "";
  return text || null;
};

/** Reads the contact and address fields the browser sends with the quote. */
export const parseCheckoutDetails = (body: any, email: string | null): CheckoutDetails | null => {
  const customerName = clean(body?.customer?.name, 120);
  const normalizedEmail = clean(email, 254);
  if (!customerName || !normalizedEmail) return null;
  return {
    customerName,
    email: normalizedEmail,
    phone: clean(body?.customer?.phone, 40),
    shippingAddress: clean(body?.shippingAddress),
    billingAddress: clean(body?.billingAddress),
    orderPickupId: clean(body?.orderPickupId, 120),
  };
};

/**
 * Saves the checkout as quoted; returns its order number. Re-quoting the same
 * payment keeps the number, so the customer only ever sees one.
 */
export const saveQuotedCheckout = async (input: {
  paymentIntentId: string;
  accountId: string | null;
  details: CheckoutDetails;
  delivery: DeliveryInput;
  quote: CheckoutQuote;
}): Promise<string> => {
  const ref = getDatabase().collection(CHECKOUTS).doc(input.paymentIntentId);
  const existing = (await ref.get()).data() as StoredCheckout | undefined;
  if (existing?.status === "ordered") return existing.orderId;
  const orderId = existing?.orderId || (await newOrderId());
  const checkout: StoredCheckout = {
    paymentIntentId: input.paymentIntentId,
    orderId,
    status: "quoted",
    accountId: input.accountId,
    details: input.details,
    delivery: input.delivery,
    quote: {
      lines: input.quote.lines,
      subtotal: input.quote.subtotal,
      discount: input.quote.discount,
      shipping: input.quote.shipping,
      tax: input.quote.tax,
      total: input.quote.total,
      cartHash: input.quote.cartHash,
    },
    hasSubscription: input.quote.lines.some((line) => line.subscriptionPlan),
    quotedAt: new Date().toISOString(),
    orderedAt: null,
  };
  await ref.set(JSON.parse(JSON.stringify(checkout)));
  return orderId;
};

// ---- Line display details from the inventory cache ----

interface LineDisplay {
  variations: string;
  weight: string;
  // Grams, as the inventory stores it; renewals size their parcel from it.
  shippingWeight: number | null;
  image: string | null;
  internalQuantity: number;
}

const describeLines = async (lines: StoredCheckout["quote"]["lines"]): Promise<LineDisplay[]> => {
  const cached = (await getDatabase().collection("inventory_cache").doc("latest").get()).data();
  const items: any[] = Array.isArray(cached?.items) ? cached!.items : [];
  const same = (a: unknown, b: string) => typeof a === "string" && a.trim().toUpperCase() === b.toUpperCase();
  return lines.map((line) => {
    const item = items.find((candidate) =>
      same(candidate?.sku, line.sku) || candidate?.variants?.some((variant: any) => same(variant?.sku, line.sku)));
    const variant = item?.variants?.find((candidate: any) => same(candidate?.sku, line.sku));
    const variations = [variant?.weight, variant?.size, variant?.color].filter(Boolean).join(", ");
    // Wholesale coffee is counted in pounds for stock, e.g. 2 × 5lb = 10.
    const pounds = Number.parseFloat(variant?.weight || "");
    const internalQuantity = line.sku.toUpperCase().endsWith("-WS") && item?.itemType === "Coffee" &&
      Number.isFinite(pounds) && pounds > 0 ? pounds * line.quantity : line.quantity;
    const shippingWeight = Number(variant?.shippingWeight ?? item?.shippingWeight);
    return {
      variations,
      weight: variant?.weight || "",
      shippingWeight: Number.isFinite(shippingWeight) && shippingWeight > 0 ? shippingWeight : null,
      image: item?.firebaseImageUrls?.[0] || null,
      internalQuantity,
    };
  });
};

/** Whether this email has any earlier order, for the "first order" flag. */
const isFirstOrder = async (emailNormalized: string, orderId: string): Promise<boolean> => {
  const snapshot = await getDatabase().collection("orders")
    .where("emailNormalized", "==", emailNormalized).limit(2).get();
  return snapshot.docs.every((doc) => doc.id === orderId);
};

const cents = (value: number) => Math.round(value) / 100;

/**
 * Creates the order for a succeeded payment. Safe to call any number of
 * times, from any caller: the first creates it, the rest return the same
 * order number. Null when there's nothing to record yet (not paid, or an
 * unknown checkout). Subscription carts also set up their subscriptions.
 */
export const recordPaidCheckout = async (paymentIntentId: string): Promise<{ orderId: string; created: boolean } | null> => {
  const db = getDatabase();
  const checkoutRef = db.collection(CHECKOUTS).doc(paymentIntentId);
  const checkout = (await checkoutRef.get()).data() as StoredCheckout | undefined;
  if (!checkout) return null;
  if (checkout.status === "ordered") return { orderId: checkout.orderId, created: false };

  const paymentIntent = await getStripeClient().paymentIntents.retrieve(paymentIntentId);
  if (paymentIntent.status !== "succeeded") return null;
  if (paymentIntent.metadata.cartHash && paymentIntent.metadata.cartHash !== checkout.quote.cartHash) {
    // The payment was re-quoted with a different cart after this was saved; the newer quote wins.
    logger.warn("Paid cart differs from the saved checkout", { paymentIntentId });
  }

  const { details, quote } = checkout;
  const display = await describeLines(quote.lines);
  const emailNormalized = details.email.toLowerCase();
  const isPickup = checkout.delivery.method === "pickup";
  const items = quote.lines.map((line, index) => ({
    name: line.name,
    sku: line.sku,
    quantity: line.quantity,
    internalQuantity: display[index].internalQuantity,
    price: line.unitPrice,
    // weight is what subscription orders and renewals read; variations is for display.
    selections: display[index].variations
      ? { variations: display[index].variations, ...(display[index].weight ? { weight: display[index].weight } : {}) }
      : {},
    ...(display[index].image ? { image: display[index].image } : {}),
    ...(line.subscriptionPlan ? { subscriptionPlan: line.subscriptionPlan } : {}),
  }));
  const now = new Date().toISOString();
  const order = {
    id: checkout.orderId,
    origin: "firestore",
    source: "web-checkout",
    ...(checkout.accountId ? { accountId: checkout.accountId } : {}),
    seq: null,
    customerName: details.customerName,
    email: details.email,
    emailNormalized,
    phone: details.phone,
    createdAt: new Date(paymentIntent.created * 1000).toISOString(),
    status: "completed",
    ...newPaidOrderStatus(),
    totalAmount: cents(paymentIntent.amount_received || quote.total),
    subtotal: cents(quote.subtotal),
    discountCode: quote.discount?.code || null,
    discountPercent: quote.discount?.percentOff ?? null,
    discountAmount: cents(quote.discount?.amount || 0),
    shippingCharged: cents(quote.shipping),
    taxAmount: cents(quote.tax),
    shippingLabelPrice: null,
    firstTimer: await isFirstOrder(emailNormalized, checkout.orderId),
    items,
    itemsSummary: items.map((item, index) =>
      `${item.quantity}x ${item.name}${display[index].variations ? ` (${display[index].variations})` : ""}`).join("\n"),
    isLocalPickup: isPickup,
    orderPickupId: isPickup ? details.orderPickupId : null,
    shippingAddress: isPickup ? null : details.shippingAddress,
    billingAddress: details.billingAddress,
    shippingBox: null,
    shipmentId: checkout.delivery.method === "shipping" ? checkout.delivery.shipmentId : null,
    shippingRateId: checkout.delivery.method === "shipping" ? checkout.delivery.rateId : null,
    trackingNumber: null,
    trackingCarrier: null,
    shippingService: null,
    trackingLabelUrl: null,
    paymentIntentId,
    receiptUrl: `https://dashboard.stripe.com/payments/${paymentIntentId}`,
    notion: null,
    fulfillment: {},
    updatedAt: now,
  };

  if (checkout.hasSubscription && checkout.accountId) {
    return activateSubscriptionCart(checkout, paymentIntent, order, display);
  }
  if (checkout.hasSubscription) {
    // Subscriptions need an account; record the purchase and flag it for staff.
    logger.error("Subscription cart paid without an account", { paymentIntentId });
    (order as Record<string, unknown>).fulfillment = { lastError: "Paid for a subscription without an account; no subscription was created. Set it up with the customer." };
  }

  // The checkout's status is the lock: only the first caller creates the order.
  const created = await db.runTransaction(async (transaction) => {
    const fresh = (await transaction.get(checkoutRef)).data() as StoredCheckout | undefined;
    if (!fresh || fresh.status !== "quoted") return false;
    transaction.create(db.collection("orders").doc(checkout.orderId), order);
    transaction.update(checkoutRef, { status: "ordered", orderedAt: now });
    return true;
  });
  if (created) logger.info("Web checkout order created", { orderId: checkout.orderId, paymentIntentId });
  return { orderId: checkout.orderId, created };
};

/**
 * A paid subscription cart: creates the subscriptions, the order and the
 * saved card and address through account_service, then hands the order to
 * the same server fulfillment as other web orders (serverFulfilled).
 */
const activateSubscriptionCart = async (
  checkout: StoredCheckout,
  paymentIntent: Awaited<ReturnType<ReturnType<typeof getStripeClient>["paymentIntents"]["retrieve"]>>,
  order: Record<string, any>,
  display: LineDisplay[],
): Promise<{ orderId: string; created: boolean } | null> => {
  const db = getDatabase();
  const checkoutRef = db.collection(CHECKOUTS).doc(checkout.paymentIntentId);
  // Claim the checkout so the browser and the sweep can't both set it up.
  const now = new Date().toISOString();
  const claimed = await db.runTransaction(async (transaction) => {
    const fresh = (await transaction.get(checkoutRef)).data() as (StoredCheckout & { activatingAt?: string }) | undefined;
    if (!fresh || fresh.status === "ordered") return false;
    if (fresh.status === "activating" && Date.now() - Date.parse(fresh.activatingAt || "") < 5 * 60 * 1000) return false;
    transaction.update(checkoutRef, { status: "activating", activatingAt: now });
    return true;
  });
  if (!claimed) return { orderId: checkout.orderId, created: false };

  try {
    const account = await AccountAdmin.profile(checkout.accountId!);
    if (!account) throw new Error("The account for this subscription no longer exists");
    const { details, quote, delivery } = checkout;
    let shippingAddressData = null;
    if (delivery.method === "shipping") {
      // Renewals ship to this structured address; it's the one the label was quoted for.
      const shipment: any = await getEasyPostClient().Shipment.retrieve(delivery.shipmentId);
      const to = shipment.to_address || {};
      shippingAddressData = to.street1 ? {
        line1: to.street1, line2: to.street2 || "", city: to.city, state: to.state,
        postal_code: to.zip, country: to.country || "US",
      } : null;
    }
    const subscribed = quote.lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => line.subscriptionPlan)
      .map(({ line, index }) => ({
        plan: line.subscriptionPlan,
        itemSku: line.sku,
        itemName: line.name,
        weight: display[index].weight || display[index].variations,
        ...(display[index].shippingWeight ? { shippingWeight: display[index].shippingWeight } : {}),
      }));
    const { id: _id, source: _source, accountId: _accountId, status: _status, ...orderFields } = order;
    void _id; void _source; void _accountId; void _status;
    const result = await activateSubscriptionCheckout({
      account,
      paymentIntent,
      paymentIntentId: checkout.paymentIntentId,
      requestedOrderId: checkout.orderId,
      customerPhone: details.phone || "",
      items: subscribed,
      orderItems: order.items,
      shippingAddress: details.shippingAddress || "",
      shippingAddressData,
      isLocalPickup: delivery.method === "pickup",
      orderPickupId: details.orderPickupId || "",
      shippingAmount: quote.shipping / 100,
      submittedShipment: null,
      // Everything the server fulfillment reads, plus the flag that hands it the order.
      orderFields: { ...orderFields, serverFulfilled: true },
    });
    await checkoutRef.update({ status: "ordered", orderedAt: new Date().toISOString() });
    if (result.created) logger.info("Subscription checkout activated", { orderId: result.orderId, subscriptions: result.subscriptionIds.length });
    return { orderId: result.orderId || checkout.orderId, created: result.created };
  } catch (error) {
    // Back to quoted, so the next call (or the sweep) tries again.
    await checkoutRef.update({ status: "quoted", lastError: (error as Error).message });
    throw error;
  }
};

/** Paid checkouts from the last few days that never became orders. */
export const sweepPaidCheckouts = async (): Promise<number> => {
  const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const snapshot = await getDatabase().collection(CHECKOUTS)
    // "activating" too: a subscription setup that crashed midway is retried.
    .where("status", "in", ["quoted", "activating"])
    .where("quotedAt", ">=", since)
    .get();
  let recorded = 0;
  for (const doc of snapshot.docs) {
    // Give the customer's browser time to finish first.
    if (Date.now() - Date.parse((doc.data() as StoredCheckout).quotedAt) < 2 * 60 * 1000) continue;
    try {
      const result = await recordPaidCheckout(doc.id);
      if (result?.created) {
        recorded += 1;
        logger.warn("Recovered a paid checkout the browser didn't complete", { orderId: result.orderId });
      }
    } catch (error) {
      logger.error("Couldn't record paid checkout", { paymentIntentId: doc.id, error: (error as Error).message });
    }
  }
  return recorded;
};
