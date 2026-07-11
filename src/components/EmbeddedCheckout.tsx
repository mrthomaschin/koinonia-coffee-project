import React, { useState } from 'react';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import './EmbeddedCheckout.css';

const stripePromise = loadStripe(process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY || '');

interface CheckoutFormProps {
  onSuccess: () => void;
  onCancel: () => void;
  totalAmount: number;
}

const CheckoutForm: React.FC<CheckoutFormProps> = ({ onSuccess, onCancel, totalAmount }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/order-confirmation`,
        },
        redirect: 'if_required',
      });

      if (error) {
        setErrorMessage(error.message || 'An error occurred');
        setIsProcessing(false);
      } else {
        onSuccess();
      }
    } catch (err) {
      setErrorMessage('Payment failed. Please try again.');
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="embedded-checkout-form">
      <div className="checkout-header">
        <h2>Complete Your Purchase</h2>
        <p className="total-amount">Total: ${totalAmount.toFixed(2)}</p>
      </div>

      <PaymentElement />

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
          {isProcessing ? 'Processing...' : `Pay $${totalAmount.toFixed(2)}`}
        </button>
      </div>
    </form>
  );
};

interface EmbeddedCheckoutProps {
  clientSecret: string;
  totalAmount: number;
  onSuccess: () => void;
  onCancel: () => void;
}

const EmbeddedCheckout: React.FC<EmbeddedCheckoutProps> = ({
  clientSecret,
  totalAmount,
  onSuccess,
  onCancel,
}) => {
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
          onSuccess={onSuccess}
          onCancel={onCancel}
          totalAmount={totalAmount}
        />
      </Elements>
    </div>
  );
};

export default EmbeddedCheckout;
