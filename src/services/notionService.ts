import { createLogger } from '../util/logger';

interface OrderItem {
  name: string;
  sku: string;
  quantity: number;
  internalQuantity?: number;
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
  subtotal?: number;
  shipping?: number;
  tax?: number;
  orderDate: string;
  transactionId: string;
  shippingAddress?: string;
  billingAddress?: string;
  shipmentData?: {
    trackingNumber: string;
    labelUrl: string;
    shipmentId: string;
    carrier?: string;
    service?: string;
    shippingPrice?: number;
  };
  shippingBox?: string;
  isLocalPickup?: boolean;
  orderPickupId?: string;
  discountCode?: string;
}

export interface OrderPickupOption {
  id: string;
  name: string;
  start: string;
  end: string | null;
  address: string;
  pickupId: string;
}

export interface WebsiteEvent {
  id: string;
  name: string;
  start: string;
  end: string | null;
  location: string | null;
  body: string;
}

export interface InventoryVariant {
  sku: string;
  size?: string;
  color?: string;
  weight?: string;
  shippingWeight?: number;
  quantity: number;
  price: number;
  isSoldOut?: boolean;
  ltoEndDate?: string | null;
  ltoUnlimitedPurchases?: boolean;
  isWholesale?: boolean;
}

export interface NotionInventoryItem {
  sku: string;
  name: string;
  itemSummary: string;
  itemDetails: string;
  nextRoastDate?: string | null;
  price: number;
  firebaseImageUrls: string[];
  itemType: string;
  createdAt: string;
  quantity: number;
  isWholesale?: boolean;
  // Coffee-specific
  shippingWeight?: number;
  weights?: string[];
  roastLevel?: string;
  origin?: string;
  tastingNotes?: string[];
  // Merch-specific
  sizes?: string[];
  colors?: string[];
  // Variant inventory (for size/color/weight specific stock tracking)
  variants?: InventoryVariant[] | null;
  // Limited Time Offer
  ltoEndDate?: string | null;
  ltoUnlimitedPurchases?: boolean;
  // Brewing methods (from rollup properties)
  brewingMethods?: {
    singleDripper: {
      dose: string;
      yield: string;
      ratio: string;
      time: string;
      description: string;
    };
    batchDripper: {
      dose: string;
      yield: string;
      ratio: string;
      time: string;
      description: string;
    };
    espresso: {
      dose: string;
      yield: string;
      ratio: string;
      time: string;
      description: string;
    };
  };
}

interface CachedInventory {
  items: NotionInventoryItem[];
  lastSyncedAt: number;
}

const INVENTORY_CACHE_KEY = 'koinonia_inventory_cache_v2';
const INVENTORY_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes to match backend scheduled sync

const logger = createLogger('NotionService');

class NotionService {
  private backendUrl: string;

  constructor() {
    this.backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';
  }

  private getCachedInventory(): CachedInventory | null {
    try {
      const raw = localStorage.getItem(INVENTORY_CACHE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as CachedInventory;
    } catch {
      return null;
    }
  }

  private setCachedInventory(cache: CachedInventory): void {
    try {
      localStorage.setItem(INVENTORY_CACHE_KEY, JSON.stringify(cache));
    } catch {
      // Ignore storage errors (e.g. private mode)
    }
  }

  private clearCachedInventory(): void {
    try {
      localStorage.removeItem(INVENTORY_CACHE_KEY);
    } catch {
      // Ignore storage errors (e.g. private mode)
    }
  }

  async createOrder(orderData: NotionOrderData): Promise<void> {
    try {
      logger.log('📝 Creating Notion database entry for order:', orderData.orderId);

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
      logger.log('✅ Notion order created successfully:', result.pageId);
    } catch (error) {
      logger.error('❌ Failed to create Notion order:', error);
      throw error;
    }
  }

  async getOrderPickupOptions(containsCoffee: boolean): Promise<OrderPickupOption[]> {
    try {
      const response = await fetch(
        `${this.backendUrl}/get-order-pickup-options?containsCoffee=${containsCoffee ? 'true' : 'false'}`,
        { headers: { 'Content-Type': 'application/json' } }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result.options || [];
    } catch (error) {
      logger.error('❌ Failed to fetch order pickup options:', error);
      throw error;
    }
  }

  async getEvents(): Promise<WebsiteEvent[]> {
    // Bump this when the event response shape changes so stale empty bodies
    // from an earlier calendar response cannot hide Notion page content.
    const cacheKey = 'koinonia_events_calendar_v4';
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as { fetchedAt: number; events: WebsiteEvent[] };
        if (Date.now() - parsed.fetchedAt < 24 * 60 * 60 * 1000) return parsed.events;
      }
    } catch {
      // Fetch fresh data when local storage is unavailable or invalid.
    }

    const response = await fetch(`${this.backendUrl}/events`, { headers: { 'Content-Type': 'application/json' } });
    if (!response.ok) throw new Error('Unable to load events');
    const result = await response.json() as { events?: WebsiteEvent[] };
    const events = result.events || [];
    try {
      localStorage.setItem(cacheKey, JSON.stringify({ fetchedAt: Date.now(), events }));
    } catch {
      // Ignore storage errors; the page can still render the response.
    }
    return events;
  }

