import React from 'react';
import { Item, ItemType } from './ItemModel';
import { useItemDetailViewModel } from './ItemViewModel';
import { CoffeeBagItem } from './coffee_bag/CoffeeBagItem';
import { MerchItem } from './merch/MerchItem';
import CoffeeBagDetail from './coffee_bag/CoffeeBagDetail';
import MerchDetail from './merch/MerchDetail';
import './ItemView.css';
import { useCart } from '../../../contexts/CartContext';

interface ItemViewProps {
  availableHeight?: number;
  item?: Item;
  onBack?: () => void;
  renderMetadata?: (item: Item) => React.ReactNode;
  renderExtraInfo?: (item: Item) => React.ReactNode;
  renderOptions?: (item: Item) => React.ReactNode;
  renderDetailsSection?: (item: Item) => React.ReactNode;
  renderBrewingMethod?: (item: Item) => React.ReactNode;
  calculatePrice?: () => string;
  handleAddToCart?: () => void;
}

export const ItemView: React.FC<ItemViewProps> = ({
  availableHeight,
  item: itemProp,
  onBack: onBackProp,
  renderMetadata,
  renderExtraInfo,
  renderOptions,
  renderDetailsSection,
  renderBrewingMethod,
  calculatePrice,
  handleAddToCart,
}) => {
  const { cart } = useCart();
  const {
    item: viewModelItem,
    handleBack: viewModelHandleBack,
    isDetailsDropdownOpen,
    isBrewingMethodDropdownOpen,
    toggleDetailsDropdown,
    toggleBrewingMethodDropdown,
    defaultCalculatePrice,
    defaultHandleAddToCart,
  } = useItemDetailViewModel(itemProp, cart);

  const item = itemProp || viewModelItem;
  const onBack = onBackProp || viewModelHandleBack;

  if (!item) {
    return (
      <div className="shop-page" style={{ minHeight: availableHeight }}>
        <div className="shop-header">
          <h1 className="shop-title">Item Not Found</h1>
          <button onClick={onBack} className="back-button">
            Back to Shop
          </button>
        </div>
      </div>
    );
  }

  if (!itemProp && availableHeight !== undefined) {
    return (
      <div className="shop-item-page" style={{ minHeight: availableHeight }}>
        {item.itemType === ItemType.beans && (
          <CoffeeBagDetail item={item as CoffeeBagItem} onBack={onBack} />
        )}
        {item.itemType === ItemType.merch && (
          <MerchDetail item={item as MerchItem} onBack={onBack} />
        )}
      </div>
    );
  }

  return (
    <div className="item-detail-page-wrapper">
      <button className="detail-back-button" onClick={onBack}>
        ← BACK TO SHOP
      </button>

      <div className="detail-container">
        <div className="detail-image-section">
          <img
            src={item.image}
            alt={item.name}
            className="detail-image"
          />
        </div>

        <div className="detail-info-section">
          <div className="detail-header">
            <h1 className="detail-name">{item.name}</h1>
            {renderMetadata && (
              <div className="detail-meta">
                {renderMetadata(item)}
              </div>
            )}
          </div>

          <p className="detail-description">{item.description}</p>

          {renderExtraInfo && renderExtraInfo(item)}

          {renderOptions && (
            <div className="detail-options">
              {renderOptions(item)}
            </div>
          )}

          <div className="detail-purchase">
            <div className="detail-price-section">
              <span className="detail-price-label">Price</span>
              <span className="detail-price">${(calculatePrice || defaultCalculatePrice)()}</span>
            </div>
            <button
              className={`detail-add-to-cart ${item.quantity === 0 ? 'out-of-stock' : ''}`}
              onClick={handleAddToCart || defaultHandleAddToCart}
            >
              {item.quantity > 0 ? 'Add to Cart' : 'Out of Stock'}
            </button>
          </div>
        </div>
      </div>
      <div className="item-detail-dropdown">
        <button
          className="dropdown-toggle"
          onClick={toggleDetailsDropdown}
        >
          <h2>DETAILS</h2>
          <span className={`dropdown-arrow ${isDetailsDropdownOpen ? 'open' : ''}`}>▼</span>
        </button>
        <div className={`dropdown-content ${isDetailsDropdownOpen ? 'open' : ''}`}>
          {renderDetailsSection ? renderDetailsSection(item) : <p>More details about this item will be displayed here.</p>}
        </div>
      </div>
      {renderBrewingMethod && <div className="item-detail-dropdown">
        <button
          className="dropdown-toggle"
          onClick={toggleBrewingMethodDropdown}
        >
          <h2>BREWING METHOD</h2>
          <span className={`dropdown-arrow ${isBrewingMethodDropdownOpen ? 'open' : ''}`}>▼</span>
        </button>
        <div className={`dropdown-content ${isBrewingMethodDropdownOpen ? 'open' : ''}`}>
          {renderBrewingMethod(item)}
        </div>
      </div>}
    </div>
  );
};

export default ItemView;
