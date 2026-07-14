export enum ItemType {
    apparel,
    drinkware,
    accessories,
    stickers,
    coffee,
    brewTools,
}

export interface InventoryVariant {
    sku: string;
    size?: string;
    color?: string;
    weight?: string;
    quantity: number;
    price: number;
}

export interface Item {
    sku: string;
    name: string;
    description: string;
    price: number;
    images: string[];
    itemType: ItemType;
    createdAt: Date;
    quantity: number;
    variants?: InventoryVariant[] | null;
}
