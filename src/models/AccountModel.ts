export interface User {
    firstName: string;
    lastName: string;
    email: string;
}

/** The account types supported by the account hierarchy. */
export type AccountLabel = 'consumer' | 'partner' | 'wholesale' | 'church-ministry';

export type PartnerAccountLabel = Extract<AccountLabel, 'wholesale' | 'church-ministry'>;

export const DEFAULT_ACCOUNT_LABEL: AccountLabel = 'consumer';

/** Parent relationship used when partner-specific features are introduced. */
export const ACCOUNT_LABEL_PARENTS: Record<AccountLabel, AccountLabel | null> = {
    consumer: null,
    partner: null,
    wholesale: 'partner',
    'church-ministry': 'partner',
};

export interface Account {
    id: string;
    user: User;
    username: string;
    password: string;
    label: AccountLabel;
}

export interface Subscription {
    id: string;
    plan: SubscriptionPlan;
    bagCount: 1 | 2;
    cadence: 'every-session' | 'every-other-session';
    itemSku: string;
    itemName: string;
    weight: string;
    shippingWeight?: number;
    unitAmount: number;
    discountPercent: 5;
    freeShipping: boolean;
    status: 'active' | 'paused' | 'canceled';
    skipNextDelivery: boolean;
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

export type SubscriptionPlan =
    | 'one-bag-every-session'
    | 'two-bags-every-session'
    | 'one-bag-every-other-session'
    | 'two-bags-every-other-session';

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
        id: 'one-bag-every-session',
        label: 'One bag every roast',
        cadenceLabel: 'Ships with every roast session',
        bagCount: 1,
        discountPercent: 5,
        freeShipping: false,
    },
    {
        id: 'two-bags-every-session',
        label: 'Two bags every roast',
        cadenceLabel: 'Ships with every roast session',
        bagCount: 2,
        discountPercent: 5,
        freeShipping: true,
    },
    {
        id: 'one-bag-every-other-session',
        label: 'One bag every other roast',
        cadenceLabel: 'Ships with every second roast session',
        bagCount: 1,
        discountPercent: 5,
        freeShipping: false,
    },
    {
        id: 'two-bags-every-other-session',
        label: 'Two bags every other roast',
        cadenceLabel: 'Ships with every second roast session',
        bagCount: 2,
        discountPercent: 5,
        freeShipping: true,
    },
];
