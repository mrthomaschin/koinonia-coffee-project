import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Item, ItemType, isConsumerVisible } from './item/ItemModel';
import { CoffeeBagItem } from './item/coffee_bag/CoffeeBagItem';
import { MerchItem } from './item/merch/MerchItem';
import CoffeeBagPreview from './item/coffee_bag/CoffeeBagPreview';
import MerchPreview from './item/merch/MerchPreview';
import './Shop.css';
import { generateSlug } from './shopData';
import { SortBy } from './ShopViewModel';
import ShopFilterPanel from './ShopFilterPanel';
import { EMPTY_FILTERS, ShopFilters, buildFilterOptions, matchesFilters } from './shopFilters';
import { useInventory } from '../../contexts/InventoryContext';
import SEO from '../../components/SEO';

interface ShopProps {
  availableHeight: number;
}

const Shop: React.FC<ShopProps> = ({ availableHeight }) => {
  const navigate = useNavigate();
  const { items, isLoading, error } = useInventory();
  const [sortBy, setSortBy] = useState<SortBy>(SortBy.DEFAULT);
  const [filters, setFilters] = useState<ShopFilters>(EMPTY_FILTERS);

  const visibleItems = useMemo(() => items.filter(isConsumerVisible), [items]);
  const filterOptions = useMemo(() => buildFilterOptions(visibleItems), [visibleItems]);

  const sortedItems = useMemo(() => {
    const filteredItems = visibleItems.filter(item => matchesFilters(item, filters));

    // Sort items
    const sortedItems = [...filteredItems];
    switch (sortBy) {
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
        return sortedItems;
    }
  }, [visibleItems, sortBy, filters]);

  const handleClear = useCallback(() => setFilters(EMPTY_FILTERS), []);

  const handleItemClick = useCallback((item: Item) => {
    const slug = generateSlug(item.name);
    navigate(`/shop/${slug}`);
  }, [navigate]);

  if (isLoading) {
    return (
      <div className="shop-page" style={{ minHeight: availableHeight }}>
        <SEO title="Koinonia Coffee Project | All Coffee & Merch" description="Shop thoughtfully roasted coffee, apparel, and merch from Koinonia Coffee Project." path="/shop" />
        <div className="shop-header">
          <h1 className="shop-title">Products</h1>
        </div>
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '200px',
          color: '#666'
        }}>
          Loading products...
        </div>
      </div>
    );
  }

  return (
    <div className="shop-page" style={{ minHeight: availableHeight }}>
      <SEO title="Koinonia Coffee Project | All Coffee & Merch" description="Shop thoughtfully roasted coffee, apparel, and merch from Koinonia Coffee Project." path="/shop" />
      <header className="shop-header">
        <div>
          <h1 className="shop-title">Shop</h1>
        </div>
      </header>

      <div className="shop-layout">
        <ShopFilterPanel
          filters={filters}
          options={filterOptions}
          sortBy={sortBy}
          productCount={sortedItems.length}
          onFiltersChange={setFilters}
          onSortChange={setSortBy}
          onClear={handleClear}
        />
        <div className="shop-results">
          {error && (
            <div style={{
              backgroundColor: '#fff3cd',
              border: '1px solid #ffc107',
              borderRadius: '4px',
              padding: '12px 20px',
              margin: '0 0 20px',
              color: '#856404',
              fontSize: '14px'
            }}>
              ⚠️ {error}
            </div>
          )}

          <div className="shop-grid">
            {sortedItems.map((item) => {
              if (item.itemType === ItemType.coffee) {
                return (
                  <CoffeeBagPreview
                    key={item.sku}
                    item={item as CoffeeBagItem}
                    onClick={handleItemClick}
                  />
                );
              }
              return (
                <MerchPreview
                  key={item.sku}
                  item={item as MerchItem}
                  onClick={handleItemClick}
                />
              );
            })}
          </div>
          {sortedItems.length === 0 && <p className="shop-empty">No products match these filters.</p>}
        </div>
      </div>
    </div>
  );
};

export default Shop;
