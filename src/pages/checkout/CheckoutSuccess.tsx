import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCart } from '../../contexts/CartContext';
import { stripeService } from '../../services/stripeService';
import './Checkout.css';

interface CheckoutSuccessProps {
  availableHeight: number;
}

const CheckoutSuccess: React.FC<CheckoutSuccessProps> = ({ availableHeight }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { cart, forceUpdate } = useCart();
  const [isVerifying, setIsVerifying] = useState(true);
  const [sessionData, setSessionData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sessionId = searchParams.get('session_id');

    if (!sessionId) {
      setError('No session ID found');
      setIsVerifying(false);
      return;
    }

    const verifySession = async () => {
      try {
        const data = await stripeService.retrieveSession(sessionId);
        setSessionData(data);

        if (data.payment_status === 'paid') {
          cart.cartItems = [];
          forceUpdate();
        }
      } catch (err) {
        console.error('Session verification error:', err);
        setError('Failed to verify payment');
      } finally {
        setIsVerifying(false);
      }
    };

    verifySession();
  }, [searchParams, cart, forceUpdate]);

  const handleContinueShopping = () => {
    navigate('/shop');
  };

  if (isVerifying) {
    return (
      <div className="checkout-page" style={{ minHeight: availableHeight }}>
        <div className="checkout-container">
          <div className="checkout-loading">
            <h1>Verifying your payment...</h1>
            <p>Please wait while we confirm your order.</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="checkout-page" style={{ minHeight: availableHeight }}>
        <div className="checkout-container">
          <div className="checkout-error">
            <h1>Payment Verification Failed</h1>
            <p>{error}</p>
            <button className="checkout-btn" onClick={handleContinueShopping}>
              Return to Shop
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="checkout-page" style={{ minHeight: availableHeight }}>
      <div className="checkout-container">
        <div className="checkout-success">
          <div className="success-icon">✓</div>
          <h1>Order Confirmed!</h1>
          <p className="success-message">
            Thank you for your purchase. Your order has been successfully processed.
          </p>

          {sessionData?.customer_email && (
            <p className="confirmation-email">
              A confirmation email has been sent to <strong>{sessionData.customer_email}</strong>
            </p>
          )}

          {sessionData?.amount_total && (
            <div className="order-total">
              <span>Total Paid:</span>
              <span className="amount">${(sessionData.amount_total / 100).toFixed(2)}</span>
            </div>
          )}

          <div className="checkout-actions">
            <button className="checkout-btn" onClick={handleContinueShopping}>
              Continue Shopping
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CheckoutSuccess;
