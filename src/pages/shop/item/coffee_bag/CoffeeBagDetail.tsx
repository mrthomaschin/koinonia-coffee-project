import React, { useState } from 'react';
import { CoffeeBagItem, CoffeeBagWeight } from './CoffeeBagItem';
import { ItemView } from '../ItemView';
import { useCart } from '../../../../contexts/CartContext';
import { getCoffeeDataById } from './CoffeeData';
import './CoffeeBagDetail.css';
import { ItemType } from '../ItemModel';

interface CoffeeBagDetailProps {
  item: CoffeeBagItem;
  onBack: () => void;
}

const CoffeeBagDetail: React.FC<CoffeeBagDetailProps> = ({ item, onBack }) => {
  const { cart, forceUpdate, showToast } = useCart();
  const [selectedWeight, setSelectedWeight] = useState<CoffeeBagWeight>(item.weight[0]);
  const [quantity, setQuantity] = useState<number>(1);

  const handleAddToCart = () => {
    const result = cart.addItem(item, quantity, { weight: selectedWeight });
    forceUpdate();

    if (result.success) {
      showToast(result.message, 'success');
    } else {
      showToast(result.message, 'error');
    }
  };

  const calculatePrice = () => {
    const basePrice = item.price;
    const weightMultiplier = selectedWeight / item.weight[0];
    return (basePrice * weightMultiplier * quantity).toFixed(2);
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
    const coffeeData = getCoffeeDataById(item.id);

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
    />
  );
};

export default CoffeeBagDetail;
