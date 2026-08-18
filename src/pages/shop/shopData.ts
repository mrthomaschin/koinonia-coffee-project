import { Item } from './item/ItemModel';
import { saveInventoryCache, loadInventoryCache } from '../../services/cacheService';

export const generateSlug = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

// Global item registry - updated by ShopViewModel when Notion items load
let globalItems: Item[] = [];

export const setGlobalItems = (items: Item[]) => {
  globalItems = items;
  saveInventoryCache(items);
};

export const getGlobalItems = (): Item[] => {
  if (globalItems.length > 0) return globalItems;

  const cached = loadInventoryCache();
  if (cached && cached.length > 0) {
    globalItems = cached;
    return cached;
  }

  return [];
};


export const getItemBySlug = (slug: string): Item | undefined => {
  const items = getGlobalItems();
  return items.find(item => generateSlug(item.name) === slug);
};

export const getItemById = (id: string): Item | undefined => {
  const items = getGlobalItems();
  return items.find(item => item.sku === id);
};
