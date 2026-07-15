import React, { useState } from 'react';
import { createLogger } from '../../../../util/logger';
import { MerchItem, MerchSize } from './MerchItem';
import { ItemView } from '../ItemView';
import { useCart } from '../../../../contexts/CartContext';
import './MerchDetail.css';
import { ItemType } from '../ItemModel';

interface MerchDetailProps {
  item: MerchItem;
  onBack: () => void;
}

const logger = createLogger('MerchDetail');

const MerchDetail: React.FC<MerchDetailProps> = ({ item, onBack }) => {
  const { cart, forceUpdate, showToast } = useCart();
  const [selectedSize, setSelectedSize] = useState<MerchSize | null>(
    item.availableSizes.length > 0 ? item.availableSizes[0] : null
  );
  const [selectedColor, setSelectedColor] = useState<string>(
    item.colors.length > 0 ? item.colors[0] : ''
  );
  const [quantity, setQuantity] = useState<number>(1);

  const handleAddToCart = () => {
    const size = selectedSize ? MerchSize[selectedSize] : undefined;
    const color = selectedColor || undefined;

    // Find the matching variant for the selected size/color
    let variantSku = item.sku;
    let variantPrice = item.price;

    if (item.variants && item.variants.length > 0) {
      const variant = item.variants.find(v => {
        const sizeMatch = !size || v.size === size;
        const colorMatch = !color || v.color === color;
        return sizeMatch && colorMatch;
      });
      if (variant) {
        variantSku = variant.sku;
        variantPrice = variant.price > 0 ? variant.price : item.price;
      }
    }

    const result = cart.addItem(item, quantity, {
      size,
      color,
      variantSku,
      variantPrice
    });
    forceUpdate();

    if (result.success) {
      showToast(result.message, 'success');
    } else {
      showToast(result.message, 'error');
    }
  };

  const calculatePrice = () => {
    return (item.price * quantity).toFixed(2);
  };

  const isSoldOut = () => {
    // If variants exist, check the selected variant's isSoldOut flag
    if (item.variants && item.variants.length > 0) {
      const size = selectedSize ? MerchSize[selectedSize] : undefined;
      const color = selectedColor || undefined;
      logger.log('Merch isSoldOut check:', {
        itemName: item.name,
        selectedSize,
        selectedColor,
        sizeMatch: size,
        colorMatch: color,
        allVariants: item.variants
      });
      const variant = item.variants.find(v => {
        const sizeMatch = !size || v.size === size;
        const colorMatch = !color || v.color === color;
        return sizeMatch && colorMatch;
      });
      logger.log('Found variant:', variant);
      if (variant) {
        return variant.isSoldOut === true;
      }
    }

    // Fall back to overall item quantity
    return item.quantity === 0;
  };

  const renderMetadata = (merchItem: MerchItem) => (
    <>
      <span className="category-badge">{ItemType[merchItem.itemType]}</span>
    </>
  );

  const renderOptions = () => (
    <>
      {item.availableSizes.length > 0 && (
        <div className="option-group">
          <label className="option-label">Size</label>
          <div className="size-options">
            {item.availableSizes.map((size) => (
              <button
                key={size}
                className={`size-button ${selectedSize === size ? 'selected' : ''}`}
                onClick={() => setSelectedSize(size)}
              >
                {size}
              </button>
            ))}
          </div>
        </div>
      )}

      {item.colors.length > 0 && (
        <div className="option-group">
          <label className="option-label">Color</label>
          <div className="color-options">
            {item.colors.map((color) => (
              <button
                key={color}
                className={`color-button ${selectedColor === color ? 'selected' : ''}`}
                onClick={() => setSelectedColor(color)}
              >
                {color}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="option-group">
        <label className="option-label">Quantity</label>
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

  return (
    <ItemView
      item={item}
      onBack={onBack}
      renderMetadata={() => renderMetadata(item)}
      renderOptions={renderOptions}
      calculatePrice={calculatePrice}
      handleAddToCart={handleAddToCart}
      isSoldOut={isSoldOut()}
    />
  );
};

export default MerchDetail;
