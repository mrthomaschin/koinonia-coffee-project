import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useCart } from '../../contexts/CartContext';
import { stripeService } from '../../services/stripeService';
import { sendPurchaseNotification, sendCustomerConfirmation } from '../../services/emailService';
import { notionService } from '../../services/notionService';
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

interface EmbeddedOrderData {
  items: Array<{
    name: string;
    quantity: number;
    price: number;
    image?: string;
    selections?: any;
  }>;
  total: number;
  timestamp: string;
}

const OrderConfirmationPage: React.FC<OrderConfirmationPageProps> = ({ availableHeight }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { cart } = useCart();
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [embeddedOrderData, setEmbeddedOrderData] = useState<EmbeddedOrderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const emailSentRef = React.useRef(false);

  useEffect(() => {
    // Check if this is from embedded checkout
    const state = location.state as { orderData?: EmbeddedOrderData; fromEmbeddedCheckout?: boolean };

    if (state?.fromEmbeddedCheckout && state?.orderData) {
      // Handle embedded checkout flow
      setEmbeddedOrderData(state.orderData);

      // Send emails for embedded checkout (only once)
      if (!emailSentRef.current) {
        emailSentRef.current = true;

        const sendEmbeddedCheckoutEmails = async () => {
          try {
            if (!state.orderData) return;

            console.log('💳 Embedded checkout payment confirmed, preparing emails...');
            console.log('📦 Order data:', state.orderData);

            // Read cart items from localStorage to get variant SKU and price
            const storedCartItems = localStorage.getItem('checkout_cart_items');
            let cartItems = [];
            if (storedCartItems) {
              try {
                cartItems = JSON.parse(storedCartItems);
              } catch (e) {
                console.error('Failed to parse cart items from localStorage:', e);
              }
              // Clear the stored cart items after use
              localStorage.removeItem('checkout_cart_items');
            }

            // Map Stripe items to cart items to get variant data
            const purchaseItems = state.orderData.items.map(item => {
              const cartItem = cartItems.find((ci: any) => ci.item.name === item.name);
              return {
                name: item.name,
                sku: cartItem?.variantSku || cartItem?.item?.sku || 'N/A',
                quantity: item.quantity,
                price: cartItem?.variantPrice || cartItem?.item?.price || item.price,
                variations: item.selections?.variations,
                image: item.image
              };
            });

            const orderId = new Date(state.orderData.timestamp).getTime().toString().slice(-8).toUpperCase();
            const subtotal = state.orderData.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

            // Get customer info from cart or use defaults
            const customerEmail = (state as any).customerEmail || 'customer@example.com';
            const customerName = (state as any).customerName || 'Valued Customer';
            const customerPhone = (state as any).customerPhone || '';
            const shippingAddress = (state as any).shippingAddress || '';

            // Create Notion database entry
            console.log('� Creating Notion order entry...');
            try {
              await notionService.createOrder({
                customerName: customerName,
                customerEmail: customerEmail,
                customerPhone: customerPhone,
                orderId: orderId,
                items: purchaseItems,
                totalAmount: state.orderData.total,
                orderDate: new Date(state.orderData.timestamp).toLocaleString(),
                transactionId: orderId,
                shippingAddress: shippingAddress
              });
              console.log('✅ Notion order created successfully!');
            } catch (notionError) {
              console.error('❌ Failed to create Notion order:', notionError);
            }

            console.log('� Sending purchase notification email...');
            await sendPurchaseNotification({
              customerEmail: customerEmail,
              customerName: customerName,
              customerPhone: customerPhone,
              items: purchaseItems,
              totalAmount: state.orderData.total,
              orderDate: new Date(state.orderData.timestamp).toLocaleString(),
              sessionId: orderId
            });
            console.log('✅ Purchase notification sent successfully!');

            // Send customer confirmation email
            console.log('📧 Sending customer confirmation email...');
            await sendCustomerConfirmation({
              customerEmail: customerEmail,
              customerName: customerName,
              customerPhone: customerPhone,
              items: purchaseItems,
              subtotal: subtotal,
              shipping: 8.99,
              tax: state.orderData.total - subtotal - 8.99,
              totalAmount: state.orderData.total,
              orderDate: new Date(state.orderData.timestamp).toLocaleString(),
              orderId: orderId
            });
            console.log('✅ Customer confirmation sent successfully!');
          } catch (emailError) {
            console.error('❌ Failed to send emails:', emailError);
          }
        };

        sendEmbeddedCheckoutEmails();
      }

      setLoading(false);
      return;
    }

    // Handle session-based checkout flow
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
          // Send purchase notification email before clearing cart (only once)
          if (!emailSentRef.current) {
            emailSentRef.current = true;
            try {
              console.log('💳 Payment confirmed, preparing email notification...');
              console.log('📦 Cart items:', cart.cartItems);

              const purchaseItems = cart.cartItems.map(cartItem => {
                const variations: string[] = [];
                if (cartItem.selections.weight) {
                  variations.push(`${cartItem.selections.weight}oz`);
                }
                if (cartItem.selections.size) {
                  variations.push(cartItem.selections.size);
                }

                const imageUrl = cartItem.item.images && cartItem.item.images.length > 0 ? cartItem.item.images[0] : undefined;
                console.log(`📸 Item "${cartItem.item.name}" image:`, imageUrl);

                return {
                  name: cartItem.item.name,
                  sku: cartItem.item.sku,
                  quantity: cartItem.quantity,
                  price: cartItem.item.price,
                  variations: variations.length > 0 ? variations.join(', ') : undefined,
                  image: imageUrl
                };
              });

              const orderId = sessionId.slice(-8).toUpperCase();
              const subtotal = purchaseItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

              // Create Notion database entry
              console.log('📝 Creating Notion order entry...');
              try {
                await notionService.createOrder({
                  customerName: data.customer_name || 'Valued Customer',
                  customerEmail: data.customer_email || 'N/A',
                  customerPhone: (data as any).customer_phone || '',
                  orderId: orderId,
                  items: purchaseItems,
                  totalAmount: data.amount_total / 100,
                  orderDate: new Date().toLocaleString(),
                  transactionId: sessionId,
                  shippingAddress: (data as any).shipping_address || ''
                });
                console.log('✅ Notion order created successfully!');
              } catch (notionError) {
                console.error('❌ Failed to create Notion order:', notionError);
              }

              console.log('📧 Sending purchase notification email...');
              await sendPurchaseNotification({
                customerEmail: data.customer_email || 'N/A',
                customerName: data.customer_name,
                items: purchaseItems,
                totalAmount: data.amount_total / 100,
                orderDate: new Date().toLocaleString(),
                sessionId: sessionId
              });
              console.log('✅ Purchase notification sent successfully!');

              // Send customer confirmation email
              console.log('📧 Sending customer confirmation email...');
              await sendCustomerConfirmation({
                customerEmail: data.customer_email,
                customerName: data.customer_name || 'Valued Customer',
                items: purchaseItems,
                subtotal: subtotal,
                shipping: 8.99, // TODO: Get actual shipping from session
                tax: (data.amount_total / 100) - subtotal - 8.99,
                totalAmount: data.amount_total / 100,
                orderDate: new Date().toLocaleString(),
                orderId: orderId
              });
              console.log('✅ Customer confirmation sent successfully!');
            } catch (emailError) {
              console.error('❌ Failed to send emails:', emailError);
            }
          }

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
  }, [searchParams, cart, location.state]);

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

  if (error || (!sessionData && !embeddedOrderData)) {
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

  // Handle embedded checkout display
  if (embeddedOrderData) {
    const formattedAmount = embeddedOrderData.total.toFixed(2);
    const orderId = new Date(embeddedOrderData.timestamp).getTime().toString().slice(-8).toUpperCase();

    return (
      <div className="order-confirmation-page" style={{ minHeight: availableHeight }}>
        <div className="confirmation-container">
          <div className="confirmation-content">
            <div className="success-icon">✓</div>
            <h1 className="confirmation-title">Order Confirmed!</h1>
            <p className="confirmation-message">
              Thank you for your purchase. Your order has been successfully processed.
            </p>

            <div className="order-details">
              <h2>Order Details</h2>
              <div className="detail-row">
                <span className="detail-label">Order ID:</span>
                <span className="detail-value">{orderId}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Total Amount:</span>
                <span className="detail-value amount">${formattedAmount} USD</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Payment Status:</span>
                <span className="detail-value status-paid">Paid</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Items:</span>
                <span className="detail-value">{embeddedOrderData.items.length} item(s)</span>
              </div>
            </div>

            <div className="confirmation-info">
              <p>Your order will be processed and shipped within 2-3 business days.</p>
            </div>

            <button className="continue-shopping-btn" onClick={handleContinueShopping}>
              Continue Shopping
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Handle session-based checkout display
  // At this point, sessionData must exist (we checked for null above)
  if (!sessionData) {
    return null; // This should never happen due to earlier checks
  }

  const isPaid = sessionData.payment_status === 'paid';
  const formattedAmount = (sessionData.amount_total / 100).toFixed(2);
  const orderId = sessionData.id.slice(-8).toUpperCase();

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
                  <span className="detail-value">{orderId}</span>
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
