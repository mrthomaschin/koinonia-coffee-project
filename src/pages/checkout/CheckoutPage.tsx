import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../../contexts/CartContext';
import { stripeService } from '../../services/stripeService';
import { CoffeeBagWeight } from '../shop/item/coffee_bag/CoffeeBagItem';
import './CheckoutPage.css';

interface CheckoutPageProps {
  availableHeight: number;
}

const CheckoutPage: React.FC<CheckoutPageProps> = ({ availableHeight }) => {
  const navigate = useNavigate();
  const { cart, showToast } = useCart();
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (cart.cartItems.length === 0) {
      navigate('/cart');
    }
  }, [cart.cartItems, navigate]);

  const formatWeight = (weight: CoffeeBagWeight): string => {
    switch (weight) {
      case CoffeeBagWeight._12oz:
        return '12oz';
      case CoffeeBagWeight._16oz:
        return '16oz';
      case CoffeeBagWeight._24oz:
        return '24oz';
      case CoffeeBagWeight._200g:
        return '200g';
      case CoffeeBagWeight._5lb:
        return '5lb';
      default:
        return '';
    }
  };

  const subtotal = cart.getSubtotal();
  const tax = subtotal * 0.08;
  const shipping = subtotal > 50 ? 0 : 8.99;
  const total = subtotal + tax + shipping;

  const handleCheckout = async () => {
    setIsProcessing(true);
    try {
      await stripeService.createCheckoutSession(cart.cartItems, tax, shipping);
    } catch (error) {
      console.error('Checkout error:', error);
      if (error instanceof Error) {
        showToast(error.message, 'error');
      } else {
        showToast('Failed to initiate checkout. Please try again.', 'error');
      }
      setIsProcessing(false);
    }
  };

  return (
    <div className="checkout-page" style={{ minHeight: availableHeight }}>
      <div className="checkout-container">
        <h1 className="checkout-title">Checkout</h1>

        <div className="checkout-content">
          <div className="order-summary">
            <h2>Order Summary</h2>
            <div className="order-items">
              {cart.cartItems.map((cartItem, index) => {
                const itemPrice = cart.getItemPrice(cartItem);
                const itemTotal = itemPrice * cartItem.quantity;

                return (
                  <div key={index} className="order-item">
                    <div className="order-item-image">
                      <img src={cartItem.item.images[0]} alt={cartItem.item.name} />
                    </div>
                    <div className="order-item-details">
                      <h3>{cartItem.item.name}</h3>
                      {cartItem.selections.weight && (
                        <p className="item-option">Weight: {formatWeight(cartItem.selections.weight)}</p>
                      )}
                      {cartItem.selections.size && (
                        <p className="item-option">Size: {cartItem.selections.size}</p>
                      )}
                      <p className="item-quantity">Qty: {cartItem.quantity}</p>
                    </div>
                    <div className="order-item-price">
                      ${itemTotal.toFixed(2)}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="order-totals">
              <div className="total-row">
                <span>Subtotal:</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>
              <div className="total-row">
                <span>Estimated Tax:</span>
                <span>${tax.toFixed(2)}</span>
              </div>
              <div className="total-row">
                <span>Shipping:</span>
                <span>{shipping === 0 ? 'FREE' : `$${shipping.toFixed(2)}`}</span>
              </div>
              {shipping === 0 && (
                <p className="free-shipping-note">Free shipping on orders over $50!</p>
              )}
              <div className="total-row total-final">
                <span>Total:</span>
                <span>${total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="checkout-actions">
            <button
              className="back-to-cart-btn"
              onClick={() => navigate('/cart')}
              disabled={isProcessing}
            >
              Back to Cart
            </button>
            <button
              className="proceed-to-payment-btn"
              onClick={handleCheckout}
              disabled={isProcessing}
            >
              {isProcessing ? 'Processing...' : 'Proceed to Payment'}
            </button>
          </div>

          <div className="checkout-info">
            <p>
              You will be redirected to Stripe's secure checkout page to complete your payment.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CheckoutPage;
