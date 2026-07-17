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
    description: string;
    price: number;
    firebaseImageUrls: string[];
    itemType: ItemType;
    createdAt: Date;
    quantity: number;
    variants?: InventoryVariant[] | null;
    ltoEndDate?: Date | null;
    ltoUnlimitedPurchases?: boolean;
}
