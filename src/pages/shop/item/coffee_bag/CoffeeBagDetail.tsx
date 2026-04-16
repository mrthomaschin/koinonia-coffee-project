import React, { useState } from 'react';
import { CoffeeBagItem, CoffeeBagWeight, RoastLevel } from './CoffeeBagItem';
import ItemDetail from '../ItemDetail';
import './CoffeeBagDetail.css';

interface CoffeeBagDetailProps {
  item: CoffeeBagItem;
  onClose: () => void;
}

const CoffeeBagDetail: React.FC<CoffeeBagDetailProps> = ({ item, onClose }) => {
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
      <span className="detail-origin">{coffeeItem.origin}</span>
      <span className="detail-separator">•</span>
      <span className="detail-roast">{RoastLevel[coffeeItem.roastLevel]} roast</span>
    </>
  );

  const renderExtraInfo = (coffeeItem: CoffeeBagItem) => (
    <>
      {coffeeItem.tastingNotes && coffeeItem.tastingNotes.length > 0 && (
        <div className="detail-tasting-section">
          <h3 className="detail-section-title">Tasting Notes</h3>
          <div className="detail-tasting-notes">
            {coffeeItem.tastingNotes.map((note, index) => (
              <span key={index} className="detail-tasting-note">{note}</span>
            ))}
          </div>
        </div>
      )}
    </>
  );

  const renderOptions = () => (
    <>
      <div className="detail-option-group">
        <label className="detail-option-label">Weight</label>
        <div className="weight-selector">
          {Object.values(CoffeeBagWeight).filter(v => typeof v === 'number').map((weight) => (
            <button
              key={weight}
              className={`weight-option ${selectedWeight === weight ? 'active' : ''}`}
              onClick={() => setSelectedWeight(weight as CoffeeBagWeight)}
            >
              {weight}oz
            </button>
          ))}
        </div>
      </div>

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
      renderExtraInfo={() => renderExtraInfo(item)}
      renderOptions={renderOptions}
      renderPurchaseSection={renderPurchaseSection}
    />
  );
};

export default CoffeeBagDetail;
