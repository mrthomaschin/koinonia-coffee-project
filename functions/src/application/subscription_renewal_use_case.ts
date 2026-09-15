import Stripe from "stripe";
import { FieldValue, Firestore } from "firebase-admin/firestore";
import { createLogger } from "../logger";
import { Address, fetchShippingRates, purchaseShipment } from "../services/easypost_service";
import { EmailService } from "../services/email_service";
import { RecurringOrderService, SubscriptionService } from "../services/subscription_domain";
import { RenewalAttemptRepository } from "../services/renewal_attempt_repository";
import { getStripeClient } from "../integrations/stripe/stripe_client";
import { createRenewalOrderProjection } from "../repositories/notion_order_repository";
import { isRoastDateDue } from "../domain/dates/calendar_dates";
import { subscriptionParcel } from "../domain/shipping/parcel_rules";
import { weightInPounds } from "../domain/shipping/weight";

const logger = createLogger("subscription-renewal");

interface RenewalSubscription {
  id: string;
  accountId: string;
  status: string;
  skipNextDelivery: boolean;
  upcomingRoastDate: string;
  cadence: "every-session" | "every-other-session";
  unitAmount: number;
  bagCount: number;
  itemName: string;
  itemSku: string;
  weight: string;
  discountPercent: number;
  freeShipping: boolean;
  isLocalPickup?: boolean;
  orderPickupId?: string;
  addOnWeight?: number;
  addOnUnitAmount?: number;
}

interface RenewalAccount {
  id: string;
  user: { firstName: string; lastName: string; email: string };
  label: string;
  phone?: string;
  billing?: { stripeCustomerId?: string; stripePaymentMethodId?: string };
  shippingAddressData?: {
    line1: string; line2: string; city: string; state: string; postal_code: string; country: string;
  };
  shippingAddress?: string;
}

const formatBillingAddress = (address?: {
  line1?: string | null; line2?: string | null; city?: string | null;
  state?: string | null; postal_code?: string | null; country?: string | null;
} | null): string => address ? [
  address.line1,
  address.line2,
  [address.city, address.state, address.postal_code].filter(Boolean).join(", "),
  address.country,
].filter(Boolean).join(", ") : "";

/** Executes one claimed subscription renewal without changing its workflow. */
export class SubscriptionRenewalUseCase {
  constructor(private readonly db: Firestore) {}

