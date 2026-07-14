import { Item } from '../pages/shop/item/ItemModel';

const CACHE_KEY = 'koinonia_inventory_cache';
const CACHE_TIMESTAMP_KEY = 'koinonia_inventory_timestamp';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

export const saveInventoryCache = (items: Item[]): void => {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(items));
        localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
    } catch (error) {
        console.error('Failed to save inventory to cache:', error);
    }
};

export const loadInventoryCache = (): Item[] | null => {
    try {
        const cached = localStorage.getItem(CACHE_KEY);
        const timestamp = localStorage.getItem(CACHE_TIMESTAMP_KEY);
        if (!cached || !timestamp) return null;

        const cacheAge = Date.now() - parseInt(timestamp);
        if (cacheAge > CACHE_DURATION) {
            localStorage.removeItem(CACHE_KEY);
            localStorage.removeItem(CACHE_TIMESTAMP_KEY);
            return null;
        }

        return JSON.parse(cached);
    } catch (error) {
        console.error('Failed to load inventory from cache:', error);
        return null;
    }
};

export const clearInventoryCache = (): void => {
    try {
        localStorage.removeItem(CACHE_KEY);
        localStorage.removeItem(CACHE_TIMESTAMP_KEY);
    } catch (error) {
        console.error('Failed to clear inventory cache:', error);
    }
};
