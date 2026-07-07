import { CoffeeBagItem, CoffeeBagWeight, RoastLevel } from './item/coffee_bag/CoffeeBagItem';
import { MerchItem, MerchSize } from './item/merch/MerchItem';
import { Item, ItemType } from './item/ItemModel';
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
    10.00,
    [ASSETS.ethiopiaOne, ASSETS.coffeeBags],
    new Date(),
    [CoffeeBagWeight._200g, CoffeeBagWeight._5lb],
    RoastLevel.light,
    'Ethiopia',
    ['Bergamot', 'Jasmine', 'Citrus'],
    1,
    undefined
  ),
  new CoffeeBagItem(
    '2',
    'Koin Blend',
    'A well-balanced medium roast with chocolate and caramel notes. Sourced from smallholder farmers in the Colombian highlands.',
    0.00,
    [ASSETS.koinoniaBlendOne, ASSETS.koinoniaBlendTwo, ASSETS.coffeeBags],
    new Date(),
    [CoffeeBagWeight._200g, CoffeeBagWeight._5lb],
    RoastLevel.mediumLight,
    'Ethiopia, Colombia',
    ['Chocolate', 'Caramel', 'Nutty'],
    0,
    undefined
  ),
  new MerchItem(
    '4',
    'Koinonia Signature Tee',
    'Premium Cotton Tee with our signature logos on the front and back. Comfortable and stylish for everyday wear.',
    30.00,
    [ASSETS.koinoniaSigTeeOne, ASSETS.koinoniaSigTeeTwo],
    ItemType.apparel,
    new Date(),
    [MerchSize.S, MerchSize.M, MerchSize.L, MerchSize.XL],
    ['Beige'],
    10,
    'gid://shopify/ProductVariant/8042073751670'
  ),
  new MerchItem(
    '5',
    'Koinonia Circle Sticker',
    '',
    2.50,
    [ASSETS.circleSticker1],
    ItemType.stickers,
    new Date(),
    [],
    ['Navy'],
    5,
    undefined
  ),
  new MerchItem(
    '6',
    'Logo Sticker',
    '',
    2.50,
    [ASSETS.logoSticker1],
    ItemType.stickers,
    new Date(),
    [],
    ['Navy'],
    5,
    undefined
  ),
  new MerchItem(
    '7',
    'Koinonia Letter Sticker',
    '',
    3.00,
    [ASSETS.letterSticker1],
    ItemType.stickers,
    new Date(),
    [],
    ['White'],
    5,
    undefined
  ),
  new MerchItem(
    '8',
    'Koinonia Letter Sticker 2',
    '',
    3.00,
    [ASSETS.letterSticker2],
    ItemType.stickers,
    new Date(),
    [],
    ['White'],
    5,
    undefined
  ),
  new MerchItem(
    '9',
    'Sticker Pack',
    'Can\'t decide on a sticker? Why not get all of them!',
    7.00,
    [ASSETS.stickerGroup1],
    ItemType.stickers,
    new Date(),
    [],
    ['White'],
    5,
    undefined
  ),
];

export const getItemBySlug = (slug: string): Item | undefined => {
  return sampleItems.find(item => generateSlug(item.name) === slug);
};

export const getItemById = (id: string): Item | undefined => {
  return sampleItems.find(item => item.id === id);
};
