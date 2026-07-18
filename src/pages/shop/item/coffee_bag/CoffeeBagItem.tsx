import { Item, ItemType, InventoryVariant } from "../ItemModel";

export enum CoffeeBagWeight {
    _200g = 200,
    _5lb = 5,
}

export enum RoastLevel {
    light = "Light",
    mediumLight = "Medium-Light",
    medium = "Medium",
    mediumDark = "Medium-Dark",
    dark = "Dark",
}

export class CoffeeBagItem implements Item {
    constructor(id: string, name: string, itemSummary: string, itemDetails: string, price: number, firebaseImageUrls: string[], createdAt: Date, shippingWeight: number, weights: string[], roastLevel: RoastLevel, origin: string, tastingNotes: string[], quantity: number, variants?: InventoryVariant[] | null, ltoEndDate?: Date | null, ltoUnlimitedPurchases?: boolean, brewingMethods?: any) {
        this.sku = id;
        this.name = name;
        this.itemSummary = itemSummary;
        this.itemDetails = itemDetails;
        this.price = price;
        this.firebaseImageUrls = firebaseImageUrls;
        this.itemType = ItemType.coffee;
        this.createdAt = createdAt;
        this.shippingWeight = shippingWeight;
        this.weights = weights;
        this.roastLevel = roastLevel;
        this.origin = origin;
        this.tastingNotes = tastingNotes;
        this.quantity = quantity;
        this.variants = variants || null;
        this.ltoEndDate = ltoEndDate || null;
        this.ltoUnlimitedPurchases = ltoUnlimitedPurchases || false;
        this.brewingMethods = brewingMethods || null;
    }

    sku: string;
    name: string;
    itemSummary: string;
    itemDetails: string;
    price: number;
    firebaseImageUrls: string[];
    itemType: ItemType;
    createdAt: Date;

    shippingWeight?: number;
    weights: string[];
    roastLevel: RoastLevel;
    origin: string;
    tastingNotes: string[];
    quantity: number;
    variants?: InventoryVariant[] | null;
    ltoEndDate?: Date | null;
    ltoUnlimitedPurchases?: boolean;
    brewingMethods?: any;
}
