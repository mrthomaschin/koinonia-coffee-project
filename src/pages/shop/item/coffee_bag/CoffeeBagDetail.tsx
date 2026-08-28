import React, { useState } from 'react';
import { CoffeeBagItem } from './CoffeeBagItem';
import { ItemView } from '../ItemView';
import { useCart } from '../../../../contexts/CartContext';
import { ICONS } from '../../../../util/constants';
import './CoffeeBagDetail.css';
import { ItemType } from '../ItemModel';
import { allowsUnlimitedPurchases } from '../../../../util/limitedTimeOffer';
import { SubscriptionPlan } from '../../../../models/AccountModel';

interface CoffeeBagDetailProps {
  item: CoffeeBagItem;
  onBack: () => void;
}

const CoffeeBagDetail: React.FC<CoffeeBagDetailProps> = ({ item, onBack }) => {
  const { cart, forceUpdate, showToast } = useCart();
  // Derive available weights from variants if they exist, otherwise use parent's weights
  const availableWeights = item.variants && item.variants.length > 0
    ? item.variants
      .map(v => v.weight)
      .filter((w): w is string => w !== '')
      .filter((weight, index, self) => self.indexOf(weight) === index)
      .reverse()
    : (item.weights || []);
  const [selectedWeight, setSelectedWeight] = useState<string>(availableWeights[0] || '200g');
  const [quantity, setQuantity] = useState<number>(1);
  const [purchaseMode, setPurchaseMode] = useState<'one-time' | 'subscription'>('one-time');
  const [subscriptionFrequency, setSubscriptionFrequency] = useState<'every-session' | 'every-other-session'>('every-session');

  const subscriptionPlan: SubscriptionPlan = `${quantity === 2 ? 'two-bags' : 'one-bag'}-${subscriptionFrequency}` as SubscriptionPlan;

  const handleAddToCart = () => {
    // Find the matching variant for the selected weight
    let variantSku: string | undefined = undefined;
    let variantPrice = item.price;
    let variantShippingWeight: number | undefined = undefined;

    if (item.variants && item.variants.length > 0 && selectedWeight) {
      const variant = item.variants.find(v => v.weight === selectedWeight);
      if (variant) {
        variantSku = variant.sku;
        variantPrice = variant.price > 0 ? variant.price : item.price;
        variantShippingWeight = variant.shippingWeight;
      }
    }

    const unitPrice = purchaseMode === 'subscription' ? variantPrice * 0.95 : variantPrice;
    const result = cart.addItem(item, quantity, {
      weight: selectedWeight,
      variantSku,
      variantPrice: unitPrice,
      variantShippingWeight,
      ...(purchaseMode === 'subscription' ? { subscriptionPlan } : {}),
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
      const variant = item.variants.find(v => v.weight === selectedWeight);
      if (variant && variant.price > 0) {
        return (variant.price * quantity * (purchaseMode === 'subscription' ? 0.95 : 1)).toFixed(2);
      }
    }

    // Use base price from Notion
    return (item.price * quantity * (purchaseMode === 'subscription' ? 0.95 : 1)).toFixed(2);
  };

  const getSelectedUnitPrice = (): number => {
    const selectedVariant = item.variants?.find((variant) => variant.weight === selectedWeight);
    return selectedVariant && selectedVariant.price > 0 ? selectedVariant.price : item.price;
  };

  const isSoldOut = () => {
    // If variants exist, check the selected variant's isSoldOut flag (unless LTO unlimited purchases is enabled)
    if (item.variants && item.variants.length > 0 && selectedWeight) {
      const variant = item.variants.find(v => v.weight === selectedWeight);
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
          {availableWeights.map((weight) => {
            const variant = item.variants?.find(v => v.weight === weight);
            // Only show weight if it has an active variant
            if (!variant || variant.active === false) {
              return null;
            }
            return (
              <button
                key={weight}
                className={`weight-button ${selectedWeight === weight ? 'selected' : ''}`}
                onClick={() => setSelectedWeight(weight)}
              >
                {weight}
              </button>
            );
          })}
        </div>
      </div>

      <fieldset className="subscription-options">
        <legend>Purchase option</legend>
        <div className="subscription-plan-options">
          <label className={purchaseMode === 'one-time' ? 'selected' : ''}><input type="radio" name="purchase-mode" checked={purchaseMode === 'one-time'} onChange={() => setPurchaseMode('one-time')} /><span>One-time purchase</span><strong>${getSelectedUnitPrice().toFixed(2)}</strong></label>
          <label className={purchaseMode === 'subscription' ? 'selected' : ''}><input type="radio" name="purchase-mode" checked={purchaseMode === 'subscription'} onChange={() => { setPurchaseMode('subscription'); setQuantity((current) => Math.min(2, current)); }} /><span>Subscribe &amp; save 5%</span><strong>From ${(getSelectedUnitPrice() * 0.95).toFixed(2)}</strong></label>
        </div>
        {purchaseMode === 'subscription' && <div className="subscription-frequency"><p>Select delivery frequency</p><div className="subscription-plan-options">
          <label className={subscriptionFrequency === 'every-session' ? 'selected' : ''}><input type="radio" name="subscription-frequency" checked={subscriptionFrequency === 'every-session'} onChange={() => setSubscriptionFrequency('every-session')} /><span>Every roast session</span></label>
          <label className={subscriptionFrequency === 'every-other-session' ? 'selected' : ''}><input type="radio" name="subscription-frequency" checked={subscriptionFrequency === 'every-other-session'} onChange={() => setSubscriptionFrequency('every-other-session')} /><span>Every other roast session</span></label>
        </div><p>You can skip or cancel anytime from your account.</p></div>}
      </fieldset>

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
            onClick={() => setQuantity(Math.min(purchaseMode === 'subscription' ? 2 : 99, quantity + 1))}
          >
            +
          </button>
        </div>
      </div>
    </>
  );

  const renderBrewingMethod = () => {
    if (!item.brewingMethods) {
      return null;
    }

    const brewingMethods = [
      {
        name: "Single Dripper",
        icon: <img src={ICONS.v60} alt="Single Dripper" className="brewing-icon" />,
        coffee: item.brewingMethods.singleDripper?.dose || "",
        water: item.brewingMethods.singleDripper?.yield || "",
        waterTemperature: item.brewingMethods.singleDripper?.waterTemperature || "",
        ratio: item.brewingMethods.singleDripper?.ratio || "",
        time: item.brewingMethods.singleDripper?.time || "",
        description: item.brewingMethods.singleDripper?.description || ""
      },
      {
        name: "Batch Dripper",
        icon: <img src={ICONS.chemex} alt="Batch Dripper" className="brewing-icon" />,
        coffee: item.brewingMethods.batchDripper?.dose || "",
        water: item.brewingMethods.batchDripper?.yield || "",
        waterTemperature: item.brewingMethods.batchDripper?.waterTemperature || "",
        ratio: item.brewingMethods.batchDripper?.ratio || "",
        time: item.brewingMethods.batchDripper?.time || "",
        description: item.brewingMethods.batchDripper?.description || ""
      },
      {
        name: "Espresso",
        icon: <img src={ICONS.espresso} alt="Espresso" className="brewing-icon" />,
        coffee: item.brewingMethods.espresso?.dose || "",
        water: item.brewingMethods.espresso?.yield || "",
        waterTemperature: item.brewingMethods.espresso?.waterTemperature || "",
        ratio: item.brewingMethods.espresso?.ratio || "",
        maxPressure: item.brewingMethods.espresso?.maxPressure || "",
        time: item.brewingMethods.espresso?.time || "",
        description: item.brewingMethods.espresso?.description || ""
      },
      {
        name: "Milk Drink",
        icon: <img src={ICONS.espresso} alt="Milk Drink" className="brewing-icon" />,
        coffee: item.brewingMethods.milkDrink?.dose || "",
        water: item.brewingMethods.milkDrink?.yield || "",
        waterTemperature: item.brewingMethods.milkDrink?.waterTemperature || "",
        ratio: item.brewingMethods.milkDrink?.ratio || "",
        milkRatio: item.brewingMethods.milkDrink?.milkRatio || "",
        maxPressure: item.brewingMethods.milkDrink?.maxPressure || "",
        time: item.brewingMethods.milkDrink?.time || "",
        description: item.brewingMethods.milkDrink?.description || ""
      }
    ].filter(method => method.coffee || method.water || method.ratio || method.milkRatio || method.maxPressure || method.time || method.description);

    if (brewingMethods.length === 0) {
      return null;
    }

    return (
      <div className="coffee-brew-guide">
        <div className="coffee-brew-guide-heading">
          <p className="coffee-detail-eyebrow">BREW GUIDE</p>
          <h3>Make a good cup at<br />home.</h3>
          <p>We&apos;ve included a few starting points so you can find the version of {item.name} that feels most like yours.</p>
        </div>
        <div className="coffee-brew-methods">
          {brewingMethods.map((method, index) => (
            <div key={index} className="coffee-brew-row">
              <div className="coffee-brew-method-column">
                <div className="coffee-brew-method-heading">
                  <div className="coffee-brew-method-icon">{method.icon}</div>
                  <strong>{method.name === 'Single Dripper' ? 'Pour-over' : method.name === 'Batch Dripper' ? 'Batch brew' : method.name === 'Milk Drink' ? 'Milk drink' : method.name}</strong>
                </div>
                <div className="coffee-brew-parameters">
                  {method.coffee && <span><b>COFFEE</b>{method.coffee}</span>}
                  {method.water && <span><b>WATER</b>{method.water}</span>}
                  {method.waterTemperature && <span><b>TEMPERATURE</b>{method.waterTemperature}</span>}
                  {method.ratio && <span><b>RATIO</b>{method.ratio}</span>}
                  {method.time && <span><b>TIME</b>{method.time}</span>}
                  {method.milkRatio && <span><b>MILK RATIO</b>{method.milkRatio}</span>}
                  {method.maxPressure && <span><b>MAX PRESSURE</b>{method.maxPressure}</span>}
                </div>
              </div>
              {method.description && <p className="coffee-brew-description">{method.description}</p>}
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
      hideDetailsDropdown
      renderBrewingMethod={renderBrewingMethod}
      calculatePrice={calculatePrice}
      handleAddToCart={handleAddToCart}
      isSoldOut={isSoldOut()}
    />
  );
};

export default CoffeeBagDetail;
