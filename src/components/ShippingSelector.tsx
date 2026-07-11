import React, { useState } from 'react';
import './ShippingSelector.css';

export interface ShippingOption {
  id: string;
  label: string;
  price: number;
  description?: string;
}

interface ShippingSelectorProps {
  onShippingChange: (option: ShippingOption) => void;
  selectedShipping?: ShippingOption;
}

const SHIPPING_OPTIONS: ShippingOption[] = [
  {
    id: 'local-pickup',
    label: 'Local Pickup',
    price: 0,
    description: 'Pick up at our location - Free'
  },
  {
    id: 'standard',
    label: 'Standard Shipping',
    price: 8.99,
    description: '5-7 business days'
  },
  {
    id: 'express',
    label: 'Express Shipping',
    price: 15.99,
    description: '2-3 business days'
  },
  {
    id: 'overnight',
    label: 'Overnight Shipping',
    price: 24.99,
    description: 'Next business day'
  }
];

const ShippingSelector: React.FC<ShippingSelectorProps> = ({ 
  onShippingChange, 
  selectedShipping 
}) => {
  const [selected, setSelected] = useState<ShippingOption>(
    selectedShipping || SHIPPING_OPTIONS[1] // Default to standard shipping
  );

  const handleSelect = (option: ShippingOption) => {
    setSelected(option);
    onShippingChange(option);
  };

  return (
    <div className="shipping-selector">
      <h3 className="shipping-title">Shipping Method</h3>
      <div className="shipping-options">
        {SHIPPING_OPTIONS.map((option) => (
          <div
            key={option.id}
            className={`shipping-option ${selected.id === option.id ? 'selected' : ''}`}
            onClick={() => handleSelect(option)}
          >
            <div className="shipping-option-content">
              <div className="shipping-radio">
                <input
                  type="radio"
                  name="shipping"
                  checked={selected.id === option.id}
                  onChange={() => handleSelect(option)}
                />
              </div>
              <div className="shipping-details">
                <div className="shipping-label">{option.label}</div>
                {option.description && (
                  <div className="shipping-description">{option.description}</div>
                )}
              </div>
              <div className="shipping-price">
                {option.price === 0 ? 'FREE' : `$${option.price.toFixed(2)}`}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ShippingSelector;
export { SHIPPING_OPTIONS };
