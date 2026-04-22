import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Item, ItemType } from './item/Item';
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

  const sortedItems = useMemo(() => {
    viewModel.sortBy = sortBy;
    viewModel.filterBy = filterBy;
    return viewModel.filteredAndSortedItems;
  }, [viewModel, sortBy, filterBy]);

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

  return (
    <div className="shop-page" style={{ minHeight: availableHeight }}>
      <div className="shop-header">
        <h1 className="shop-title">Products</h1>
      </div>

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
          if (item.itemType === ItemType.beans) {
            return (
              <CoffeeBagPreview
                key={item.id}
                item={item as CoffeeBagItem}
                onClick={handleItemClick}
              />
            );
          } else if (item.itemType === ItemType.merch) {
            return (
              <MerchPreview
                key={item.id}
                item={item as MerchItem}
                onClick={handleItemClick}
              />
            );
          }
          return null;
        })}
      </div>
    </div>
  );
};

export default Shop;
