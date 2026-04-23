import React, { useState } from 'react';
import { CoffeeBagItem, CoffeeBagWeight, RoastLevel } from './CoffeeBagItem';
import { ItemDetailBase } from '../ItemDetail';
import './CoffeeBagDetail.css';

interface CoffeeBagDetailProps {
  item: CoffeeBagItem;
  onBack: () => void;
}

const CoffeeBagDetail: React.FC<CoffeeBagDetailProps> = ({ item, onBack }) => {
  const [selectedWeight, setSelectedWeight] = useState<CoffeeBagWeight>(item.weight[0]);
  const [quantity, setQuantity] = useState<number>(1);

  const handleAddToCart = () => {
    console.log('Adding to cart:', {
      item: item.name,
      weight: selectedWeight,
      quantity
    });
  };

  const calculatePrice = () => {
    const basePrice = item.price;
    const weightMultiplier = selectedWeight / item.weight[0];
    return (basePrice * weightMultiplier * quantity).toFixed(2);
  };

  const renderMetadata = (coffeeItem: CoffeeBagItem) => (
    <>
      <span className="roast-badge">{RoastLevel[coffeeItem.roastLevel]} roast</span>
      <span className="origin-text">{coffeeItem.origin}</span>
    </>
  );

  const renderExtraInfo = (coffeeItem: CoffeeBagItem) => (
    <>
      {coffeeItem.tastingNotes && coffeeItem.tastingNotes.length > 0 && (
        <div className="flavor-notes">
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
          {Object.values(CoffeeBagWeight).filter(v => typeof v === 'number' && item.weight.includes(v)).map((weight) => (
            <button
              key={weight}
              className={`weight-button ${selectedWeight === weight ? 'selected' : ''}`}
              onClick={() => setSelectedWeight(weight as CoffeeBagWeight)}
            >
              {weight}{(() => {
                switch (weight) {
                  case CoffeeBagWeight._12oz:
                    return 'oz';
                  case CoffeeBagWeight._16oz:
                    return 'oz';
                  case CoffeeBagWeight._24oz:
                    return 'oz';
                  case CoffeeBagWeight._200g:
                    return 'g';
                  case CoffeeBagWeight._5lb:
                    return 'lb';
                  default:
                    return '';
                }
              })()}
            </button>
          ))}
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
    return (
      <div className="brewing-method">
        <h3>Brewing Method</h3>
      </div>
    );
  };

  return (
    <ItemDetailBase
      item={item}
      onBack={onBack}
      renderMetadata={() => renderMetadata(item)}
      renderExtraInfo={() => renderExtraInfo(item)}
      renderOptions={renderOptions}
      renderBrewingMethod={renderBrewingMethod}
      calculatePrice={calculatePrice}
      handleAddToCart={handleAddToCart}
    />
  );
};

export default CoffeeBagDetail;
