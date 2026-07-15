import { CoffeeBagItem, CoffeeBagWeight, RoastLevel } from './item/coffee_bag/CoffeeBagItem';
import { MerchItem, MerchSize } from './item/merch/MerchItem';
import { Item, ItemType } from './item/ItemModel';
import { ASSETS, ICONS } from '../../util/constants';
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

  return sampleItems;
};

// NOTE: sampleItems is now used as fallback data only.
// Primary inventory source is Notion database via ShopViewModel.loadInventory()
export const sampleItems: Item[] = [
  new CoffeeBagItem(
    'B-ETH-W',
    'Ethiopia Yirgacheffe',
    'A bright and floral coffee with notes of bergamot and jasmine. Grown in the highlands of Yirgacheffe, this coffee showcases the unique terroir of Ethiopia.',
    10.00,
    new Date(),
    [CoffeeBagWeight._200g, CoffeeBagWeight._5lb],
    RoastLevel.light,
    'Ethiopia',
    ['Bergamot', 'Jasmine', 'Citrus'],
    1,
  ),
  new CoffeeBagItem(
    'B-KOIN',
    'Koin Blend',
    'A well-balanced medium roast with chocolate and caramel notes. Sourced from smallholder farmers in the Colombian highlands.',
    0.00,
    new Date(),
    [CoffeeBagWeight._200g, CoffeeBagWeight._5lb],
    RoastLevel.mediumLight,
    'Ethiopia, Colombia',
    ['Chocolate', 'Caramel', 'Nutty'],
    0,
  ),
  new MerchItem(
    '4',
    'Koinonia Signature Tee',
    'Premium Cotton Tee with our signature logos on the front and back. Comfortable and stylish for everyday wear.',
    30.00,
    ItemType.apparel,
    new Date(),
    [MerchSize.S, MerchSize.M, MerchSize.L, MerchSize.XL],
    ['Beige'],
    10,
  ),
  new MerchItem(
    '5',
    'Koinonia Circle Sticker',
    '',
    2.50,
    ItemType.stickers,
    new Date(),
    [],
    ['Navy'],
    5,
  ),
  new MerchItem(
    '6',
    'Logo Sticker',
    '',
    2.50,
    ItemType.stickers,
    new Date(),
    [],
    ['Navy'],
    5,
  ),
  new MerchItem(
    '7',
    'Koinonia Letter Sticker',
    '',
    3.00,
    ItemType.stickers,
    new Date(),
    [],
    ['White'],
    5,
  ),
  new MerchItem(
    '8',
    'Koinonia Letter Sticker 2',
    '',
    3.00,
    ItemType.stickers,
    new Date(),
    [],
    ['White'],
    5,
  ),
  new MerchItem(
    '9',
    'Sticker Pack',
    'Can\'t decide on a sticker? Why not get all of them!',
    7.00,
    ItemType.stickers,
    new Date(),
    [],
    ['White'],
    5,
  ),
];

export const getItemBySlug = (slug: string): Item | undefined => {
  const items = getGlobalItems();
  return items.find(item => generateSlug(item.name) === slug);
};

export const getItemById = (id: string): Item | undefined => {
  const items = getGlobalItems();
  return items.find(item => item.sku === id);
};
