export interface Order {
    id: string;
    totalAmount: number;
    status: 'pending' | 'completed' | 'canceled';
    createdAt: string;
    itemsSummary?: string;
    // True once the order is delivered or picked up (and not refunded), so it can be reviewed.
    reviewable?: boolean;
    // True when the customer has reviewed at least one product in the order.
    reviewed?: boolean;
}
