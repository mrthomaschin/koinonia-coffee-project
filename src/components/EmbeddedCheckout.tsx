import React, { useState } from 'react';
import { Elements, PaymentElement, useStripe, useElements, AddressElement } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import ShippingSelector, { ShippingOption, SHIPPING_OPTIONS } from './ShippingSelector';
import './EmbeddedCheckout.css';

const stripePromise = loadStripe(process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY || '');

interface CheckoutFormProps {
  onSuccess: (paymentIntentId?: string, email?: string, name?: string, phone?: string) => void;
  onCancel: () => void;
  totalAmount: number;
  onShippingChange: (option: ShippingOption) => void;
  selectedShipping: ShippingOption;
}

const CheckoutForm: React.FC<CheckoutFormProps> = ({
  onSuccess,
  onCancel,
  totalAmount,
  onShippingChange,
  selectedShipping
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

      <ShippingSelector
        onShippingChange={onShippingChange}
        selectedShipping={selectedShipping}
      />

      {selectedShipping.id !== 'local-pickup' && (
        <div className="address-section">
          <h3>Shipping Address</h3>
          <AddressElement options={{ mode: 'shipping' }} />
        </div>
      )}

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
    SHIPPING_OPTIONS[1] // Default to standard shipping
  );

  const handleShippingChange = (option: ShippingOption) => {
    setSelectedShipping(option);
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
        />
      </Elements>
    </div>
  );
};

export default EmbeddedCheckout;
