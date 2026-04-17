import React, { useState } from 'react';
import { CoffeeBagItem, CoffeeBagWeight, RoastLevel } from './CoffeeBagItem';
import { ItemDetailBase } from '../ItemDetailBase';
import './CoffeeBagDetail.css';

interface CoffeeBagDetailProps {
  item: CoffeeBagItem;
  onBack: () => void;
}

const CoffeeBagDetail: React.FC<CoffeeBagDetailProps> = ({ item, onBack }) => {
  const [selectedWeight, setSelectedWeight] = useState<CoffeeBagWeight>(item.weight);
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
    const weightMultiplier = selectedWeight / item.weight;
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
          {Object.values(CoffeeBagWeight).filter(v => typeof v === 'number').map((weight) => (
            <button
              key={weight}
              className={`weight-button ${selectedWeight === weight ? 'selected' : ''}`}
              onClick={() => setSelectedWeight(weight as CoffeeBagWeight)}
            >
              {weight}oz
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
    <ItemDetailBase
      item={item}
      onBack={onBack}
      renderMetadata={() => renderMetadata(item)}
      renderExtraInfo={() => renderExtraInfo(item)}
      renderOptions={renderOptions}
      renderPurchaseSection={renderPurchaseSection}
    />
  );
};

export default CoffeeBagDetail;
