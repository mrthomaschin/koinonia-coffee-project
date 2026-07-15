import React, { useState, useEffect } from 'react';
import './ShippingSelector.css';

export interface ShippingOption {
  id: string;
  label: string;
  price: number;
  description?: string;
  carrier?: string;
  service?: string;
}

interface ShippingSelectorProps {
  onShippingChange: (option: ShippingOption) => void;
  selectedShipping?: ShippingOption;
  shippingOptions?: ShippingOption[];
  isLoading?: boolean;
  showShippingOptions?: boolean;
}

const DEFAULT_SHIPPING_OPTIONS: ShippingOption[] = [
  {
    id: 'local-pickup',
    label: 'Local Pickup',
    price: 0,
    description: 'Pick up at our location - Free'
  },
];

const ShippingSelector: React.FC<ShippingSelectorProps> = ({
  onShippingChange,
  selectedShipping,
  shippingOptions,
  isLoading = false,
  showShippingOptions = true
}) => {
  const options = shippingOptions || DEFAULT_SHIPPING_OPTIONS;
  const [selected, setSelected] = useState<ShippingOption>(
    selectedShipping || options[1] // Default to second option (or first if only one)
  );

  useEffect(() => {
    if (selectedShipping) {
      setSelected(selectedShipping);
    }
  }, [selectedShipping]);

  useEffect(() => {
    // Reset selection when options change
    if (options.length > 0 && !options.find(opt => opt.id === selected.id)) {
      setSelected(options[0]);
      onShippingChange(options[0]);
    }
  }, [options, selected.id, onShippingChange]);

  const handleSelect = (option: ShippingOption) => {
    setSelected(option);
    onShippingChange(option);
  };

  return (
    <div className="shipping-selector">
      <h3 className="shipping-title">Shipping Method</h3>
      {!showShippingOptions ? (
        <div className="loading-shipping">Enter your shipping address to see shipping options</div>
      ) : isLoading ? (
        <div className="loading-shipping">Loading shipping options...</div>
      ) : (
        <div className="shipping-options">
          {options.map((option: ShippingOption) => (
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
      )}
    </div>
  );
};

export default ShippingSelector;
export { DEFAULT_SHIPPING_OPTIONS };
