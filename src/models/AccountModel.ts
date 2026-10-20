export interface User {
  firstName: string;
  lastName: string;
  email: string;
}

/** The account types supported by the account hierarchy. */
export type AccountLabel =
  | "consumer"
  | "partner"
  | "wholesale"
  | "church-ministry";

export type PartnerAccountLabel = Extract<
  AccountLabel,
  "wholesale" | "church-ministry"
>;

export const DEFAULT_ACCOUNT_LABEL: AccountLabel = "consumer";

/** Parent relationship used when partner-specific features are introduced. */
export const ACCOUNT_LABEL_PARENTS: Record<AccountLabel, AccountLabel | null> =
  {
    consumer: null,
    partner: null,
    wholesale: "partner",
    "church-ministry": "partner",
  };

/** A saved postal address, in the same shape Stripe's AddressElement uses. */
export interface SavedAddress {
  line1: string;
  line2: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
}

export interface SavedAddresses {
  shipping: SavedAddress | null;
  billing: SavedAddress | null;
}

export interface Account {
  id: string;
  user: User;
  username: string;
  password: string;
  label: AccountLabel;
  // False until the email is confirmed through an emailed link.
  emailVerified: boolean;
  // A requested new email; it replaces user.email once its link is confirmed.
  pendingEmail?: string;
}

export interface Subscription {
  id: string;
  plan: SubscriptionPlan;
  bagCount: 1 | 2;
  cadence: SubscriptionCadence;
  itemSku: string;
  itemName: string;
  weight: string;
  shippingWeight?: number;
  unitAmount: number;
  discountPercent: 5;
  freeShipping: boolean;
  status: "active" | "paused" | "canceled";
  // Roast date (YYYY-MM-DD) the customer skipped; it applies only while it matches upcomingRoastDate.
  skippedRoastDate?: string;
  // Roast date (YYYY-MM-DD) of an order-now charge that is still processing.
  orderNowRoastDate?: string;
  isLocalPickup?: boolean;
  orderPickupId?: string;
  createdAt: string;
  upcomingRoastDate: string;
  addOnWeight?: number;
  addOnUnitAmount?: number;
}

export interface CreateSubscriptionInput {
  plan: SubscriptionPlan;
  itemSku: string;
  itemName: string;
  weight: string;
}

export type SubscriptionCadence =
  | "every-session"
  | "every-other-session"
  | "every-third-session";

export type SubscriptionPlan =
  | "one-bag-every-session"
  | "two-bags-every-session"
  | "one-bag-every-other-session"
  | "two-bags-every-other-session"
  | "one-bag-every-third-session"
  | "two-bags-every-third-session";

export const SUBSCRIPTION_CADENCES: Array<{
  id: SubscriptionCadence;
  label: string;
}> = [
  { id: "every-session", label: "Every roast session" },
  { id: "every-other-session", label: "Every other roast session" },
  { id: "every-third-session", label: "Every third roast session" },
];

export interface SubscriptionPlanOption {
  id: SubscriptionPlan;
  label: string;
  cadenceLabel: string;
  bagCount: 1 | 2;
  discountPercent: 5;
  freeShipping: boolean;
}

export const SUBSCRIPTION_PLANS: SubscriptionPlanOption[] = [
  {
    id: "one-bag-every-session",
    label: "One bag every roast",
    cadenceLabel: "Ships with every roast session",
    bagCount: 1,
    discountPercent: 5,
    freeShipping: false,
  },
  {
    id: "two-bags-every-session",
    label: "Two bags every roast",
    cadenceLabel: "Ships with every roast session",
    bagCount: 2,
    discountPercent: 5,
    freeShipping: true,
  },
  {
    id: "one-bag-every-other-session",
    label: "One bag every other roast",
    cadenceLabel: "Ships with every second roast session",
    bagCount: 1,
    discountPercent: 5,
    freeShipping: false,
  },
  {
    id: "two-bags-every-other-session",
    label: "Two bags every other roast",
    cadenceLabel: "Ships with every second roast session",
    bagCount: 2,
    discountPercent: 5,
    freeShipping: true,
  },
  {
    id: "one-bag-every-third-session",
    label: "One bag every third roast",
    cadenceLabel: "Ships with every third roast session",
    bagCount: 1,
    discountPercent: 5,
    freeShipping: false,
  },
  {
    id: "two-bags-every-third-session",
    label: "Two bags every third roast",
    cadenceLabel: "Ships with every third roast session",
    bagCount: 2,
    discountPercent: 5,
    freeShipping: true,
  },
];
