import { Item, ItemType } from "../Item";

export enum MerchSize {
    XS = "XS",
    S = "S",
    M = "M",
    L = "L",
    XL = "XL",
    XXL = "XXL",
}

export enum MerchCategory {
    apparel,
    drinkware,
    accessories,
    stickers,
}

export class MerchItem implements Item {
    constructor(id: string, name: string, description: string, price: number, image: string, category: MerchCategory, createdAt: Date, availableSizes: MerchSize[], colors: string[]) {
        this.id = id;
        this.name = name;
        this.description = description;
        this.price = price;
        this.image = image;
        this.itemType = ItemType.merch;
        this.createdAt = createdAt;
        this.category = category;
        this.availableSizes = availableSizes;
        this.colors = colors;
    }

    id: string;
    name: string;
    description: string;
    price: number;
    image: string;
    itemType: ItemType;
    createdAt: Date;

    category: MerchCategory;
    availableSizes: MerchSize[];
    colors: string[];
}
