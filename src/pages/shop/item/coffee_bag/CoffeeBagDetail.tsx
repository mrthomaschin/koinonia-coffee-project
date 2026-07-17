import React, { useState } from 'react';
import { CoffeeBagItem, CoffeeBagWeight } from './CoffeeBagItem';
import { ItemView } from '../ItemView';
import { useCart } from '../../../../contexts/CartContext';
import { getCoffeeDataById } from './CoffeeData';
import './CoffeeBagDetail.css';
import { ItemType } from '../ItemModel';
import { allowsUnlimitedPurchases } from '../../../../util/limitedTimeOffer';

interface CoffeeBagDetailProps {
  item: CoffeeBagItem;
  onBack: () => void;
}

const CoffeeBagDetail: React.FC<CoffeeBagDetailProps> = ({ item, onBack }) => {
  const { cart, forceUpdate, showToast } = useCart();
  const [selectedWeight, setSelectedWeight] = useState<CoffeeBagWeight>(item.weight[0]);
  const [quantity, setQuantity] = useState<number>(1);

  const handleAddToCart = () => {
    // Find the matching variant for the selected weight
    let variantSku = item.sku;
    let variantPrice = item.price;

    if (item.variants && item.variants.length > 0 && selectedWeight) {
      const weightStr = selectedWeight === CoffeeBagWeight._200g ? '200g' : '5lb';
      const variant = item.variants.find(v => v.weight === weightStr);
      if (variant) {
        variantSku = variant.sku;
        variantPrice = variant.price > 0 ? variant.price : item.price;
      }
    }

    const result = cart.addItem(item, quantity, {
      weight: selectedWeight,
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
    // If variants exist, use variant price
    if (item.variants && item.variants.length > 0 && selectedWeight) {
      const weightStr = selectedWeight === CoffeeBagWeight._200g ? '200g' : '5lb';
      const variant = item.variants.find(v => v.weight === weightStr);
      if (variant && variant.price > 0) {
        return (variant.price * quantity).toFixed(2);
      }
    }

    // Use base price from Notion
    return (item.price * quantity).toFixed(2);
  };

  const isSoldOut = () => {
    // If variants exist, check the selected variant's isSoldOut flag (unless LTO unlimited purchases is enabled)
    if (item.variants && item.variants.length > 0 && selectedWeight) {
      const weightStr = selectedWeight === CoffeeBagWeight._200g ? '200g' : '5lb';
      const variant = item.variants.find(v => v.weight === weightStr);
      if (variant) {
        return variant.isSoldOut === true && !allowsUnlimitedPurchases(item);
      }
    }

    // Fall back to overall item quantity (unless LTO unlimited purchases is enabled)
    return item.quantity === 0 && !allowsUnlimitedPurchases(item);
  };

  const renderMetadata = (coffeeItem: CoffeeBagItem) => (
    <>
      <span className="category-badge">{ItemType[coffeeItem.itemType]}</span>
      <span className="origin-text">{coffeeItem.origin}</span>
    </>
  );

  const renderExtraInfo = (coffeeItem: CoffeeBagItem) => (
    <>
      {coffeeItem.tastingNotes && coffeeItem.tastingNotes.length > 0 && (
        <div className="flavor-notes">
          <h3>Roast Level</h3>
          <div className="flavor-tags" style={{ marginBottom: '1rem' }}>
            <span key={coffeeItem.roastLevel} className="flavor-tag">{coffeeItem.roastLevel}</span>
          </div>
          <h3>Tasting Notes</h3>
          <div className="flavor-tags">
            {coffeeItem.tastingNotes.map((note, index) => (
              <span key={index} className="flavor-tag">{note}</span>
            ))}
          </div>
        </div>
      )}
    </>
  );

  const renderOptions = () => (
    <>
      <div className="option-group">
        <label className="option-label">Weight</label>
        <div className="weight-options">
          {Object.values(CoffeeBagWeight).filter(v => typeof v === 'number' && item.weight.includes(v)).map((weight) => {
            const weightStr = weight === CoffeeBagWeight._200g ? '200g' : '5lb';
            const variant = item.variants?.find(v => v.weight === weightStr);
            // Only show weight if it has an active variant
            if (!variant || variant.active === false) {
              return null;
            }
            return (
              <button
                key={weight}
                className={`weight-button ${selectedWeight === weight ? 'selected' : ''}`}
                onClick={() => setSelectedWeight(weight as CoffeeBagWeight)}
              >
                {weight}{(() => {
                  switch (weight) {
                    case CoffeeBagWeight._200g:
                      return 'g';
                    case CoffeeBagWeight._5lb:
                      return 'lb';
                    default:
                      return '';
                  }
                })()}
              </button>
            );
          })}
        </div>
      </div>

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

  const renderBrewingMethod = () => {
    const coffeeData = getCoffeeDataById(item.sku);

    if (!coffeeData || !coffeeData.brewingMethods || coffeeData.brewingMethods.length === 0) {
      return null;
    }

    const brewingMethods = coffeeData.brewingMethods.map(method => ({
      name: method.name,
      icon: <img src={method.icon} alt={method.name} className="brewing-icon" />,
      coffee: method.coffee,
      water: method.water,
      ratio: method.ratio,
      time: method.time,
      description: method.description
    }));

    return (
      <div className="brewing-methods-section">
        <div className="brewing-methods-grid">
          {brewingMethods.map((method, index) => (
            <div key={index} className="brewing-method-card">
              <div className="brewing-method-icon">
                {method.icon}
              </div>
              <h4 className="brewing-method-name">{method.name}</h4>
              <div className="brewing-recipe">
                <div className="recipe-row">
                  <span className="recipe-label">Coffee:</span>
                  <span className="recipe-value">{method.coffee}</span>
                </div>
                <div className="recipe-row">
                  <span className="recipe-label">Water:</span>
                  <span className="recipe-value">{method.water}</span>
                </div>
                <div className="recipe-row">
                  <span className="recipe-label">Ratio:</span>
                  <span className="recipe-value">{method.ratio}</span>
                </div>
                <div className="recipe-row">
                  <span className="recipe-label">Time:</span>
                  <span className="recipe-value">{method.time}</span>
                </div>
              </div>
              <p className="brewing-description">{method.description}</p>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <ItemView
      item={item}
      onBack={onBack}
      renderMetadata={() => renderMetadata(item)}
      renderExtraInfo={() => renderExtraInfo(item)}
      renderOptions={renderOptions}
      renderBrewingMethod={renderBrewingMethod}
      calculatePrice={calculatePrice}
      handleAddToCart={handleAddToCart}
      isSoldOut={isSoldOut()}
    />
  );
};

export default CoffeeBagDetail;
