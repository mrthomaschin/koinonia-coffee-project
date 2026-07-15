import React, { useState, useEffect } from 'react';
import { Elements, PaymentElement, useStripe, useElements, AddressElement } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import ShippingSelector, { ShippingOption, DEFAULT_SHIPPING_OPTIONS } from './ShippingSelector';
import { mapEasyPostRates, filterAllowedServices } from '../util/EasyPostMapper';
import { EasyPostRate } from '../models/ShippingModels';
import './EmbeddedCheckout.css';

const stripePromise = loadStripe(process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY || '');
const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';

interface CheckoutFormProps {
  onSuccess: (paymentIntentId?: string, email?: string, name?: string, phone?: string) => void;
  onCancel: () => void;
  totalAmount: number;
  onShippingChange: (option: ShippingOption) => void;
  selectedShipping: ShippingOption;
  onAddressChange?: (address: any) => void;
}

const CheckoutForm: React.FC<CheckoutFormProps> = ({
  onSuccess,
  onCancel,
  totalAmount,
  onShippingChange,
  selectedShipping,
  onAddressChange
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [shippingOptions, setShippingOptions] = useState<ShippingOption[]>(DEFAULT_SHIPPING_OPTIONS);
  const [isLoadingShipping, setIsLoadingShipping] = useState(false);
  const [shippingAddressComplete, setShippingAddressComplete] = useState(false);
  const [deliveryMethod, setDeliveryMethod] = useState<'pickup' | 'shipping'>('pickup');
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(null);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
    };
  }, [debounceTimer]);

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validatePhone = (phone: string): boolean => {
    // Remove all non-digit characters for validation
    const digitsOnly = phone.replace(/\D/g, '');
    // Accept 10 or 11 digits (with or without country code)
    return digitsOnly.length >= 10 && digitsOnly.length <= 11;
  };

  const validateAddress = (address: any): boolean => {
    // Basic address validation
    if (!address) return false;

    const street1 = address.line1 || address.street1;
    const city = address.city;
    const state = address.state;
    const zip = address.postal_code || address.zip;
    const country = address.country;

    // Check required fields
    if (!street1 || street1.trim().length < 3) return false;
    if (!city || city.trim().length < 2) return false;
    if (!state || state.trim().length < 2) return false;
    if (!zip || zip.trim().length < 5) return false;
    if (!country || country.trim().length < 2) return false;

    // Basic zip code validation for US
    if (country === 'US' || country === 'USA') {
      const zipPattern = /^\d{5}(-\d{4})?$/;
      if (!zipPattern.test(zip)) return false;
    }

    // Basic state code validation for US
    if (country === 'US' || country === 'USA') {
      const statePattern = /^[A-Z]{2}$/;
      if (!statePattern.test(state.toUpperCase())) return false;
    }

    return true;
  };

  const fetchShippingRatesFromEasyPost = async (address: any) => {
    if (!address || !address.line1 || !address.city || !address.state || !address.postal_code || !address.country) {
      return;
    }

    setIsLoadingShipping(true);
    try {
      const toAddress = {
        street1: address.line1,
        street2: address.line2 || '',
        city: address.city,
        state: address.state,
        zip: address.postal_code,
        country: address.country,
        name: customerName || undefined,
        phone: customerPhone || undefined,
        email: customerEmail || undefined,
      };

      console.log('Fetching shipping rates with address:', toAddress);

      const response = await fetch(`${backendUrl}/get-shipping-rates`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ toAddress }),
      });

      console.log('Response status:', response.status);
      console.log('Response ok:', response.ok);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error response:', errorText);
        throw new Error(`Failed to fetch shipping rates: ${errorText}`);
      }

      const data = await response.json();
      console.log('Shipping rates data:', data);

      // Filter rates by allowed services using EasyPostMapper
      const filteredRates = filterAllowedServices(data.rates as EasyPostRate[]);

      // Map filtered rates using EasyPostMapper
      const mappedRates = mapEasyPostRates(filteredRates);

      // Convert mapped rates to ShippingOption format
      const options: ShippingOption[] = mappedRates.map((mappedRate) => ({
        id: mappedRate.id,
        label: `${mappedRate.carrier} ${mappedRate.displayService}`,
        price: parseFloat(mappedRate.price.replace('$', '')),
        description: `Estimated delivery: ${mappedRate.estimatedDelivery}`,
        carrier: mappedRate.carrier,
        service: mappedRate.service,
      }));

      setShippingOptions(options);

      // Select the first option by default
      if (options.length > 0) {
        onShippingChange(options[0]);
      }
    } catch (error) {
      console.error('Error fetching shipping rates:', error);
      // On error, show no shipping options
      setShippingOptions([]);
    } finally {
      setIsLoadingShipping(false);
    }
  };

  const handleAddressChange = async (event: any) => {
    const addressData = event.value;
    console.log('Address changed:', addressData);
    console.log('Event complete:', event.complete);
    console.log('Event value complete:', addressData?.complete);

    // Stripe's AddressElement should provide complete property
    // Try multiple ways to access it
    const isComplete = event.complete || addressData?.complete;
    console.log('Is complete:', isComplete);

    if (isComplete) {
      console.log('Setting shippingAddressComplete to true');
      setShippingAddressComplete(true);

      // Validate the address before fetching rates
      const address = addressData?.address || addressData;
      const isAddressValid = validateAddress(address);

      if (!isAddressValid) {
        console.log('Address validation failed, showing no shipping options');
        setShippingOptions([]);
        setIsLoadingShipping(false);
        return;
      }

      // Clear shipping options and show loading while waiting for API
      setShippingOptions([]);
      setIsLoadingShipping(true);

      // Clear any existing debounce timer
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      // Set new debounce timer to fetch rates after 2 seconds
      const timer = setTimeout(async () => {
        await fetchShippingRatesFromEasyPost(address);
      }, 2000);

      setDebounceTimer(timer);
    } else {
      console.log('Setting shippingAddressComplete to false');
      setShippingAddressComplete(false);
      // Clear any pending fetch if address becomes incomplete
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        setDebounceTimer(null);
      }
      // Reset to default options when address is incomplete
      setShippingOptions(DEFAULT_SHIPPING_OPTIONS);
      setIsLoadingShipping(false);
    }

    if (onAddressChange) {
      onAddressChange(addressData);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate email
    if (!customerEmail || !validateEmail(customerEmail)) {
      setEmailError('Please enter a valid email address');
      return;
    }

    if (!customerName.trim()) {
      setErrorMessage('Please enter your name');
      return;
    }

    if (!customerPhone || !validatePhone(customerPhone)) {
      setPhoneError('Please enter a valid phone number');
      return;
    }

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    setEmailError(null);
    setPhoneError(null);

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/order-confirmation`,
          receipt_email: customerEmail,
        },
        redirect: 'if_required',
      });

      if (error) {
        setErrorMessage(error.message || 'An error occurred');
        setIsProcessing(false);
      } else {
        onSuccess(paymentIntent?.id, customerEmail, customerName, customerPhone);
      }
    } catch (err) {
      setErrorMessage('Payment failed. Please try again.');
      setIsProcessing(false);
    }
  };

  const displayTotal = totalAmount + selectedShipping.price;

  return (
    <form onSubmit={handleSubmit} className="embedded-checkout-form">
      <button
        type="button"
        onClick={onCancel}
        className="close-btn"
        aria-label="Close checkout"
      >
        ×
      </button>
      <div className="checkout-header">
        <h2>Complete Your Purchase</h2>
        <div className="checkout-totals">
          <div className="subtotal-row">
            <span>Subtotal:</span>
            <span>${totalAmount.toFixed(2)}</span>
          </div>
          <div className="shipping-row">
            <span>Shipping:</span>
            <span>{selectedShipping.price === 0 ? 'FREE' : `$${selectedShipping.price.toFixed(2)}`}</span>
          </div>
          <div className="total-row">
            <span>Total:</span>
            <span className="total-amount">${displayTotal.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div className="customer-info-section">
        <h3>Contact Information</h3>
        <div className="form-group">
          <label htmlFor="customer-name">Full Name *</label>
          <input
            type="text"
            id="customer-name"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="John Doe"
            required
            className="form-input"
          />
        </div>
        <div className="form-group">
          <label htmlFor="customer-email">Email Address *</label>
          <input
            type="email"
            id="customer-email"
            value={customerEmail}
            onChange={(e) => {
              setCustomerEmail(e.target.value);
              setEmailError(null);
            }}
            placeholder="john@example.com"
            required
            className={`form-input ${emailError ? 'error' : ''}`}
          />
          {emailError && <div className="field-error">{emailError}</div>}
          <p className="field-hint">Order confirmation will be sent to this email</p>
        </div>
        <div className="form-group">
          <label htmlFor="customer-phone">Phone Number *</label>
          <input
            type="tel"
            id="customer-phone"
            value={customerPhone}
            onChange={(e) => {
              setCustomerPhone(e.target.value);
              setPhoneError(null);
            }}
            placeholder="(555) 123-4567"
            required
            className={`form-input ${phoneError ? 'error' : ''}`}
          />
          {phoneError && <div className="field-error">{phoneError}</div>}
          <p className="field-hint">For shipping updates and order notifications</p>
        </div>
      </div>

      <div className="form-group">
        <label>Delivery Method *</label>
        <div className="delivery-method-options">
          <div
            className={`delivery-method-option ${deliveryMethod === 'pickup' ? 'selected' : ''}`}
            onClick={() => {
              setDeliveryMethod('pickup');
              onShippingChange({ id: 'local-pickup', label: 'Local Pickup', price: 0, description: 'Pick up at our location - Free' });
            }}
          >
            <span>Local Pickup</span>
          </div>
          <div
            className={`delivery-method-option ${deliveryMethod === 'shipping' ? 'selected' : ''}`}
            onClick={() => {
              setDeliveryMethod('shipping');
            }}
          >
            <span>Shipping</span>
          </div>
        </div>
      </div>

      <div className={`shipping-sections-container ${deliveryMethod === 'shipping' ? 'expanded' : 'collapsed'}`}>
        <div className="address-section">
          <h3>Shipping Address</h3>
          <AddressElement
            options={{ mode: 'shipping' }}
            onChange={handleAddressChange}
          />
        </div>

        <ShippingSelector
          onShippingChange={onShippingChange}
          selectedShipping={selectedShipping}
          shippingOptions={shippingOptions}
          isLoading={isLoadingShipping}
          showShippingOptions={shippingAddressComplete}
        />
      </div>

      <div className="address-section">
        <h3>Billing Address</h3>
        <AddressElement options={{ mode: 'billing' }} />
      </div>

      <PaymentElement
        options={{
          fields: {
            billingDetails: {
              address: 'never',
            }
          }
        }}
      />

      {errorMessage && (
        <div className="error-message">
          {errorMessage}
        </div>
      )}

      <div className="checkout-actions">
        <button
          type="button"
          onClick={onCancel}
          className="cancel-btn"
          disabled={isProcessing}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!stripe || isProcessing}
          className="pay-btn"
        >
          {isProcessing ? 'Processing...' : `Pay $${displayTotal.toFixed(2)}`}
        </button>
      </div>
    </form>
  );
};

interface EmbeddedCheckoutProps {
  clientSecret: string;
  totalAmount: number;
  onSuccess: (paymentIntentId?: string, shippingOption?: ShippingOption, email?: string, name?: string, phone?: string) => void;
  onCancel: () => void;
}

const EmbeddedCheckout: React.FC<EmbeddedCheckoutProps> = ({
  clientSecret,
  totalAmount,
  onSuccess,
  onCancel,
}) => {
  const [selectedShipping, setSelectedShipping] = useState<ShippingOption>(
    DEFAULT_SHIPPING_OPTIONS[1] // Default to standard shipping
  );

  const handleShippingChange = (option: ShippingOption) => {
    setSelectedShipping(option);
  };

  const handleAddressChange = (address: any) => {
    // Handle address change if needed for parent component
    console.log('Address changed:', address);
  };

  const handleSuccess = (paymentIntentId?: string, email?: string, name?: string, phone?: string) => {
    onSuccess(paymentIntentId, selectedShipping, email, name, phone);
  };
  const options = {
    clientSecret,
    appearance: {
      theme: 'stripe' as const,
      variables: {
        colorPrimary: '#333333',
        colorBackground: '#ffffff',
        colorText: '#333333',
        colorDanger: '#df1b41',
        fontFamily: 'system-ui, sans-serif',
        spacingUnit: '4px',
        borderRadius: '8px',
      },
    },
  };

  return (
    <div className="embedded-checkout-container">
      <Elements stripe={stripePromise} options={options}>
        <CheckoutForm
          onSuccess={handleSuccess}
          onCancel={onCancel}
          totalAmount={totalAmount}
          onShippingChange={handleShippingChange}
          selectedShipping={selectedShipping}
          onAddressChange={handleAddressChange}
        />
      </Elements>
    </div>
  );
};

export default EmbeddedCheckout;
