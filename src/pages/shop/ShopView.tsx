import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Item, ItemType } from './item/ItemModel';
import { CoffeeBagItem } from './item/coffee_bag/CoffeeBagItem';
import { MerchItem } from './item/merch/MerchItem';
import CoffeeBagPreview from './item/coffee_bag/CoffeeBagPreview';
import MerchPreview from './item/merch/MerchPreview';
import './Shop.css';
import { generateSlug } from './shopData';
import ShopViewModel, { SortBy, FilterBy } from './ShopViewModel';

interface ShopProps {
  availableHeight: number;
}

const Shop: React.FC<ShopProps> = ({ availableHeight }) => {
  const navigate = useNavigate();
  const [viewModel] = useState(() => new ShopViewModel());
  const [sortBy, setSortBy] = useState<SortBy>(viewModel.sortBy);
  const [filterBy, setFilterBy] = useState<FilterBy>(viewModel.filterBy);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inventoryLoaded, setInventoryLoaded] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await viewModel.loadInventory();
      setIsLoading(false);
      setError(viewModel.error);
      setInventoryLoaded(true);
    };
    loadData();
  }, [viewModel]);

  const sortedItems = useMemo(() => {
    viewModel.sortBy = sortBy;
    viewModel.filterBy = filterBy;
    return viewModel.filteredAndSortedItems;
  }, [viewModel, sortBy, filterBy, inventoryLoaded]);

  const handleItemClick = (item: Item) => {
    const slug = generateSlug(item.name);
    navigate(`/shop/${slug}`);
  };

  const handleSortChange = (newSortBy: SortBy) => {
    setSortBy(newSortBy);
    viewModel.setSortBy(newSortBy);
  };

  const handleFilterChange = (newFilterBy: FilterBy) => {
    setFilterBy(newFilterBy);
    viewModel.setFilterBy(newFilterBy);
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
          minHeight: '400px',
          fontSize: '18px',
          color: '#666'
        }}>
          Loading inventory...
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
