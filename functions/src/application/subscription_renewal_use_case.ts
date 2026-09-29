import Stripe from "stripe";
import { DocumentReference, FieldValue, Firestore } from "firebase-admin/firestore";
import { createLogger } from "../logger";
import { Address, fetchShippingRates } from "../services/easypost_service";
import { RecurringOrderService, SubscriptionService } from "../services/subscription_domain";
import { RenewalAttemptRepository } from "../services/renewal_attempt_repository";
import { getStripeClient } from "../integrations/stripe/stripe_client";
import { subscriptionParcel } from "../domain/shipping/parcel_rules";
import { weightInPounds } from "../domain/shipping/weight";
import { RenewalOrder, RenewalQuote, RenewalShippingQuote } from "../domain/subscriptions/renewal_order";

const logger = createLogger("subscription-renewal");

const RETRY_AFTER_FAILURE_MS = 5 * 60 * 1000;

interface RenewalSubscription {
  id: string;
  accountId: string;
  status: string;
  skippedRoastDate?: string;
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

/** An account that has everything an off-session renewal charge needs. */
type ChargeableAccount = RenewalAccount & { billing: { stripeCustomerId: string; stripePaymentMethodId: string } };

const formatBillingAddress = (address?: {
  line1?: string | null; line2?: string | null; city?: string | null;
  state?: string | null; postal_code?: string | null; country?: string | null;
} | null): string => address ? [
  address.line1,
  address.line2,
  [address.city, address.state, address.postal_code].filter(Boolean).join(", "),
  address.country,
].filter(Boolean).join(", ") : "";

const customerName = (account: RenewalAccount): string =>
  `${account.user.firstName} ${account.user.lastName}`.trim();

/**
 * Processes one due subscription: advances past a skipped roast, or charges it.
 *
 * Charging is split so a retry can never charge twice:
 *   1. quote   – priced once per roast and saved on the renewal claim
 *   2. payment – one PaymentIntent per roast, saved on the claim before confirming
 *   3. order   – orders/{orderId} written with the subscription advance, atomically
 * Label purchase, Notion, receipt, and emails run afterwards from the order
 * (RenewalFulfillmentUseCase), outside the payment path.
 */
export class SubscriptionRenewalUseCase {
  constructor(private readonly db: Firestore) {}

  async execute(subscriptionId: string): Promise<void> {
    const subscriptionRef = this.db.collection("account_subscriptions").doc(subscriptionId);
    const now = new Date();
    const current = (await subscriptionRef.get()).data() as RenewalSubscription | undefined;
    if (current && SubscriptionService.dueAction(current, now) === "advance-skipped") {
      await this.advanceSkipped(subscriptionRef, current, now);
      return;
    }
    await this.charge(subscriptionRef, now);
  }

  /** Moves past a roast the customer skipped, without charging for it. */
  private async advanceSkipped(subscriptionRef: DocumentReference, subscription: RenewalSubscription, now: Date): Promise<void> {
    const skippedRoastDate = SubscriptionService.roastDateKey(subscription.upcomingRoastDate);
    const calendar = await import("../services/account_service.js");
    const nextRoastDate = await calendar.nextRoastSessionDate(subscription.upcomingRoastDate, subscription.cadence);
    if (!nextRoastDate) {
      logger.error("Unable to advance skipped subscription: no later roast date in the Notion calendar", { subscriptionId: subscription.id, skippedRoastDate });
      return;
    }
    const advanced = await new RenewalAttemptRepository(this.db).advanceSkipped(subscriptionRef, skippedRoastDate, nextRoastDate, now);
    logger.info(advanced ? "Skipped subscription roast advanced" : "Skipped subscription changed before advancing; no action taken",
      { subscriptionId: subscription.id, skippedRoastDate, nextRoastDate });
  }

