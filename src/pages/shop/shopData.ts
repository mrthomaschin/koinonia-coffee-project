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
    'Ethiopia Yirgacheffe',
    'A bright and floral coffee with notes of bergamot and jasmine. Grown in the highlands of Yirgacheffe, this coffee showcases the unique terroir of Ethiopia.',
    18.99,
    ASSETS.shopPlaceholder,
    new Date(),
    [CoffeeBagWeight._200g, CoffeeBagWeight._5lb],
    RoastLevel.light,
    'Ethiopia',
    ['Bergamot', 'Jasmine', 'Citrus']
  ),
  new CoffeeBagItem(
    '2',
    'Koin Blend',
    'A well-balanced medium roast with chocolate and caramel notes. Sourced from smallholder farmers in the Colombian highlands.',
    16.99,
    ASSETS.shopPlaceholder,
    new Date(),
    [CoffeeBagWeight._200g, CoffeeBagWeight._5lb],
    RoastLevel.mediumLight,
    'Ethiopia, Colombia',
    ['Chocolate', 'Caramel', 'Nutty']
  ),
  new MerchItem(
    '4',
    'Koinonia Signature Tee',
    'Premium Cotton Tee with our signature logos on the front and back. Comfortable and stylish for everyday wear.',
    24.99,
    ASSETS.shopPlaceholder,
    MerchCategory.apparel,
    new Date(),
    [MerchSize.S, MerchSize.M, MerchSize.L, MerchSize.XL],
    ['Beige']
  ),
  new MerchItem(
    '5',
    'Koinonia Circle Sticker',
    '',
    16.99,
    ASSETS.shopPlaceholder,
    MerchCategory.stickers,
    new Date(),
    [],
    ['Navy']
  ),
  new MerchItem(
    '6',
    'Logo Sticker',
    '',
    16.99,
    ASSETS.shopPlaceholder,
    MerchCategory.stickers,
    new Date(),
    [],
    ['Navy']
  ),
  new MerchItem(
    '7',
    'Koinonia Letters Sticker',
    '',
    16.99,
    ASSETS.shopPlaceholder,
    MerchCategory.stickers,
    new Date(),
    [],
    ['White']
  ),
  new MerchItem(
    '8',
    'Sticker Pack',
    'Can\'t decide on a sticker? Why not get all of them!',
    16.99,
    ASSETS.shopPlaceholder,
    MerchCategory.stickers,
    new Date(),
    [],
    ['White']
  ),
];

export const getItemBySlug = (slug: string): Item | undefined => {
  return sampleItems.find(item => generateSlug(item.name) === slug);
};

export const getItemById = (id: string): Item | undefined => {
  return sampleItems.find(item => item.id === id);
};
