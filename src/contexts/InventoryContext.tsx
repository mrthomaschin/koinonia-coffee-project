import React, { createContext, useContext, useState, useEffect } from 'react';
import { Item } from '../pages/shop/item/ItemModel';
import { getGlobalItems, setGlobalItems } from '../pages/shop/shopData';
import { notionService } from '../services/notionService';
import { convertNotionItemsToItems } from '../pages/shop/notionItemMapper';
import { createLogger } from '../util/logger';

const logger = createLogger('InventoryContext');

interface InventoryContextType {
  items: Item[];
  isLoading: boolean;
  error: string | null;
  refreshInventory: () => Promise<void>;
}

const InventoryContext = createContext<InventoryContextType | undefined>(undefined);

export const InventoryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<Item[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const preloadImages = (items: Item[]) => {
    items.forEach(item => {
      if (item.firebaseImageUrls && item.firebaseImageUrls.length > 0) {
        const img = new Image();
        img.src = item.firebaseImageUrls[0];
      }
    });
  };

  const loadInventory = async () => {
    try {
      // Try cache first for instant display
      const cachedItems = getGlobalItems();
      if (cachedItems && cachedItems.length > 0) {
        setItems(cachedItems);
        setIsLoading(false);
        logger.log(`✅ Loaded ${cachedItems.length} items from cache (instant)`);
        // Preload images in background without blocking
        setTimeout(() => preloadImages(cachedItems), 0);
      }

      // Fetch fresh data in background
      const notionItems = await notionService.getInventory();
      if (notionItems && notionItems.length > 0) {
        // Defer conversion to not block rendering
        const convertedItems = convertNotionItemsToItems(notionItems);
        setItems(convertedItems);
        setGlobalItems(convertedItems);
        logger.log(`🔄 Refreshed with ${convertedItems.length} items from backend`);
        // Preload images in background
        setTimeout(() => preloadImages(convertedItems), 0);
      }
      setError(null);
    } catch (err) {
      logger.error('Failed to load inventory:', err);
      setError('Failed to load inventory');

      // Fallback to cached items if available
      const cachedItems = getGlobalItems();
      if (cachedItems && cachedItems.length > 0) {
        setItems(cachedItems);
        setTimeout(() => preloadImages(cachedItems), 0);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadInventory();
  }, []);

  const refreshInventory = async () => {
    setIsLoading(true);
    await loadInventory();
  };

  return (
    <InventoryContext.Provider value={{ items, isLoading, error, refreshInventory }}>
      {children}
    </InventoryContext.Provider>
  );
};

export const useInventory = () => {
  const context = useContext(InventoryContext);
  if (!context) throw new Error('useInventory must be used within InventoryProvider');
  return context;
};
