import { createLogger } from '../util/logger';

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

export interface InventoryVariant {
  sku: string;
  size?: string;
  color?: string;
  weight?: string;
  quantity: number;
  price: number;
}

export interface NotionInventoryItem {
  sku: string;
  name: string;
  description: string;
  price: number;
  images: string[];
  itemType: string;
  createdAt: string;
  quantity: number;
  // Coffee-specific
  weights?: string[];
  roastLevel?: string;
  origin?: string;
  tastingNotes?: string[];
  // Merch-specific
  sizes?: string[];
  colors?: string[];
  // Variant inventory (for size/color/weight specific stock tracking)
  variants?: InventoryVariant[] | null;
}

interface CachedInventory {
  items: NotionInventoryItem[];
  lastSyncedAt: number;
}

const INVENTORY_CACHE_KEY = 'koinonia_inventory_cache';
const INVENTORY_CACHE_TTL_MS = 15 * 60 * 1000;

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

  async updateOrderStatus(orderId: string, status: string): Promise<void> {
    logger.warn('updateOrderStatus not yet implemented on backend');
  }

  async updateFulfillmentStatus(orderId: string, fulfillment: string): Promise<void> {
    logger.warn('updateFulfillmentStatus not yet implemented on backend');
  }

  async getInventory(): Promise<NotionInventoryItem[]> {
    try {
      const cached = this.getCachedInventory();
      if (cached && Date.now() - cached.lastSyncedAt < INVENTORY_CACHE_TTL_MS) {
        logger.log(`✅ Returning ${cached.items.length} inventory items from local cache`);
        return cached.items;
      }

      logger.log('📦 Fetching inventory from backend');

      const response = await fetch(`${this.backendUrl}/get-inventory`, {
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
      logger.log(`✅ Successfully fetched ${result.items.length} inventory items`);

      // Log images for debugging
      result.items.forEach((item: any) => {
        logger.log(`📦 ${item.name} images:`, item.images);
      });

      // Log items with variants for debugging
      result.items.forEach((item: any) => {
        if (item.variants && item.variants.length > 0) {
          logger.log(`📦 Item with variants: ${item.name} (${item.sku})`, {
            variants: item.variants
          });
        }
      });

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
