import { Item, ItemType } from "../ItemModel";

export enum MerchSize {
    XS = "XS",
    S = "S",
    M = "M",
    L = "L",
    XL = "XL",
    XXL = "XXL",
}

export class MerchItem implements Item {
    constructor(id: string, name: string, description: string, price: number, images: string[], itemType: ItemType, createdAt: Date, availableSizes: MerchSize[], colors: string[], quantity: number, shopifyVariantId?: string) {
        this.sku = id;
        this.name = name;
        this.description = description;
        this.price = price;
        this.images = images;
        this.itemType = itemType;
        this.createdAt = createdAt;
        this.availableSizes = availableSizes;
        this.colors = colors;
        this.quantity = quantity;
        this.shopifyVariantId = shopifyVariantId;
    }

    sku: string;
    name: string;
    description: string;
    price: number;
    images: string[];
    itemType: ItemType;
    createdAt: Date;
    availableSizes: MerchSize[];
    colors: string[];
    quantity: number;
    shopifyVariantId?: string;
}
