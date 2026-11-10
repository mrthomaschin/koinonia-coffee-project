import { Item, ItemType } from './item/ItemModel';

// The shop is split into one listing page per category. Product pages stay at
// /shop/<slug>; these static paths are matched ahead of that route.

export type ShopCategoryKey = 'coffee' | 'merch';

export interface ShopCategory {
  key: ShopCategoryKey;
  path: string;
  title: string;
  seoTitle: string;
  description: string;
  includes: (item: Item) => boolean;
}

export const SHOP_CATEGORIES: Record<ShopCategoryKey, ShopCategory> = {
  coffee: {
    key: 'coffee',
    path: '/shop/coffee',
    title: 'Coffee',
    seoTitle: 'Specialty Coffee Beans | Koinonia Coffee Project',
    description: 'Shop specialty coffee from Koinonia Coffee Project, roasted fresh for brewing at home.',
    includes: (item) => item.itemType === ItemType.coffee,
  },
  merch: {
    key: 'merch',
    path: '/shop/merch',
    title: 'Merch',
    seoTitle: 'Apparel, Stickers & Merch | Koinonia Coffee Project',
    description: 'Shop apparel, drinkware, stickers, and more from Koinonia Coffee Project.',
    includes: (item) => item.itemType !== ItemType.coffee,
  },
};

/** The listing page an item belongs to, e.g. for a product page's back link. */
export const categoryFor = (item: Item): ShopCategory =>
  SHOP_CATEGORIES.coffee.includes(item) ? SHOP_CATEGORIES.coffee : SHOP_CATEGORIES.merch;
