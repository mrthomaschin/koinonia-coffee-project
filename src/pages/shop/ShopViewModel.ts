import { Item, ItemType } from './item/Item';
import { sampleItems } from './shopData';

export enum SortBy {
    NAME_A_TO_Z = 'name_a_to_z',
    NAME_Z_TO_A = 'name_z_to_a',
    PRICE_LOW_TO_HIGH = 'price_low_to_high',
    PRICE_HIGH_TO_LOW = 'price_high_to_low',
}

export enum FilterBy {
    ALL = 'all',
    BEANS = 'beans',
    MERCH = 'merch',
}

export class ShopViewModel {
    private _items: Item[];
    private _sortBy: SortBy;
    private _filterBy: FilterBy;

    constructor() {
        this._items = sampleItems;
        this._sortBy = SortBy.NAME_A_TO_Z;
        this._filterBy = FilterBy.ALL;
    }

    get items(): Item[] {
        return this._items;
    }

    get sortBy(): SortBy {
        return this._sortBy;
    }

    set sortBy(value: SortBy) {
        this._sortBy = value;
    }

    get filterBy(): FilterBy {
        return this._filterBy;
    }

    set filterBy(value: FilterBy) {
        this._filterBy = value;
    }

    get filteredAndSortedItems(): Item[] {
        const filtered = this.filterItems(this._items, this._filterBy);
        return this.sortItems(filtered, this._sortBy);
    }

    get itemCount(): number {
        return this.filteredAndSortedItems.length;
    }

    private sortItems(items: Item[], sortType: SortBy): Item[] {
        const sortedItems = [...items];
        switch (sortType) {
            case SortBy.NAME_A_TO_Z:
                return sortedItems.sort((a, b) => a.name.localeCompare(b.name));
            case SortBy.NAME_Z_TO_A:
                return sortedItems.sort((a, b) => b.name.localeCompare(a.name));
            case SortBy.PRICE_LOW_TO_HIGH:
                return sortedItems.sort((a, b) => a.price - b.price);
            case SortBy.PRICE_HIGH_TO_LOW:
                return sortedItems.sort((a, b) => b.price - a.price);
            default:
                return sortedItems;
        }
    }

    private filterItems(items: Item[], filterType: FilterBy): Item[] {
        switch (filterType) {
            case FilterBy.ALL:
                return items;
            case FilterBy.BEANS:
                return items.filter(item => item.itemType === ItemType.beans);
            case FilterBy.MERCH:
                return items.filter(item => item.itemType === ItemType.merch);
            default:
                return items;
        }
    }

    setSortBy(sortType: SortBy): void {
        this._sortBy = sortType;
    }

    setFilterBy(filterType: FilterBy): void {
        this._filterBy = filterType;
    }
}

export default ShopViewModel;