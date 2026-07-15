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
  shipmentData?: {
    trackingNumber: string;
    labelUrl: string;
    shipmentId: string;
    carrier?: string;
    service?: string;
  };
  isLocalPickup?: boolean;
}

export interface InventoryVariant {
  sku: string;
  size?: string;
  color?: string;
  weight?: string;
  quantity: number;
  price: number;
  isSoldOut?: boolean;
}

export interface NotionInventoryItem {
  sku: string;
  name: string;
  description: string;
  price: number;
  firebaseImageUrls: string[];
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
const INVENTORY_CACHE_TTL_MS = 5 * 60 * 1000; // Reduced to 5 minutes to prevent stale data

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

  async updateOrderStatus(orderId: string, status: string): Promise<void> {
    logger.warn('updateOrderStatus not yet implemented on backend');
  }

  async updateFulfillmentStatus(orderId: string, fulfillment: string): Promise<void> {
    logger.warn('updateFulfillmentStatus not yet implemented on backend');
  }

  async getInventory(bypassCache: boolean = false): Promise<NotionInventoryItem[]> {
    try {
      const cached = this.getCachedInventory();
      if (cached && Date.now() - cached.lastSyncedAt < INVENTORY_CACHE_TTL_MS && !bypassCache) {
        logger.log(`✅ Returning ${cached.items.length} inventory items from local cache`);
        return cached.items;
      }

      // Clear local cache if bypassing
      if (bypassCache) {
        this.clearCachedInventory();
      }

      logger.log('📦 Fetching inventory from backend');

      const response = await fetch(`${this.backendUrl}/get-inventory?bypass=${bypassCache}`, {
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

      // Log items with their quantities for monitoring
      result.items.forEach((item: any) => {
        const hasVariants = item.variants && item.variants.length > 0;
        const itemTypeLabel = hasVariants ? "Parent item (with variants)" : "Standalone item (no variants)";

        logger.log(`📦 ${itemTypeLabel}: ${item.name} (${item.sku})`, {
          sku: item.sku,
          name: item.name,
          quantity: item.quantity,
          hasVariants: hasVariants,
          itemType: item.itemType,
        });

        // Log variant details if present
        if (hasVariants) {
          logger.log(`📦 Variants for ${item.name} (${item.sku})`, {
            variantDetails: item.variants.map((v: any) => ({
              sku: v.sku,
              size: v.size,
              color: v.color,
              weight: v.weight,
              quantity: v.quantity,
              isSoldOut: v.isSoldOut
            }))
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