  async execute(subscriptionId: string): Promise<void> {
    const stripe = getStripeClient();
    const subscriptionRef = this.db.collection("account_subscriptions").doc(subscriptionId);
    const renewalClaimRef = this.db.collection("subscription_renewal_claims").doc(subscriptionId);
    const now = new Date();
    const subscription = await new RenewalAttemptRepository(this.db)
      .acquire<RenewalSubscription>(subscriptionRef, renewalClaimRef, now,
        (date) => isRoastDateDue(date, now));
    if (!subscription) return;

    try {
      const calendar = await import("../services/account_service.js");
      const nextRoastDate = await calendar.nextRoastSessionDate(
        subscription.upcomingRoastDate, subscription.cadence);
      if (!nextRoastDate) throw new Error("No later roast date is available in the Notion calendar");
      const accountSnapshot = await this.db.collection("accounts").doc(subscription.accountId).get();
      const account = accountSnapshot.data() as RenewalAccount | undefined;
      const customerId = account?.billing?.stripeCustomerId;
      const paymentMethodId = account?.billing?.stripePaymentMethodId;
      const shippingAddress = account?.shippingAddressData;
      if (!account || !customerId || !paymentMethodId) throw new Error("Subscription is missing a saved payment method");
      if (!subscription.isLocalPickup && !shippingAddress) throw new Error("Subscription is missing a saved shipping address");
      if (!Number.isSafeInteger(subscription.unitAmount) || subscription.unitAmount < 50) throw new Error("Subscription is missing a valid renewal price");

      const savedPaymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
      const billingAddress = formatBillingAddress(savedPaymentMethod.billing_details.address);
      const stripeCustomer = !account.phone ? await stripe.customers.retrieve(customerId) : null;
      const recoveredPhone = stripeCustomer && !stripeCustomer.deleted ? stripeCustomer.phone || undefined : undefined;
      const renewalAccount = recoveredPhone ? { ...account, phone: recoveredPhone } : account;
      if (recoveredPhone) await accountSnapshot.ref.set({ phone: recoveredPhone, updatedAt: Date.now() }, { merge: true });

      const addOnWeight = subscription.addOnWeight || 0;
      const discountPercent = account.label === "consumer" ? subscription.discountPercent : 0;
      const freeShipping = account.label === "wholesale" ? false : subscription.freeShipping;
      const productAmount = subscription.unitAmount * subscription.bagCount + (subscription.addOnUnitAmount || 0);
      const totalWeight = weightInPounds(subscription.weight) + addOnWeight;
      const parcel = subscriptionParcel(totalWeight * 453.592, `${totalWeight}lb`, 1);
      const address: Address | null = shippingAddress ? {
        street1: shippingAddress.line1, street2: shippingAddress.line2,
        city: shippingAddress.city, state: shippingAddress.state,
        zip: shippingAddress.postal_code, country: shippingAddress.country,
        name: `${renewalAccount.user.firstName} ${renewalAccount.user.lastName}`,
        email: renewalAccount.user.email, phone: renewalAccount.phone,
      } : null;
      const shippingQuote = address ? await fetchShippingRates(address, undefined, parcel) : null;
      if (shippingQuote && !shippingQuote.rates.length) throw new Error("No shipping rates are available for this subscription order");
      const selectedRate = shippingQuote?.rates.reduce((lowest, rate) => rate.rate < lowest.rate ? rate : lowest);
      const shippingAmount = selectedRate && !subscription.isLocalPickup && !freeShipping ? Math.round(selectedRate.rate * 100) : 0;
      const dueRoastDate = SubscriptionService.roastDateKey(subscription.upcomingRoastDate);
      const dueKey = `${subscription.id}:${dueRoastDate}`;
      const generatedOrderId = Date.now().toString().slice(-8).toUpperCase();
      const paymentIntent = await stripe.paymentIntents.create({
        amount: productAmount + shippingAmount, currency: "usd", customer: customerId,
        payment_method: paymentMethodId, off_session: true, confirm: true,
        metadata: { accountId: subscription.accountId, subscriptionId: subscription.id, dueRoastDate, orderNumber: generatedOrderId },
        description: `Koinonia roast subscription: ${subscription.itemName}`,
      }, { idempotencyKey: `renewal:${dueKey}` });
      const orderId = paymentIntent.metadata.orderNumber || generatedOrderId;
      const shipment = address && selectedRate && shippingQuote
        ? await purchaseShipment(address, selectedRate.id, undefined, parcel, shippingQuote.shipmentId) : undefined;
      await createRenewalOrderProjection({ orderId, paymentIntentId: paymentIntent.id, account: renewalAccount, subscription,
        totalAmount: paymentIntent.amount_received / 100, shippingAmount: shippingAmount / 100,
        shippingAddress: account.shippingAddress || "", billingAddress,
        shippingLabelPrice: shipment?.shippingPrice || selectedRate?.rate || 0,
        shippingBox: parcel.boxSize, shipment });
      const customerName = `${account.user.firstName} ${account.user.lastName}`.trim();
      await Promise.all([
        EmailService.sendSubscriptionOrderConfirmation({ toEmail: account.user.email, customerName, orderId,
          itemName: `${subscription.itemName} (${subscription.weight})`, quantity: subscription.bagCount,
          totalAmount: paymentIntent.amount_received / 100, shippingAmount: shippingAmount / 100 }),
        EmailService.sendSubscriptionPurchaseNotification({ customerEmail: account.user.email, customerName, orderId,
          itemName: `${subscription.itemName} (${subscription.weight})`, quantity: subscription.bagCount,
          unitAmount: subscription.unitAmount / 100, totalAmount: paymentIntent.amount_received / 100,
          shippingAddress: subscription.isLocalPickup ? "Not applicable - Local pickup" : account.shippingAddress || "N/A",
          billingAddress: billingAddress || "N/A", deliveryMethod: subscription.isLocalPickup ? "Local Pickup" : "Shipping" }),
      ]);
      const recurringItems = RecurringOrderService.items(subscription);
      await this.db.batch()
        .set(this.db.collection("orders").doc(orderId), { id: orderId, accountId: subscription.accountId,
          customerName: `${renewalAccount.user.firstName} ${renewalAccount.user.lastName}`.trim(), email: renewalAccount.user.email,
          emailNormalized: renewalAccount.user.email.toLowerCase(), phone: renewalAccount.phone || null,
          totalAmount: paymentIntent.amount_received / 100, createdAt: new Date().toISOString(), status: "completed",
          paymentIntentId: paymentIntent.id, subscriptionId: subscription.id, source: "subscription-renewal", items: recurringItems,
          itemsSummary: RecurringOrderService.summary(subscription), shippingAddress: subscription.isLocalPickup ? "" : account.shippingAddress || "",
          shippingCharged: shippingAmount / 100, shippingLabelPrice: shipment?.shippingPrice || selectedRate?.rate || 0,
          shippingBox: parcel.boxSize, ...(shipment ? { shipmentId: shipment.shipmentId, trackingNumber: shipment.trackingNumber,
            trackingLabelUrl: shipment.labelUrl, shippingCarrier: shipment.carrier || null, shippingService: shipment.service || null } : {}),
          isLocalPickup: !!subscription.isLocalPickup, orderPickupId: subscription.orderPickupId || undefined })
        .update(subscriptionRef, { upcomingRoastDate: nextRoastDate, lastRenewalPaymentIntentId: paymentIntent.id,
          lastRenewedAt: new Date().toISOString(), discountPercent, freeShipping,
          addOnWeight: FieldValue.delete(), addOnUnitAmount: FieldValue.delete() })
        .set(renewalClaimRef, { status: "completed", completedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, { merge: true })
        .commit();
      logger.info("Subscription renewal payment succeeded", { subscriptionId, paymentIntentId: paymentIntent.id, orderId });
    } catch (error: unknown) {
      const stripeError = error as Stripe.StripeRawError;
      const update: Record<string, unknown> = { lastRenewalError: stripeError.message || "Unknown renewal error" };
      if (stripeError.type === "card_error") update.status = "paused";
      await Promise.all([
        subscriptionRef.update(update),
        renewalClaimRef.set({ status: "failed", processingUntil: now.getTime() + 5 * 60 * 1000,
          updatedAt: new Date().toISOString(), lastError: update.lastRenewalError }, { merge: true }),
      ]);
      logger.error("Subscription renewal failed", { subscriptionId, error: stripeError.message });
    }
  }
}
