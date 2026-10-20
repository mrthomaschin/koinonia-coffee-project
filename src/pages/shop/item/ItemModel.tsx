import { ContentBlock } from '../../../components/notion/types';

export enum ItemType {
    accessories,
    apparel,
    brewTools,
    coffee,
    drinkware,
    stickers,
}

export interface InventoryVariant {
    sku: string;
    size?: string;
    color?: string;
    weight?: string;
    shippingWeight?: number;
    quantity: number;
    price: number;
    isSoldOut?: boolean;
    active?: boolean;
    ltoEndDate?: Date | null;
    ltoUnlimitedPurchases?: boolean;
    isWholesale?: boolean;
}

export interface Item {
    sku: string;
    name: string;
    itemSummary: string;
    itemDetails: string;
    /** Structured "Website Description" content from the item's Notion page. */
    itemContent?: ContentBlock[] | null;
    nextRoastDate?: string | null;
    price: number;
    /** Web-sized (1600px) product images. */
    firebaseImageUrls: string[];
    /** 600px versions of firebaseImageUrls for cards and lists. */
    thumbnailUrls?: string[];
    itemType: ItemType;
    createdAt: Date;
    quantity: number;
    isWholesale?: boolean;
    shippingWeight?: number;
    weights?: string[];
    variants?: InventoryVariant[] | null;
    ltoEndDate?: Date | null;
    ltoUnlimitedPurchases?: boolean;
}

const PLACEHOLDER_IMAGE = '/assets/images/shop_placeholder.png';

/** Small image for cards and lists, falling back to the full-size image. */
export const getThumbnailUrl = (item: Item, fallback: string = PLACEHOLDER_IMAGE): string =>
    item.thumbnailUrls?.[0] || item.firebaseImageUrls?.[0] || fallback;

/** True when regular (non-wholesale) customers can buy the item. */
export const isConsumerVisible = (item: Item): boolean => {
    if (item.isWholesale) return false;
    if (!item.variants?.length) return true;
    return item.variants.some((variant) => !variant.isWholesale && !variant.sku.endsWith('-WS'));
};
