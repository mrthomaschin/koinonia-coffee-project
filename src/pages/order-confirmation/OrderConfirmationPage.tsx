import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCart } from '../../contexts/CartContext';
import { stripeService } from '../../services/stripeService';
import './OrderConfirmationPage.css';

interface OrderConfirmationPageProps {
  availableHeight: number;
}

interface SessionData {
  id: string;
  payment_status: string;
  customer_email: string;
  customer_name: string;
  amount_total: number;
  currency: string;
}

const OrderConfirmationPage: React.FC<OrderConfirmationPageProps> = ({ availableHeight }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { cart } = useCart();
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sessionId = searchParams.get('session_id');

    if (!sessionId) {
      setError('No session ID found');
      setLoading(false);
      return;
    }

    const fetchSessionData = async () => {
      try {
        const data = await stripeService.retrieveSession(sessionId);
        setSessionData(data);

        if (data.payment_status === 'paid') {
          cart.cartItems = [];
          localStorage.removeItem('koinonia_cart');
        }
      } catch (err) {
        console.error('Error fetching session:', err);
        setError('Failed to retrieve order information');
      } finally {
        setLoading(false);
      }
    };

    fetchSessionData();
  }, [searchParams, cart]);

  const handleContinueShopping = () => {
    navigate('/shop');
  };

  if (loading) {
    return (
      <div className="order-confirmation-page" style={{ minHeight: availableHeight }}>
        <div className="confirmation-container">
          <div className="loading-spinner">
            <div className="spinner"></div>
            <p>Loading order details...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !sessionData) {
    return (
      <div className="order-confirmation-page" style={{ minHeight: availableHeight }}>
        <div className="confirmation-container">
          <div className="error-state">
            <div className="error-icon">⚠️</div>
            <h1>Order Error</h1>
            <p>{error || 'Unable to retrieve order information'}</p>
            <button className="continue-shopping-btn" onClick={handleContinueShopping}>
              Continue Shopping
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isPaid = sessionData.payment_status === 'paid';
  const formattedAmount = (sessionData.amount_total / 100).toFixed(2);

  return (
    <div className="order-confirmation-page" style={{ minHeight: availableHeight }}>
      <div className="confirmation-container">
        <div className="confirmation-content">
          {isPaid ? (
            <>
              <div className="success-icon">✓</div>
              <h1 className="confirmation-title">Order Confirmed!</h1>
              <p className="confirmation-message">
                Thank you for your purchase. Your order has been successfully processed.
              </p>

              <div className="order-details">
                <h2>Order Details</h2>
                <div className="detail-row">
                  <span className="detail-label">Order ID:</span>
                  <span className="detail-value">{sessionData.id}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Customer Name:</span>
                  <span className="detail-value">{sessionData.customer_name}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Email:</span>
                  <span className="detail-value">{sessionData.customer_email}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Total Amount:</span>
                  <span className="detail-value amount">
                    ${formattedAmount} {sessionData.currency.toUpperCase()}
                  </span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Payment Status:</span>
                  <span className="detail-value status-paid">Paid</span>
                </div>
              </div>

              <div className="confirmation-info">
                <p>
                  A confirmation email has been sent to <strong>{sessionData.customer_email}</strong>.
                </p>
                <p>
                  Your order will be processed and shipped within 2-3 business days.
                </p>
              </div>

              <button className="continue-shopping-btn" onClick={handleContinueShopping}>
                Continue Shopping
              </button>
            </>
          ) : (
            <>
              <div className="warning-icon">⚠️</div>
              <h1 className="confirmation-title">Payment Pending</h1>
              <p className="confirmation-message">
                Your payment is being processed. Please check your email for updates.
              </p>
              <button className="continue-shopping-btn" onClick={handleContinueShopping}>
                Continue Shopping
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default OrderConfirmationPage;
