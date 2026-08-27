export interface User {
    firstName: string;
    lastName: string;
    email: string;
}

export interface Account {
    id: string;
    user: User;
    username: string;
    password: string;
}

export interface Subscription {
    id: string;
    plan: SubscriptionPlan;
    bagCount: 1 | 2;
    cadence: 'every-session' | 'every-other-session';
    itemSku: string;
    itemName: string;
    weight: string;
    discountPercent: 5;
    freeShipping: boolean;
    nextEligibleSession: number | null;
    status: 'active' | 'paused' | 'canceled';
    skipNextDelivery: boolean;
    createdAt: string;
    nextEligibleRoastAt: string;
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
