import { Item, ItemType, InventoryVariant } from "../ItemModel";

export enum MerchSize {
    S = "S",
    M = "M",
    L = "L",
    XL = "XL",
}

export class MerchItem implements Item {
    constructor(id: string, name: string, description: string, price: number, firebaseImageUrls: string[], itemType: ItemType, createdAt: Date, availableSizes: MerchSize[], colors: string[], quantity: number, variants?: InventoryVariant[] | null, ltoEndDate?: Date | null, ltoUnlimitedPurchases?: boolean) {
        this.sku = id;
        this.name = name;
        this.description = description;
        this.price = price;
        this.firebaseImageUrls = firebaseImageUrls;
        this.itemType = itemType;
        this.createdAt = createdAt;
        this.availableSizes = availableSizes;
        this.colors = colors;
        this.quantity = quantity;
        this.variants = variants || null;
        this.ltoEndDate = ltoEndDate || null;
        this.ltoUnlimitedPurchases = ltoUnlimitedPurchases || false;
    }

    sku: string;
    name: string;
    description: string;
    price: number;
    firebaseImageUrls: string[];
    itemType: ItemType;
    createdAt: Date;
    availableSizes: MerchSize[];
    colors: string[];
    quantity: number;
    variants?: InventoryVariant[] | null;
    ltoEndDate?: Date | null;
    ltoUnlimitedPurchases?: boolean;
}
