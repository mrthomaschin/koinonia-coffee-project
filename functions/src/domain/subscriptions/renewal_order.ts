import type { Address } from "../../services/easypost_service";
import type { SubscriptionParcel } from "../shipping/parcel_rules";

/** The EasyPost quote a renewal was priced with; fulfillment buys this exact rate. */
export interface RenewalShippingQuote {
  toAddress: Address;
  easypostShipmentId: string;
  rateId: string;
  // Dollars, as quoted. Replaced by the purchased label price after fulfillment.
  estimatedLabelPrice: number;
  parcel: SubscriptionParcel;
}

/**
 * Everything priced for one subscription roast. Saved on the renewal claim
 * before charging, so every retry charges the same amount for the same order.
 */
export interface RenewalQuote {
  orderId: string;
  // Cents: products plus the shipping charged to the customer.
  amount: number;
  shippingAmount: number;
  billingAddress: string;
  discountPercent: number;
  freeShipping: boolean;
  shipping: RenewalShippingQuote | null;
}

/** Post-payment steps. Each timestamp is set once its step has succeeded. */
export interface RenewalFulfillment {
  notionSyncedAt?: string;
  labelPurchasedAt?: string;
  receiptAttachedAt?: string;
  customerEmailSentAt?: string;
  purchaseNotificationSentAt?: string;
  lastError?: string;
  lastErrorAt?: string;
}

/** A paid renewal order at orders/{orderId}. Written once, right after payment succeeds. */
export interface RenewalOrder {
  id: string;
  accountId: string;
  customerName: string;
  email: string;
  emailNormalized: string;
  phone: string | null;
  totalAmount: number;
  shippingCharged: number;
  shippingLabelPrice: number;
  shippingBox: string;
  shippingAddress: string;
  isLocalPickup: boolean;
  orderPickupId?: string;
  createdAt: string;
  status: "completed";
  paymentIntentId: string;
  subscriptionId: string;
  source: "subscription-renewal";
  items: Array<{ name: string; sku: string; quantity: number; internalQuantity: number; price: number; selections: { weight: string } }>;
  itemsSummary: string;
  renewal: {
    roastDate: string;
    billingAddress: string;
    shipping: RenewalShippingQuote | null;
  };
  fulfillment: RenewalFulfillment;
  shipmentId?: string;
  trackingNumber?: string;
  trackingLabelUrl?: string;
  shippingCarrier?: string | null;
  shippingService?: string | null;
}
