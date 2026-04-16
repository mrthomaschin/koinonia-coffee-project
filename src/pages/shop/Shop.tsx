import React, { useState } from 'react';
import { CoffeeBagItem, CoffeeBagWeight, RoastLevel } from './item/coffee_bag/CoffeeBagItem';
import { MerchItem, MerchSize, MerchCategory } from './item/merch/MerchItem';
import { Item, ItemType } from './item/Item';
import CoffeeBagPreview from './item/coffee_bag/CoffeeBagPreview';
import CoffeeBagDetail from './item/coffee_bag/CoffeeBagDetail';
import MerchPreview from './item/merch/MerchPreview';
import MerchDetail from './item/merch/MerchDetail';
import './Shop.css';

interface ShopProps {
  availableHeight: number;
}

enum SortBy {
  NAME_A_TO_Z = 'name_a_to_z',
  NAME_Z_TO_A = 'name_z_to_a',
  PRICE_LOW_TO_HIGH = 'price_low_to_high',
  PRICE_HIGH_TO_LOW = 'price_high_to_low',
}

enum FilterBy {
  ALL = 'all',
  BEANS = 'beans',
  MERCH = 'merch',
}

const Shop: React.FC<ShopProps> = ({ availableHeight }) => {
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>(SortBy.NAME_A_TO_Z);
  const [filterBy, setFilterBy] = useState<FilterBy>(FilterBy.ALL);

  const sampleItems: Item[] = [
    new CoffeeBagItem(
      '1',
      'Ethiopian Yirgacheffe',
      'A bright and floral coffee with notes of bergamot and jasmine. Grown in the highlands of Yirgacheffe, this coffee showcases the unique terroir of Ethiopia.',
      18.99,
      '/assets/images/coffee-bag-1.jpg',
      CoffeeBagWeight._12oz,
      RoastLevel.light,
      'Ethiopia',
      ['Bergamot', 'Jasmine', 'Citrus']
    ),
    new CoffeeBagItem(
      '2',
      'Colombian Supremo',
      'A well-balanced medium roast with chocolate and caramel notes. Sourced from smallholder farmers in the Colombian highlands.',
      16.99,
      '/assets/images/coffee-bag-2.jpg',
      CoffeeBagWeight._12oz,
      RoastLevel.medium,
      'Colombia',
      ['Chocolate', 'Caramel', 'Nutty']
    ),
    new CoffeeBagItem(
      '3',
      'Sumatra Mandheling',
      'A bold and earthy dark roast with notes of cedar and dark chocolate. Perfect for those who enjoy a full-bodied cup.',
      17.99,
      '/assets/images/coffee-bag-3.jpg',
      CoffeeBagWeight._12oz,
      RoastLevel.dark,
      'Indonesia',
      ['Cedar', 'Dark Chocolate', 'Earthy']
    ),
    new MerchItem(
      '4',
      'Koinonia Coffee T-Shirt',
      'Premium cotton t-shirt with our signature logo. Comfortable and stylish for everyday wear.',
      24.99,
      '/assets/images/merch-tshirt.jpg',
      MerchCategory.apparel,
      [MerchSize.S, MerchSize.M, MerchSize.L, MerchSize.XL],
      ['Black', 'White', 'Brown']
    ),
    new MerchItem(
      '5',
      'Ceramic Coffee Mug',
      'Handcrafted ceramic mug perfect for your morning brew. Holds 12oz of your favorite coffee.',
      16.99,
      '/assets/images/merch-mug.jpg',
      MerchCategory.drinkware,
      [],
      ['White', 'Brown', 'Navy']
    ),
  ];

  const handleItemClick = (item: Item) => {
    setSelectedItem(item);
  };

  const handleCloseDetail = () => {
    setSelectedItem(null);
  };

  const sortItems = (items: Item[], sortType: SortBy): Item[] => {
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
  };

  const filterItems = (items: Item[], filterType: FilterBy): Item[] => {
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
  };

  const filteredItems = filterItems(sampleItems, filterBy);
  const sortedItems = sortItems(filteredItems, sortBy);

  return (
    <div className="shop-page" style={{ minHeight: availableHeight }}>
      <div className="shop-header">
        <h1 className="shop-title">Products</h1>
      </div>

      <div className="shop-controls">
        <div className="control-group">
          <label htmlFor="filter-select" className="control-label">Filter:</label>
          <select
            id="filter-select"
            className="control-dropdown"
            value={filterBy}
            onChange={(e) => setFilterBy(e.target.value as FilterBy)}
          >
            <option value={FilterBy.ALL}>All Products</option>
            <option value={FilterBy.BEANS}>Coffee Beans</option>
            <option value={FilterBy.MERCH}>Merchandise</option>
          </select>
        </div>

        <div className="control-group">
          <label htmlFor="sort-select" className="control-label">Sort by:</label>
          <select
            id="sort-select"
            className="control-dropdown"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
          >
            <option value={SortBy.NAME_A_TO_Z}>Name (A-Z)</option>
            <option value={SortBy.NAME_Z_TO_A}>Name (Z-A)</option>
            <option value={SortBy.PRICE_LOW_TO_HIGH}>Price (Low to High)</option>
            <option value={SortBy.PRICE_HIGH_TO_LOW}>Price (High to Low)</option>
          </select>
        </div>

        <div className="products-total">
          <span className="products-count">{sortedItems.length} products</span>
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

      {selectedItem && selectedItem.itemType === ItemType.beans && (
        <CoffeeBagDetail
          item={selectedItem as CoffeeBagItem}
          onClose={handleCloseDetail}
        />
      )}

      {selectedItem && selectedItem.itemType === ItemType.merch && (
        <MerchDetail
          item={selectedItem as MerchItem}
          onClose={handleCloseDetail}
        />
      )}
    </div>
  );
};

export default Shop;
