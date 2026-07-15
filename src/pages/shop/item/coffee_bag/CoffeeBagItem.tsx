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
    constructor(id: string, name: string, description: string, price: number, createdAt: Date, weight: CoffeeBagWeight[], roastLevel: RoastLevel, origin: string, tastingNotes: string[], quantity: number, variants?: InventoryVariant[] | null) {
        this.sku = id;
        this.name = name;
        this.description = description;
        this.price = price;
        this.itemType = ItemType.coffee;
        this.createdAt = createdAt;
        this.weight = weight;
        this.roastLevel = roastLevel;
        this.origin = origin;
        this.tastingNotes = tastingNotes;
        this.quantity = quantity;
        this.variants = variants || null;
    }

    sku: string;
    name: string;
    description: string;
    price: number;
    itemType: ItemType;
    createdAt: Date;

    weight: CoffeeBagWeight[];
    roastLevel: RoastLevel;
    origin: string;
    tastingNotes: string[];
    quantity: number;
    variants?: InventoryVariant[] | null;
}
