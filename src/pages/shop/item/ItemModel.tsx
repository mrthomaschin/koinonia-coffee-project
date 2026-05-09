export enum ItemType {
    beans,
    merch,
}

export interface Item {
    id: string;
    name: string;
    description: string;
    price: number;
    image: string;
    itemType: ItemType;
    createdAt: Date;
    quantity: number;
    shopifyVariantId?: string;
}
