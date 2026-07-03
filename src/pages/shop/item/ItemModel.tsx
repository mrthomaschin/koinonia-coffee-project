export enum ItemType {
    beans,
    merch,
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
