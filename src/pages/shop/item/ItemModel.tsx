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
}

export interface Item {
    sku: string;
    name: string;
    itemSummary: string;
    itemDetails: string;
    price: number;
    firebaseImageUrls: string[];
    itemType: ItemType;
    createdAt: Date;
    quantity: number;
    shippingWeight?: number;
    weights?: string[];
    variants?: InventoryVariant[] | null;
    ltoEndDate?: Date | null;
    ltoUnlimitedPurchases?: boolean;
}