  async checkOrderConfirmedEmailSent(orderId: string): Promise<{ emailSent: boolean; orderExists: boolean }> {
    try {
      logger.log('🔍 Checking if order confirmed email was sent for order:', orderId);

      const response = await fetch(`${this.backendUrl}/check-order-confirmed-email-sent?orderId=${orderId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      logger.log('✅ Order confirmed email status:', result.emailSent, 'Order exists:', result.orderExists);
      return { emailSent: result.emailSent || false, orderExists: result.orderExists || false };
    } catch (error) {
      logger.error('❌ Failed to check order confirmed email status:', error);
      return { emailSent: false, orderExists: false };
    }
  }

  async markOrderConfirmedEmailSent(orderId: string): Promise<void> {
    try {
      logger.log('✅ Marking order confirmed email as sent for order:', orderId);

      const response = await fetch(`${this.backendUrl}/mark-order-confirmed-email-sent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orderId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      logger.log('✅ Order confirmed email marked as sent successfully');
    } catch (error) {
      logger.error('❌ Failed to mark order confirmed email as sent:', error);
      throw error;
    }
  }

  async uncheckOrderConfirmedEmailSent(orderId: string): Promise<void> {
    try {
      logger.log('✅ Unchecking order confirmed email for order:', orderId);

      const response = await fetch(`${this.backendUrl}/uncheck-order-confirmed-email-sent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orderId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      logger.log('✅ Order confirmed email unchecked successfully');
    } catch (error) {
      logger.error('❌ Failed to uncheck order confirmed email:', error);
      throw error;
    }
  }

  async updateOrderStatus(orderId: string, status: string): Promise<void> {
    logger.warn('updateOrderStatus not yet implemented on backend');
  }

  async updateFulfillmentStatus(orderId: string, fulfillment: string): Promise<void> {
    logger.warn('updateFulfillmentStatus not yet implemented on backend');
  }

  async getInventory(bypassCache: boolean = false, forceRefresh: boolean = false): Promise<NotionInventoryItem[]> {
    try {
      const cached = this.getCachedInventory();
      if (cached && Date.now() - cached.lastSyncedAt < INVENTORY_CACHE_TTL_MS && !bypassCache && !forceRefresh) {
        logger.log(`✅ Returning ${cached.items.length} inventory items from local cache`);
        return cached.items;
      }

      // Clear local cache if bypassing or forcing refresh
      if (bypassCache || forceRefresh) {
        this.clearCachedInventory();
      }

      logger.log('📦 Fetching inventory from backend');

      const response = await fetch(`${this.backendUrl}/get-inventory?bypass=${bypassCache ? 'true' : 'false'}&force=${forceRefresh ? 'true' : 'false'}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      const lastSyncedAt: number = result.lastSyncedAt || Date.now();
      logger.log(`✅ Successfully fetched ${result.items.length} inventory items from backend`);

      this.setCachedInventory({ items: result.items, lastSyncedAt });
      return result.items;
    } catch (error) {
      logger.error('❌ Failed to fetch inventory:', error);

      const cached = this.getCachedInventory();
      if (cached) {
        logger.warn('⚠️ Returning stale inventory from local cache');
        return cached.items;
      }

      throw error;
    }
  }
}

export const notionService = new NotionService();
