import { Item, ItemType } from './item/ItemModel';
import { CoffeeBagItem, CoffeeBagWeight, RoastLevel } from './item/coffee_bag/CoffeeBagItem';
import { MerchItem, MerchSize } from './item/merch/MerchItem';
import { NotionInventoryItem } from '../../services/notionService';

const mapItemType = (notionType: string): ItemType => {
  const typeMap: { [key: string]: ItemType } = {
    'Accessories': ItemType.accessories,
    'Apparel': ItemType.apparel,
    'Brew Tools': ItemType.brewTools,
    'Coffee': ItemType.coffee,
    'Drinkware': ItemType.drinkware,
    'Stickers': ItemType.stickers,
  };
  return typeMap[notionType] || ItemType.accessories;
};

const mapCoffeeBagWeight = (weightStr: string): CoffeeBagWeight | null => {
  const weightMap: { [key: string]: CoffeeBagWeight } = {
    '200g': CoffeeBagWeight._200g,
    '5lb': CoffeeBagWeight._5lb,
  };
  return weightMap[weightStr] || null;
};

const mapRoastLevel = (roastStr: string): RoastLevel => {
  const roastMap: { [key: string]: RoastLevel } = {
    'Light': RoastLevel.light,
    'Medium-Light': RoastLevel.mediumLight,
    'Medium': RoastLevel.medium,
    'Medium-Dark': RoastLevel.mediumDark,
    'Dark': RoastLevel.dark,
  };
  return roastMap[roastStr] || RoastLevel.medium;
};

const mapMerchSize = (sizeStr: string): MerchSize | null => {
  const sizeMap: { [key: string]: MerchSize } = {
    'S': MerchSize.S,
    'M': MerchSize.M,
    'L': MerchSize.L,
    'XL': MerchSize.XL,
  };
  return sizeMap[sizeStr] || null;
};

export const convertNotionItemToItem = (notionItem: NotionInventoryItem): Item | null => {
  const itemType = mapItemType(notionItem.itemType);
  const createdAt = new Date(notionItem.createdAt);
  const ltoEndDate = notionItem.ltoEndDate ? new Date(notionItem.ltoEndDate) : null;
  const ltoUnlimitedPurchases = notionItem.ltoUnlimitedPurchases || false;

  // Convert variant LTO date strings to Date objects
  const convertedVariants = notionItem.variants?.map((variant: any) => ({
    ...variant,
    ltoEndDate: variant.ltoEndDate ? new Date(variant.ltoEndDate) : null,
  }));

  if (itemType === ItemType.coffee) {
    const weights = (notionItem.weights || [])
      .map(mapCoffeeBagWeight)
      .filter((w): w is CoffeeBagWeight => w !== null);

    const roastLevel = mapRoastLevel(notionItem.roastLevel || 'Medium');

    return new CoffeeBagItem(
      notionItem.sku,
      notionItem.name,
      notionItem.description,
      notionItem.price,
      notionItem.firebaseImageUrls || [],
      createdAt,
      weights,
      roastLevel,
      notionItem.origin || '',
      notionItem.tastingNotes || [],
      notionItem.quantity,
      convertedVariants || null,
      ltoEndDate,
      ltoUnlimitedPurchases
    );
  } else {
    const sizes = (notionItem.sizes || [])
      .map(mapMerchSize)
      .filter((s): s is MerchSize => s !== null);

    return new MerchItem(
      notionItem.sku,
      notionItem.name,
      notionItem.description,
      notionItem.price,
      notionItem.firebaseImageUrls || [],
      itemType,
      createdAt,
      sizes,
      notionItem.colors || [],
      notionItem.quantity,
      convertedVariants || null,
      ltoEndDate,
      ltoUnlimitedPurchases
    );
  }
};

export const convertNotionItemsToItems = (notionItems: NotionInventoryItem[]): Item[] => {
  return notionItems
    .map(convertNotionItemToItem)
    .filter((item): item is Item => item !== null);
};
