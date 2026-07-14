import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCart } from '../../contexts/CartContext';
import { stripeService } from '../../services/stripeService';
import { sendPurchaseNotification } from '../../services/emailService';
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
    console.log('🎯 CheckoutSuccess component mounted');
    const sessionId = searchParams.get('session_id');
    console.log('🔑 Session ID from URL:', sessionId);

    if (!sessionId) {
      console.error('❌ No session ID found in URL');
      setError('No session ID found');
      setIsVerifying(false);
      return;
    }

    const verifySession = async () => {
      try {
        console.log('🔍 Verifying session:', sessionId);
        const data = await stripeService.retrieveSession(sessionId);
        console.log('📦 Session data received:', data);
        setSessionData(data);

        console.log('💳 Payment status:', data.payment_status);
        if (data.payment_status === 'paid') {
          try {
            console.log('Payment verified, preparing to send email notification...');
            console.log('Cart items:', cart.cartItems);

            const purchaseItems = cart.cartItems.map(cartItem => {
              const variations: string[] = [];
              if (cartItem.selections.weight) {
                variations.push(`${cartItem.selections.weight}oz`);
              }
              if (cartItem.selections.size) {
                variations.push(cartItem.selections.size);
              }

              return {
                name: cartItem.item.name,
                sku: cartItem.item.sku,
                quantity: cartItem.quantity,
                price: cartItem.item.price,
                variations: variations.length > 0 ? variations.join(', ') : undefined
              };
            });

            console.log('Purchase items prepared:', purchaseItems);
            console.log('Sending email notification...');

            await sendPurchaseNotification({
              customerEmail: data.customer_email || 'N/A',
              customerName: data.customer_details?.name,
              items: purchaseItems,
              totalAmount: data.amount_total / 100,
              orderDate: new Date().toLocaleString(),
              sessionId: sessionId
            });

            console.log('✓ Email notification sent successfully!');
          } catch (emailError) {
            console.error('Failed to send purchase notification:', emailError);
          }

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
