import { Item, ItemType } from './item/ItemModel';
import { CoffeeBagItem } from './item/coffee_bag/CoffeeBagItem';
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
  const isWholesale = notionItem.isWholesale || false;

  // Convert variant LTO date strings to Date objects
  const convertedVariants = notionItem.variants?.map((variant: any) => ({
    ...variant,
    isWholesale: variant.isWholesale || false,
    ltoEndDate: variant.ltoEndDate ? new Date(variant.ltoEndDate) : null,
  }));

  if (itemType === ItemType.coffee) {
    // Shipping weight is a number (grams) from Notion, fallback to 0 if not present
    const shippingWeight = notionItem.shippingWeight || 0;
    const weights = notionItem.weights || [];
    const roastLevel = notionItem.roastLevel || 'Medium';

    const item = new CoffeeBagItem(
      notionItem.sku,
      notionItem.name,
      notionItem.itemSummary || '',
      notionItem.itemDetails,
      notionItem.price,
      notionItem.firebaseImageUrls || [],
      createdAt,
      shippingWeight,
      weights,
      roastLevel,
      notionItem.origin || '',
      notionItem.tastingNotes || [],
      notionItem.quantity,
      convertedVariants || null,
      ltoEndDate,
      ltoUnlimitedPurchases,
      notionItem.brewingMethods,
      notionItem.nextRoastDate
    );
    item.isWholesale = isWholesale;
    return item;
  } else {
    const sizes = (notionItem.sizes || [])
      .map(mapMerchSize)
      .filter((s): s is MerchSize => s !== null);

    return new MerchItem(
      notionItem.sku,
      notionItem.name,
      notionItem.itemSummary || '',
      notionItem.itemDetails,
      notionItem.price,
      notionItem.firebaseImageUrls || [],
      itemType,
      createdAt,
      sizes,
      notionItem.colors || [],
      notionItem.quantity,
      convertedVariants || null,
      ltoEndDate,
      ltoUnlimitedPurchases,
      notionItem.shippingWeight
    );
  }
};

export const convertNotionItemsToItems = (notionItems: NotionInventoryItem[]): Item[] => {
  return notionItems
    .map(convertNotionItemToItem)
    .filter((item): item is Item => item !== null);
};
