interface OrderItem {
  name: string;
  sku: string;
  quantity: number;
  price: number;
  variations?: string;
  image?: string;
}

interface NotionOrderData {
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  orderId: string;
  items: OrderItem[];
  totalAmount: number;
  orderDate: string;
  transactionId: string;
  shippingAddress?: string;
}

class NotionService {
  private backendUrl: string;

  constructor() {
    this.backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';
  }

  async createOrder(orderData: NotionOrderData): Promise<void> {
    try {
      console.log('📝 Creating Notion database entry for order:', orderData.orderId);

      const response = await fetch(`${this.backendUrl}/create-notion-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(orderData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log('✅ Notion order created successfully:', result.pageId);
    } catch (error) {
      console.error('❌ Failed to create Notion order:', error);
      throw error;
    }
  }

  async updateOrderStatus(orderId: string, status: string): Promise<void> {
    console.warn('updateOrderStatus not yet implemented on backend');
  }

  async updateFulfillmentStatus(orderId: string, fulfillment: string): Promise<void> {
    console.warn('updateFulfillmentStatus not yet implemented on backend');
  }
}

export const notionService = new NotionService();
