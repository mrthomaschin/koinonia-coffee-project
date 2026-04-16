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
}

export class MerchItem implements Item {
    constructor(id: string, name: string, description: string, price: number, image: string, category: MerchCategory, availableSizes: MerchSize[], colors: string[]) {
        this.id = id;
        this.name = name;
        this.description = description;
        this.price = price;
        this.image = image;
        this.itemType = ItemType.merch;
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

    category: MerchCategory;
    availableSizes: MerchSize[];
    colors: string[];
}
