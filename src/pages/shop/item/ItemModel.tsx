export enum ItemType {
    apparel,
    drinkware,
    accessories,
    stickers,
    coffee,
}

export interface Item {
    id: string;
    name: string;
    description: string;
    price: number;
    images: string[];
    itemType: ItemType;
    createdAt: Date;
    quantity: number;
    shopifyVariantId?: string;
}
