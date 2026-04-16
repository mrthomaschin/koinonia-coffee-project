import { Item, ItemType } from "../Item";

export enum CoffeeBagWeight {
    _12oz = 12,
    _16oz = 16,
    _24oz = 24,
}

export enum RoastLevel {
    light,
    medium,
    dark,
}

export class CoffeeBagItem implements Item {
    constructor(id: string, name: string, description: string, price: number, image: string, weight: CoffeeBagWeight, roastLevel: RoastLevel, origin: string, tastingNotes: string[]) {
        this.id = id;
        this.name = name;
        this.description = description;
        this.price = price;
        this.image = image;
        this.itemType = ItemType.beans;
        this.weight = weight;
        this.roastLevel = roastLevel;
        this.origin = origin;
        this.tastingNotes = tastingNotes;
    }

    id: string;
    name: string;
    description: string;
    price: number;
    image: string;
    itemType: ItemType;

    weight: CoffeeBagWeight;
    roastLevel: RoastLevel;
    origin: string;
    tastingNotes: string[];
}
