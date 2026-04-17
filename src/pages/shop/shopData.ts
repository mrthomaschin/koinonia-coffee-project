import { CoffeeBagItem, CoffeeBagWeight, RoastLevel } from './item/coffee_bag/CoffeeBagItem';
import { MerchItem, MerchSize, MerchCategory } from './item/merch/MerchItem';
import { Item } from './item/Item';
import { ASSETS } from '../../util/constants';

export const generateSlug = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

export const sampleItems: Item[] = [
  new CoffeeBagItem(
    '1',
    'Ethiopian Yirgacheffe',
    'A bright and floral coffee with notes of bergamot and jasmine. Grown in the highlands of Yirgacheffe, this coffee showcases the unique terroir of Ethiopia.',
    18.99,
    ASSETS.shopPlaceholder,
    CoffeeBagWeight._12oz,
    RoastLevel.light,
    'Ethiopia',
    ['Bergamot', 'Jasmine', 'Citrus']
  ),
  new CoffeeBagItem(
    '2',
    'Colombian Supremo',
    'A well-balanced medium roast with chocolate and caramel notes. Sourced from smallholder farmers in the Colombian highlands.',
    16.99,
    ASSETS.shopPlaceholder,
    CoffeeBagWeight._12oz,
    RoastLevel.medium,
    'Colombia',
    ['Chocolate', 'Caramel', 'Nutty']
  ),
  new CoffeeBagItem(
    '3',
    'Sumatra Mandheling',
    'A bold and earthy dark roast with notes of cedar and dark chocolate. Perfect for those who enjoy a full-bodied cup.',
    17.99,
    ASSETS.shopPlaceholder,
    CoffeeBagWeight._12oz,
    RoastLevel.dark,
    'Indonesia',
    ['Cedar', 'Dark Chocolate', 'Earthy']
  ),
  new MerchItem(
    '4',
    'Koinonia Coffee T-Shirt',
    'Premium cotton t-shirt with our signature logo. Comfortable and stylish for everyday wear.',
    24.99,
    ASSETS.shopPlaceholder,
    MerchCategory.apparel,
    [MerchSize.S, MerchSize.M, MerchSize.L, MerchSize.XL],
    ['Black', 'White', 'Brown']
  ),
  new MerchItem(
    '5',
    'Ceramic Coffee Mug',
    'Handcrafted ceramic mug perfect for your morning brew. Holds 12oz of your favorite coffee.',
    16.99,
    ASSETS.shopPlaceholder,
    MerchCategory.drinkware,
    [],
    ['White', 'Brown', 'Navy']
  ),
];

export const getItemBySlug = (slug: string): Item | undefined => {
  return sampleItems.find(item => generateSlug(item.name) === slug);
};

export const getItemById = (id: string): Item | undefined => {
  return sampleItems.find(item => item.id === id);
};
