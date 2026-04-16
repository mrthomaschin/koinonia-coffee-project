import React, { useState } from 'react';
import { MerchItem, MerchSize, MerchCategory } from './MerchItem';
import ItemDetail from '../ItemDetail';
import './MerchDetail.css';

interface MerchDetailProps {
  item: MerchItem;
  onClose: () => void;
}

const MerchDetail: React.FC<MerchDetailProps> = ({ item, onClose }) => {
  const [selectedSize, setSelectedSize] = useState<MerchSize | null>(
    item.availableSizes.length > 0 ? item.availableSizes[0] : null
  );
  const [selectedColor, setSelectedColor] = useState<string>(
    item.colors.length > 0 ? item.colors[0] : ''
  );
  const [quantity, setQuantity] = useState<number>(1);

  const handleAddToCart = () => {
    console.log('Adding to cart:', {
      item: item.name,
      size: selectedSize,
      color: selectedColor,
      quantity
    });
  };

  const calculatePrice = () => {
    return (item.price * quantity).toFixed(2);
  };

  const renderMetadata = (merchItem: MerchItem) => (
    <>
      <span className="detail-category">{MerchCategory[merchItem.category]}</span>
    </>
  );

  const renderOptions = () => (
    <>
      {item.availableSizes.length > 0 && (
        <div className="detail-option-group">
          <label className="detail-option-label">Size</label>
          <div className="size-selector">
            {item.availableSizes.map((size) => (
              <button
                key={size}
                className={`size-option ${selectedSize === size ? 'active' : ''}`}
                onClick={() => setSelectedSize(size)}
              >
                {size}
              </button>
            ))}
          </div>
        </div>
      )}

      {item.colors.length > 0 && (
        <div className="detail-option-group">
          <label className="detail-option-label">Color</label>
          <div className="color-selector">
            {item.colors.map((color) => (
              <button
                key={color}
                className={`color-option ${selectedColor === color ? 'active' : ''}`}
                onClick={() => setSelectedColor(color)}
              >
                {color}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="detail-option-group">
        <label className="detail-option-label">Quantity</label>
        <div className="quantity-selector">
          <button
            className="quantity-button"
            onClick={() => setQuantity(Math.max(1, quantity - 1))}
          >
            −
          </button>
          <span className="quantity-display">{quantity}</span>
          <button
            className="quantity-button"
            onClick={() => setQuantity(quantity + 1)}
          >
            +
          </button>
        </div>
      </div>
    </>
  );

  const renderPurchaseSection = () => (
    <div className="detail-purchase">
      <div className="detail-price-section">
        <span className="detail-price-label">Total</span>
        <span className="detail-price">${calculatePrice()}</span>
      </div>
      <button className="detail-add-to-cart" onClick={handleAddToCart}>
        Add to Cart
      </button>
    </div>
  );

  return (
    <ItemDetail
      item={item}
      onClose={onClose}
      renderMetadata={() => renderMetadata(item)}
      renderOptions={renderOptions}
      renderPurchaseSection={renderPurchaseSection}
    />
  );
};

export default MerchDetail;