  private async charge(subscriptionRef: DocumentReference, now: Date): Promise<void> {
    const claims = new RenewalAttemptRepository(this.db);
    const claimRef = this.db.collection("subscription_renewal_claims").doc(subscriptionRef.id);
    const attempt = await claims.acquire<RenewalSubscription, RenewalQuote>(subscriptionRef, claimRef, now);
    if (!attempt) return;
    const { subscription, claim } = attempt;
    const roastDate = SubscriptionService.roastDateKey(subscription.upcomingRoastDate);

    try {
      const calendar = await import("../services/account_service.js");
      const nextRoastDate = await calendar.nextRoastSessionDate(subscription.upcomingRoastDate, subscription.cadence);
      if (!nextRoastDate) throw new Error("No later roast date is available in the Notion calendar");
      const account = await this.chargeableAccount(subscription);

      const quote = claim.quote || await this.createQuote(subscription, account, roastDate);
      if (!claim.quote) await claims.recordQuote(claimRef, quote);

      const paymentIntent = await this.collectPayment(claims, claimRef, claim.paymentIntentId, subscription, account, quote, roastDate);
      if (paymentIntent.status !== "succeeded") throw new Error(`Renewal payment is ${paymentIntent.status}`);

      const order = this.renewalOrder(subscription, account, quote, paymentIntent, roastDate);
      await this.db.batch()
        .create(this.db.collection("orders").doc(order.id), order)
        .update(subscriptionRef, {
          upcomingRoastDate: nextRoastDate, lastRenewalPaymentIntentId: paymentIntent.id, lastRenewedAt: new Date().toISOString(),
          discountPercent: quote.discountPercent, freeShipping: quote.freeShipping,
          addOnWeight: FieldValue.delete(), addOnUnitAmount: FieldValue.delete(), lastRenewalError: FieldValue.delete(),
        })
        .set(claimRef, { status: "completed", orderId: order.id, completedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, { merge: true })
        .commit();
      logger.info("Subscription renewal payment succeeded", { subscriptionId: subscription.id, paymentIntentId: paymentIntent.id, orderId: order.id });
    } catch (error: unknown) {
      const message = (error as Error).message || "Unknown renewal error";
      const update: Record<string, unknown> = { lastRenewalError: message };
      // A declined card pauses the subscription instead of retrying the same card every few minutes.
      if (error instanceof Stripe.errors.StripeCardError) update.status = "paused";
      await Promise.all([subscriptionRef.update(update), claims.recordFailure(claimRef, message, RETRY_AFTER_FAILURE_MS)]);
      logger.error("Subscription renewal failed", { subscriptionId: subscription.id, roastDate, error: message });
    }
  }

  private async chargeableAccount(subscription: RenewalSubscription): Promise<ChargeableAccount> {
    const account = (await this.db.collection("accounts").doc(subscription.accountId).get()).data() as RenewalAccount | undefined;
    if (!account?.billing?.stripeCustomerId || !account.billing.stripePaymentMethodId) throw new Error("Subscription is missing a saved payment method");
    if (!subscription.isLocalPickup && !account.shippingAddressData) throw new Error("Subscription is missing a saved shipping address");
    if (!Number.isSafeInteger(subscription.unitAmount) || subscription.unitAmount < 50) throw new Error("Subscription is missing a valid renewal price");
    return account as ChargeableAccount;
  }

  /** Prices one roast: products, add-ons, and the cheapest shipping rate. */
  private async createQuote(subscription: RenewalSubscription, account: ChargeableAccount, roastDate: string): Promise<RenewalQuote> {
    const stripe = getStripeClient();
    const savedPaymentMethod = await stripe.paymentMethods.retrieve(account.billing.stripePaymentMethodId);
    if (!account.phone) {
      const stripeCustomer = await stripe.customers.retrieve(account.billing.stripeCustomerId);
      const recoveredPhone = !stripeCustomer.deleted ? stripeCustomer.phone || undefined : undefined;
      if (recoveredPhone) {
        account.phone = recoveredPhone;
        await this.db.collection("accounts").doc(account.id).set({ phone: recoveredPhone, updatedAt: Date.now() }, { merge: true });
      }
    }

    const discountPercent = account.label === "consumer" ? subscription.discountPercent : 0;
    const freeShipping = account.label === "wholesale" ? false : subscription.freeShipping;
    const productAmount = subscription.unitAmount * subscription.bagCount + (subscription.addOnUnitAmount || 0);
    const shipping = subscription.isLocalPickup ? null : await this.quoteShipping(subscription, account);
    const shippingAmount = shipping && !freeShipping ? Math.round(shipping.estimatedLabelPrice * 100) : 0;
    return {
      orderId: SubscriptionService.renewalOrderId(subscription.id, roastDate),
      amount: productAmount + shippingAmount,
      shippingAmount,
      billingAddress: formatBillingAddress(savedPaymentMethod.billing_details.address),
      discountPercent,
      freeShipping,
      shipping,
    };
  }

  private async quoteShipping(subscription: RenewalSubscription, account: ChargeableAccount): Promise<RenewalShippingQuote> {
    const saved = account.shippingAddressData;
    if (!saved) throw new Error("Subscription is missing a saved shipping address");
    const totalPounds = weightInPounds(subscription.weight) * subscription.bagCount + (subscription.addOnWeight || 0);
    const parcel = subscriptionParcel(totalPounds * 453.592, `${totalPounds}lb`, 1);
    // Firestore rejects undefined values, so optional fields are only set when present.
    const toAddress: Address = {
      street1: saved.line1, city: saved.city, state: saved.state, zip: saved.postal_code, country: saved.country,
      name: customerName(account), email: account.user.email,
      ...(saved.line2 ? { street2: saved.line2 } : {}),
      ...(account.phone ? { phone: account.phone } : {}),
    };
    const rates = await fetchShippingRates(toAddress, undefined, parcel);
    if (!rates.rates.length) throw new Error("No shipping rates are available for this subscription order");
    const cheapest = rates.rates.reduce((lowest, rate) => rate.rate < lowest.rate ? rate : lowest);
    return { toAddress, easypostShipmentId: rates.shipmentId, rateId: cheapest.id, estimatedLabelPrice: cheapest.rate, parcel };
  }

  /**
   * Returns the roast's single PaymentIntent, creating and confirming it only
   * when needed. The id is saved before confirming, so a retry after a crash
   * finds the existing payment instead of starting a second one.
   */
  private async collectPayment(
    claims: RenewalAttemptRepository, claimRef: DocumentReference, savedPaymentIntentId: string | undefined,
    subscription: RenewalSubscription, account: ChargeableAccount, quote: RenewalQuote, roastDate: string,
  ): Promise<Stripe.PaymentIntent> {
    const stripe = getStripeClient();
    let paymentIntent = savedPaymentIntentId ? await stripe.paymentIntents.retrieve(savedPaymentIntentId) : null;
    if (!paymentIntent) {
      paymentIntent = await stripe.paymentIntents.create({
        amount: quote.amount, currency: "usd",
        customer: account.billing.stripeCustomerId, payment_method: account.billing.stripePaymentMethodId,
        automatic_payment_methods: { enabled: true, allow_redirects: "never" },
        metadata: { accountId: subscription.accountId, subscriptionId: subscription.id, dueRoastDate: roastDate, orderNumber: quote.orderId },
        description: `Koinonia roast subscription: ${subscription.itemName}`,
      }, { idempotencyKey: `renewal:${subscription.id}:${roastDate}:${quote.orderId}` });
      await claims.recordPaymentIntent(claimRef, paymentIntent.id);
    }
    if (paymentIntent.status === "requires_confirmation" || paymentIntent.status === "requires_payment_method") {
      paymentIntent = await stripe.paymentIntents.confirm(paymentIntent.id, {
        payment_method: account.billing.stripePaymentMethodId, off_session: true,
      });
    }
    return paymentIntent;
  }

  private renewalOrder(subscription: RenewalSubscription, account: ChargeableAccount, quote: RenewalQuote,
    paymentIntent: Stripe.PaymentIntent, roastDate: string): RenewalOrder {
    return {
      id: quote.orderId,
      accountId: subscription.accountId,
      customerName: customerName(account),
      email: account.user.email,
      emailNormalized: account.user.email.toLowerCase(),
      phone: account.phone || null,
      totalAmount: paymentIntent.amount_received / 100,
      shippingCharged: quote.shippingAmount / 100,
      shippingLabelPrice: quote.shipping?.estimatedLabelPrice || 0,
      shippingBox: quote.shipping?.parcel.boxSize || "",
      shippingAddress: subscription.isLocalPickup ? "" : account.shippingAddress || "",
      isLocalPickup: !!subscription.isLocalPickup,
      ...(subscription.orderPickupId ? { orderPickupId: subscription.orderPickupId } : {}),
      createdAt: new Date().toISOString(),
      status: "completed",
      paymentIntentId: paymentIntent.id,
      subscriptionId: subscription.id,
      source: "subscription-renewal",
      items: RecurringOrderService.items(subscription),
      itemsSummary: RecurringOrderService.summary(subscription),
      renewal: { roastDate, billingAddress: quote.billingAddress, shipping: quote.shipping },
      fulfillment: {},
    };
  }
}
