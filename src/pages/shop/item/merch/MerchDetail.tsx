import React, { useState } from 'react';
import { MerchItem, MerchSize } from './MerchItem';
import { ItemView } from '../ItemView';
import { useCart } from '../../../../contexts/CartContext';
import './MerchDetail.css';
import { ItemType } from '../ItemModel';
import { allowsUnlimitedPurchases } from '../../../../util/limitedTimeOffer';

interface MerchDetailProps {
  item: MerchItem;
  onBack: () => void;
}

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

      const variant = item.variants.find(v => {
        const sizeMatch = !size || v.size === size;
        const colorMatch = !color || v.color === color;
        return sizeMatch && colorMatch;
      });

      if (variant) {
        // Check if variant is explicitly sold out OR has quantity of 0 (unless LTO unlimited purchases is enabled)
        return (variant.isSoldOut === true || variant.quantity === 0) && !allowsUnlimitedPurchases(item);
      }

      // If no matching variant found, check if ANY variant is available (unless LTO unlimited purchases is enabled)
      const hasAvailableVariant = item.variants.some(v =>
        v.isSoldOut !== true && v.quantity > 0
      );
      return !hasAvailableVariant && !allowsUnlimitedPurchases(item);
    }

    // Fall back to overall item quantity (unless LTO unlimited purchases is enabled)
    return item.quantity === 0 && !allowsUnlimitedPurchases(item);
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
            {item.availableSizes.map((size) => {
              const sizeStr = MerchSize[size];
              const variant = item.variants?.find(v => v.size === sizeStr);
              if (variant?.active === false) {
                return null;
              }
              return (
                <button
                  key={size}
                  className={`size-button ${selectedSize === size ? 'selected' : ''}`}
                  onClick={() => setSelectedSize(size)}
                >
                  {size}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {item.colors.length > 0 && (
        <div className="option-group">
          <label className="option-label">Color</label>
          <div className="color-options">
            {item.colors.map((color) => {
              const variant = item.variants?.find(v => v.color === color);
              if (variant?.active === false) {
                return null;
              }
              return (
                <button
                  key={color}
                  className={`color-button ${selectedColor === color ? 'selected' : ''}`}
                  onClick={() => setSelectedColor(color)}
                >
                  {color}
                </button>
              );
            })}
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
