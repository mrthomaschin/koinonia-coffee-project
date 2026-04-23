import { Item, ItemType } from "../Item";

export enum CoffeeBagWeight {
    _12oz = 12,
    _16oz = 16,
    _24oz = 24,
    _200g = 200,
    _5lb = 5,
}

export enum RoastLevel {
    light,
    mediumLight,
    medium,
    mediumDark,
    dark,
}

export class CoffeeBagItem implements Item {
    constructor(id: string, name: string, description: string, price: number, image: string, createdAt: Date, weight: CoffeeBagWeight[], roastLevel: RoastLevel, origin: string, tastingNotes: string[], quantity: number) {
        this.id = id;
        this.name = name;
        this.description = description;
        this.price = price;
        this.image = image;
        this.itemType = ItemType.beans;
        this.createdAt = createdAt;
        this.weight = weight;
        this.roastLevel = roastLevel;
        this.origin = origin;
        this.tastingNotes = tastingNotes;
        this.quantity = quantity;
    }

    id: string;
    name: string;
    description: string;
    price: number;
    image: string;
    itemType: ItemType;
    createdAt: Date;

    weight: CoffeeBagWeight[];
    roastLevel: RoastLevel;
    origin: string;
    tastingNotes: string[];
    quantity: number;
}
