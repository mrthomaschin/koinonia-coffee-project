import { Item, ItemType } from './item/ItemModel';
import { CoffeeBagItem } from './item/coffee_bag/CoffeeBagItem';
import { FilterBy } from './ShopViewModel';

export type Availability = 'in-stock' | 'out-of-stock';

export interface ShopFilters {
  category: FilterBy;
  availability: Availability[];
  priceMin: string;
  priceMax: string;
  sizes: string[];
  roastLevels: string[];
  processes: string[];
  varietals: string[];
  origins: string[];
  flavors: string[];
  brewMethods: string[];
}

export const EMPTY_FILTERS: ShopFilters = {
  category: FilterBy.ALL,
  availability: [],
  priceMin: '',
  priceMax: '',
  sizes: [],
  roastLevels: [],
  processes: [],
  varietals: [],
  origins: [],
  flavors: [],
  brewMethods: [],
};

const BREW_METHOD_LABELS: Record<string, string> = {
  singleDripper: 'Single Dripper',
  batchDripper: 'Batch Brewer',
  espresso: 'Espresso',
};

const ROAST_ORDER = ['light', 'medium', 'dark'];

export const isMerch = (item: Item): boolean => item.itemType !== ItemType.coffee;

const asCoffee = (item: Item): CoffeeBagItem | null =>
  item.itemType === ItemType.coffee ? (item as CoffeeBagItem) : null;

export const isInStock = (item: Item): boolean => {
  if (item.variants?.length) return item.variants.some(v => v.quantity > 0 && !v.isSoldOut);
  return item.quantity > 0;
};

export const getSizes = (item: Item): string[] => {
  const sizes = new Set<string>(item.weights || []);
  item.variants?.forEach(v => {
    if (v.weight) sizes.add(v.weight);
    if (v.size) sizes.add(v.size);
  });
  return Array.from(sizes);
};

export const getBrewMethods = (item: Item): string[] => {
  const methods = asCoffee(item)?.brewingMethods;
  if (!methods) return [];
  return Object.keys(BREW_METHOD_LABELS).filter(key => {
    const method = methods[key];
    return method && Object.values(method).some(value => typeof value === 'string' && value.trim() !== '');
  }).map(key => BREW_METHOD_LABELS[key]);
};

const normalize = (value: string): string => (value || '').trim().toLowerCase();

const overlaps = (selected: string[], values: string[]): boolean => {
  if (selected.length === 0) return true;
  const available = new Set(values.map(normalize));
  return selected.some(option => available.has(normalize(option)));
};

export const matchesFilters = (item: Item, filters: ShopFilters): boolean => {
  const coffee = asCoffee(item);

  if (filters.category === FilterBy.BEANS && !coffee) return false;
  if (filters.category === FilterBy.MERCH && coffee) return false;

  if (filters.availability.length > 0) {
    const status: Availability = isInStock(item) ? 'in-stock' : 'out-of-stock';
    if (!filters.availability.includes(status)) return false;
  }

  const min = parseFloat(filters.priceMin);
  const max = parseFloat(filters.priceMax);
  if (!isNaN(min) && item.price < min) return false;
  if (!isNaN(max) && item.price > max) return false;

  if (!overlaps(filters.sizes, getSizes(item))) return false;
  if (!overlaps(filters.roastLevels, coffee ? [coffee.roastLevel] : [])) return false;
  if (!overlaps(filters.processes, coffee?.process || [])) return false;
  if (!overlaps(filters.varietals, coffee?.varietals || [])) return false;
  if (!overlaps(filters.origins, coffee?.origins || [])) return false;
  if (!overlaps(filters.flavors, coffee?.tastingNotes || [])) return false;
  if (!overlaps(filters.brewMethods, getBrewMethods(item))) return false;

  return true;
};

export const hasActiveFilters = (filters: ShopFilters): boolean =>
  filters.category !== FilterBy.ALL ||
  filters.priceMin !== '' ||
  filters.priceMax !== '' ||
  [filters.availability, filters.sizes, filters.roastLevels, filters.processes, filters.varietals, filters.origins, filters.flavors, filters.brewMethods]
    .some(group => group.length > 0);

const uniqueSorted = (values: string[], compare?: (a: string, b: string) => number): string[] => {
  const byKey = new Map<string, string>();
  values.forEach(value => {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    if (trimmed && !byKey.has(normalize(trimmed))) byKey.set(normalize(trimmed), trimmed);
  });
  return Array.from(byKey.values()).sort(compare || ((a, b) => a.localeCompare(b)));
};

export interface FilterOptions {
  sizes: string[];
  roastLevels: string[];
  processes: string[];
  varietals: string[];
  origins: string[];
  flavors: string[];
  brewMethods: string[];
}

/** Builds the available filter choices from the items currently for sale. */
export const buildFilterOptions = (items: Item[]): FilterOptions => {
  const coffees = items.map(asCoffee).filter((c): c is CoffeeBagItem => c !== null);
  const roastRank = (value: string): number => {
    const index = ROAST_ORDER.findIndex(r => normalize(value).includes(r));
    return index === -1 ? ROAST_ORDER.length : index;
  };
  return {
    sizes: uniqueSorted(items.flatMap(getSizes), (a, b) => a.localeCompare(b, undefined, { numeric: true })),
    roastLevels: uniqueSorted(coffees.map(c => c.roastLevel), (a, b) => roastRank(a) - roastRank(b) || a.localeCompare(b)),
    processes: uniqueSorted(coffees.flatMap(c => c.process || [])),
    varietals: uniqueSorted(coffees.flatMap(c => c.varietals || [])),
    origins: uniqueSorted(coffees.flatMap(c => c.origins || [])),
    flavors: uniqueSorted(coffees.flatMap(c => c.tastingNotes || [])),
    brewMethods: Object.values(BREW_METHOD_LABELS).filter(label => items.some(item => getBrewMethods(item).includes(label))),
  };
};
