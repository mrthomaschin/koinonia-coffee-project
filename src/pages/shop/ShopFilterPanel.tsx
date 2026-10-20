import React, { useState } from 'react';
import { SortBy, FilterBy } from './ShopViewModel';
import { Availability, FilterOptions, ShopFilters, hasActiveFilters } from './shopFilters';

interface ShopFilterPanelProps {
  filters: ShopFilters;
  options: FilterOptions;
  sortBy: SortBy;
  productCount: number;
  onFiltersChange: (filters: ShopFilters) => void;
  onSortChange: (sortBy: SortBy) => void;
  onClear: () => void;
}

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: SortBy.DEFAULT, label: 'Featured (Default)' },
  { value: SortBy.NEWEST, label: 'Newest' },
  { value: SortBy.NAME_A_TO_Z, label: 'Name (A-Z)' },
  { value: SortBy.NAME_Z_TO_A, label: 'Name (Z-A)' },
  { value: SortBy.PRICE_LOW_TO_HIGH, label: 'Price (Low to High)' },
  { value: SortBy.PRICE_HIGH_TO_LOW, label: 'Price (High to Low)' },
];

const CATEGORY_OPTIONS: { value: FilterBy; label: string }[] = [
  { value: FilterBy.ALL, label: 'All Products' },
  { value: FilterBy.BEANS, label: 'Coffee Beans' },
  { value: FilterBy.MERCH, label: 'Merch' },
];

const AVAILABILITY_OPTIONS: { value: Availability; label: string }[] = [
  { value: 'in-stock', label: 'In stock' },
  { value: 'out-of-stock', label: 'Out of stock' },
];

const Section: React.FC<{ title: string; summary?: string; defaultOpen?: boolean; children: React.ReactNode }> = ({ title, summary, defaultOpen = false, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="filter-section">
      <button type="button" className="filter-section-toggle" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <span>
          <span className="filter-section-title">{title}</span>
          {summary && <span className="filter-section-summary">{summary}</span>}
        </span>
        <span className={`filter-chevron${open ? ' filter-chevron--open' : ''}`} aria-hidden="true" />
      </button>
      <div className={`filter-section-collapse${open ? ' filter-section-collapse--open' : ''}`} aria-hidden={!open}>
        <div className="filter-section-body" {...(!open ? { inert: '' } : {})}>{children}</div>
      </div>
    </div>
  );
};

const toggle = (list: string[], value: string): string[] =>
  list.includes(value) ? list.filter(v => v !== value) : [...list, value];

const ShopFilterPanel: React.FC<ShopFilterPanelProps> = ({ filters, options, sortBy, productCount, onFiltersChange, onSortChange, onClear }) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const update = (patch: Partial<ShopFilters>) => onFiltersChange({ ...filters, ...patch });

  const checkboxGroup = (key: 'sizes' | 'roastLevels' | 'processes' | 'varietals' | 'origins' | 'flavors' | 'brewMethods', values: string[]) => (
    <ul className="filter-options">
      {values.map(value => (
        <li key={value}>
          <label className="filter-option">
            <input type="checkbox" checked={filters[key].includes(value)} onChange={() => update({ [key]: toggle(filters[key], value) })} />
            <span>{value}</span>
          </label>
        </li>
      ))}
    </ul>
  );

  const coffeeSections: { title: string; key: 'sizes' | 'roastLevels' | 'processes' | 'varietals' | 'origins' | 'flavors' | 'brewMethods'; values: string[] }[] = [
    { title: 'Size', key: 'sizes', values: options.sizes },
    { title: 'Roast Level', key: 'roastLevels', values: options.roastLevels },
    { title: 'Process', key: 'processes', values: options.processes },
    { title: 'Variety', key: 'varietals', values: options.varietals },
    { title: 'Origin', key: 'origins', values: options.origins },
    { title: 'Flavor Profile', key: 'flavors', values: options.flavors },
    { title: 'Brew Method', key: 'brewMethods', values: options.brewMethods },
  ];

  const currentSort = SORT_OPTIONS.find(o => o.value === sortBy)?.label;

  return (
    <aside className="shop-sidebar" aria-label="Filter and sort">
      <button type="button" className="shop-sidebar-mobile-toggle" aria-expanded={mobileOpen} onClick={() => setMobileOpen(o => !o)}>
        Filter &amp; Sort
        <span className={`filter-chevron${mobileOpen ? ' filter-chevron--open' : ''}`} aria-hidden="true" />
      </button>

      <div className={`shop-sidebar-inner${mobileOpen ? ' shop-sidebar-inner--open' : ''}`}>
        <h2 className="shop-sidebar-title">Filter &amp; Sort</h2>
        <div className="shop-sidebar-meta">
          <span>{productCount} {productCount === 1 ? 'Product' : 'Products'}</span>
          {hasActiveFilters(filters) && (
            <button type="button" className="shop-sidebar-clear" onClick={onClear}>Clear All Filters</button>
          )}
        </div>

        <Section title="Sort" summary={currentSort} defaultOpen>
          <ul className="filter-options">
            {SORT_OPTIONS.map(option => (
              <li key={option.value}>
                <label className="filter-option">
                  <input type="radio" name="shop-sort" checked={sortBy === option.value} onChange={() => onSortChange(option.value)} />
                  <span>{option.label}</span>
                </label>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Category" defaultOpen>
          <ul className="filter-options">
            {CATEGORY_OPTIONS.map(option => (
              <li key={option.value}>
                <label className="filter-option">
                  <input type="radio" name="shop-category" checked={filters.category === option.value} onChange={() => update({ category: option.value })} />
                  <span>{option.label}</span>
                </label>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Availability">
          <ul className="filter-options">
            {AVAILABILITY_OPTIONS.map(option => (
              <li key={option.value}>
                <label className="filter-option">
                  <input type="checkbox" checked={filters.availability.includes(option.value)} onChange={() => update({ availability: toggle(filters.availability, option.value) as Availability[] })} />
                  <span>{option.label}</span>
                </label>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Price">
          <div className="filter-price">
            <label>
              <span>Min</span>
              <input type="number" min="0" inputMode="decimal" placeholder="$0" value={filters.priceMin} onChange={e => update({ priceMin: e.target.value })} />
            </label>
            <label>
              <span>Max</span>
              <input type="number" min="0" inputMode="decimal" placeholder="Any" value={filters.priceMax} onChange={e => update({ priceMax: e.target.value })} />
            </label>
          </div>
        </Section>

        {coffeeSections.filter(section => section.values.length > 0).map(section => (
          <Section key={section.key} title={section.title}>
            {checkboxGroup(section.key, section.values)}
          </Section>
        ))}
      </div>
    </aside>
  );
};

export default ShopFilterPanel;
