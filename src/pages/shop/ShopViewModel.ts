import { Item, ItemType } from './item/ItemModel';
import { sampleItems, setGlobalItems } from './shopData';
import { notionService } from '../../services/notionService';
import { convertNotionItemsToItems } from './notionItemMapper';

export enum SortBy {
    DEFAULT = 'default',
    NEWEST = 'newest',
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
    private _isLoading: boolean;
    private _error: string | null;
    private _useNotion: boolean;

    constructor(useNotion: boolean = true) {
        this._items = [];
        this._sortBy = SortBy.DEFAULT;
        this._filterBy = FilterBy.ALL;
        this._isLoading = false;
        this._error = null;
        this._useNotion = useNotion;
    }

    async loadInventory(): Promise<void> {
        if (!this._useNotion) {
            this._items = sampleItems;
            return;
        }

        this._isLoading = true;
        this._error = null;

        try {
            const notionItems = await notionService.getInventory();
            this._items = convertNotionItemsToItems(notionItems);

            // Register items globally so item detail pages can find them
            setGlobalItems(this._items);
        } catch (error) {
            console.error('Failed to load inventory from Notion, falling back to sample data:', error);
            this._error = 'Failed to load inventory. Using sample data.';
            this._items = sampleItems;
            setGlobalItems(sampleItems);
        } finally {
            this._isLoading = false;
        }
    }

    get isLoading(): boolean {
        return this._isLoading;
    }

    get error(): string | null {
        return this._error;
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
            case SortBy.NEWEST:
                return sortedItems.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
            case SortBy.NAME_A_TO_Z:
                return sortedItems.sort((a, b) => a.name.localeCompare(b.name));
            case SortBy.NAME_Z_TO_A:
                return sortedItems.sort((a, b) => b.name.localeCompare(a.name));
            case SortBy.PRICE_LOW_TO_HIGH:
                return sortedItems.sort((a, b) => a.price - b.price);
            case SortBy.PRICE_HIGH_TO_LOW:
                return sortedItems.sort((a, b) => b.price - a.price);
            default:
                // Keep original order from Notion (sorted by Index property)
                return sortedItems;
        }
    }

    private filterItems(items: Item[], filterType: FilterBy): Item[] {
        switch (filterType) {
            case FilterBy.ALL:
                return items;
            case FilterBy.BEANS:
                return items.filter(item => item.itemType === ItemType.coffee);
            case FilterBy.MERCH:
                return items.filter(item =>
                    item.itemType === ItemType.apparel ||
                    item.itemType === ItemType.drinkware ||
                    item.itemType === ItemType.accessories ||
                    item.itemType === ItemType.stickers ||
                    item.itemType === ItemType.brewTools
                );
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