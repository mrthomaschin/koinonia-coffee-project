import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Item, ItemType } from './item/ItemModel';
import { CoffeeBagItem } from './item/coffee_bag/CoffeeBagItem';
import { MerchItem } from './item/merch/MerchItem';
import CoffeeBagPreview from './item/coffee_bag/CoffeeBagPreview';
import MerchPreview from './item/merch/MerchPreview';
import './Shop.css';
import { generateSlug } from './shopData';
import { SortBy, FilterBy } from './ShopViewModel';
import { useInventory } from '../../contexts/InventoryContext';

interface ShopProps {
  availableHeight: number;
}

const Shop: React.FC<ShopProps> = ({ availableHeight }) => {
  const navigate = useNavigate();
  const { items, isLoading, error } = useInventory();
  const [sortBy, setSortBy] = useState<SortBy>(SortBy.DEFAULT);
  const [filterBy, setFilterBy] = useState<FilterBy>(FilterBy.ALL);

  const sortedItems = useMemo(() => {
    // Filter items
    let filteredItems = items;
    switch (filterBy) {
      case FilterBy.BEANS:
        filteredItems = items.filter(item => item.itemType === ItemType.coffee);
        break;
      case FilterBy.MERCH:
        filteredItems = items.filter(item =>
          item.itemType === ItemType.accessories ||
          item.itemType === ItemType.apparel ||
          item.itemType === ItemType.brewTools ||
          item.itemType === ItemType.drinkware ||
          item.itemType === ItemType.stickers
        );
        break;
      default:
        filteredItems = items;
    }

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
  }, [items, sortBy, filterBy]);

  const handleItemClick = (item: Item) => {
    const slug = generateSlug(item.name);
    navigate(`/shop/${slug}`);
  };

  const handleSortChange = (newSortBy: SortBy) => {
    setSortBy(newSortBy);
  };

  const handleFilterChange = (newFilterBy: FilterBy) => {
    setFilterBy(newFilterBy);
  };

  if (isLoading) {
    return (
      <div className="shop-page" style={{ minHeight: availableHeight }}>
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
      <div className="shop-header">
        <h1 className="shop-title">Products</h1>
      </div>

      {error && (
        <div style={{
          backgroundColor: '#fff3cd',
          border: '1px solid #ffc107',
          borderRadius: '4px',
          padding: '12px 20px',
          margin: '0 20px 20px 20px',
          color: '#856404',
          fontSize: '14px'
        }}>
          ⚠️ {error}
        </div>
      )}

      <div className="shop-controls">
        <div className="control-group">
          <label htmlFor="filter-select" className="control-label">FILTER:</label>
          <select
            id="filter-select"
            className="control-dropdown"
            value={filterBy}
            onChange={(e) => handleFilterChange(e.target.value as FilterBy)}
          >
            <option value={FilterBy.ALL}>ALL PRODUCTS</option>
            <option value={FilterBy.BEANS}>COFFEE BEANS</option>
            <option value={FilterBy.MERCH}>MERCH</option>
          </select>
        </div>

        <div className="control-group">
          <label htmlFor="sort-select" className="control-label">SORT BY:</label>
          <select
            id="sort-select"
            className="control-dropdown"
            value={sortBy}
            onChange={(e) => handleSortChange(e.target.value as SortBy)}
          >
            <option value={SortBy.DEFAULT}>DEFAULT</option>
            <option value={SortBy.NAME_A_TO_Z}>NAME (A-Z)</option>
            <option value={SortBy.NEWEST}>NEWEST</option>
            <option value={SortBy.NAME_Z_TO_A}>NAME (Z-A)</option>
            <option value={SortBy.PRICE_LOW_TO_HIGH}>PRICE (LOW TO HIGH)</option>
            <option value={SortBy.PRICE_HIGH_TO_LOW}>PRICE (HIGH TO LOW)</option>
          </select>
        </div>

        <div className="products-total">
          <span className="products-count">{sortedItems.length} PRODUCTS</span>
        </div>
      </div>

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
    </div>
  );
};

export default Shop;
