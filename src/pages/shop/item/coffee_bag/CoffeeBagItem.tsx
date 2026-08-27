import { Item, ItemType, InventoryVariant } from "../ItemModel";

export class CoffeeBagItem implements Item {
    constructor(id: string, name: string, itemSummary: string, itemDetails: string, price: number, firebaseImageUrls: string[], createdAt: Date, shippingWeight: number, weights: string[], roastLevel: string, origin: string, tastingNotes: string[], quantity: number, variants?: InventoryVariant[] | null, ltoEndDate?: Date | null, ltoUnlimitedPurchases?: boolean, brewingMethods?: any, nextRoastDate?: string | null) {
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
        this.nextRoastDate = nextRoastDate || null;
    }

    sku: string;
    name: string;
    itemSummary: string;
    itemDetails: string;
    nextRoastDate?: string | null;
    price: number;
    firebaseImageUrls: string[];
    itemType: ItemType;
    createdAt: Date;

    shippingWeight?: number;
    weights: string[];
    roastLevel: string;
    origin: string;
    tastingNotes: string[];
    quantity: number;
    variants?: InventoryVariant[] | null;
    ltoEndDate?: Date | null;
    ltoUnlimitedPurchases?: boolean;
    brewingMethods?: any;
}
