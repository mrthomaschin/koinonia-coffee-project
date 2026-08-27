export interface Order {
    id: string;
    totalAmount: number;
    status: 'pending' | 'completed' | 'canceled';
    createdAt: string;
}