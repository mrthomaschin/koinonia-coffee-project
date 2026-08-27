import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useCart } from '../../contexts/CartContext';
import { stripeService } from '../../services/stripeService';
import { sendPurchaseNotification, sendCustomerConfirmation } from '../../services/emailService';
import { notionService } from '../../services/notionService';
import './OrderConfirmationPage.css';
import { createLogger } from '../../util/logger';
import { useAccount } from '../../contexts/AccountContext';
import { accountService } from '../../services/accountService';
import { SubscriptionPlan } from '../../models/AccountModel';

const logger = createLogger('OrderConfirmationPage');

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
  paymentIntentId?: string;
  subscriptionItems?: Array<{ plan: string; itemSku: string; itemName: string; weight: string; shippingWeight?: number; unitAmount: number }>;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
    sku?: string;
    image?: string;
    selections?: any;
  }>;
  subtotal: number;
  discountCode?: string;
  discountPercent?: number;
  discountAmount?: number;
  subtotalAfterDiscount?: number;
  shipping: number;
  shippingAddress?: string | null;
  shippingAddressData?: Record<string, unknown> | null;
  tax: number;
  total: number;
  timestamp: string;
  isLocalPickup?: boolean;
  orderPickupId?: string | null;
}

const OrderConfirmationPage: React.FC<OrderConfirmationPageProps> = ({ availableHeight }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { cart } = useCart();
  const { token } = useAccount();
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [embeddedOrderData, setEmbeddedOrderData] = useState<EmbeddedOrderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const emailSentRef = React.useRef(false);
  const subscriptionCreatedRef = React.useRef(false);

  useEffect(() => {
    const state = location.state as { orderData?: EmbeddedOrderData; fromEmbeddedCheckout?: boolean; customerPhone?: string };
    const orderData = state?.orderData;
    if (!state?.fromEmbeddedCheckout || !orderData?.paymentIntentId || !token || subscriptionCreatedRef.current) return;
    if (!orderData.subscriptionItems?.length) return;
    subscriptionCreatedRef.current = true;
    const orderId = new Date(orderData.timestamp).getTime().toString().slice(-8).toUpperCase();
    accountService.completeSubscriptionCheckout(
      token,
      orderData.paymentIntentId,
      orderData.subscriptionItems.map((item) => ({ ...item, plan: item.plan as SubscriptionPlan })),
      orderData.shippingAddress || "",
      orderData.shippingAddressData || undefined,
      orderId,
      state.customerPhone,
      orderData.isLocalPickup === true,
      orderData.orderPickupId || undefined,
    ).catch((checkoutError) => logger.error('Unable to activate paid subscriptions', checkoutError));
  }, [location.state, token]);

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

            logger.log('💳 Embedded checkout payment confirmed, preparing emails...');
            logger.log('📦 Order data:', state.orderData);

            // Map order items to purchase items (SKU already in orderData)
            const purchaseItems = state.orderData.items.map(item => {
              const variations: string[] = [];
              if (item.selections?.weight) {
                variations.push(item.selections.weight);
              }
              if (item.selections?.size) {
                variations.push(item.selections.size);
              }
              return {
                name: item.name,
                sku: item.sku || 'N/A',
                quantity: item.quantity,
                price: item.price,
                variations: variations.length > 0 ? variations.join(', ') : undefined,
                image: item.image
              };
            });

            const orderId = new Date(state.orderData.timestamp).getTime().toString().slice(-8).toUpperCase();
            const subtotal = state.orderData.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

            // Get customer info from cart or use defaults
            const customerEmail = (state as any).customerEmail || 'customer@example.com';
            const customerName = (state as any).customerName || 'Valued Customer';
            const customerPhone = (state as any).customerPhone || '';
            const shippingAddress = (state as any).orderData?.shippingAddress || '';
            const shipmentData = (state as any).orderData?.shipmentData || null;
            const isLocalPickup = (state as any).orderData?.isLocalPickup || false;
            const orderPickupId = (state as any).orderData?.orderPickupId || '';

            // Check if order confirmed email was already sent
            const { emailSent, orderExists } = await notionService.checkOrderConfirmedEmailSent(orderId);

            if (orderExists && emailSent) {
              logger.log('ℹ️ Order exists and email already sent, skipping email sending');
            } else {
              // Create Notion database entry (only if order doesn't exist)
              if (!orderExists) {
                logger.log('📝 Creating Notion order entry...');
                try {
                  await notionService.createOrder({
                    customerName: customerName,
                    customerEmail: customerEmail,
                    customerPhone: customerPhone,
                    orderId: orderId,
                    items: purchaseItems,
                    totalAmount: state.orderData.total,
                    orderDate: state.orderData.timestamp,
                    transactionId: orderId,
                    shippingAddress: shippingAddress,
                    shipmentData: shipmentData,
                    shippingBox: shipmentData?.boxSize || '',
                    isLocalPickup: isLocalPickup,
                    orderPickupId: orderPickupId,
                    discountCode: state.orderData.discountCode
                  });
                  logger.log('✅ Notion order created successfully!');
                } catch (notionError) {
                  logger.error('❌ Failed to create Notion order:', notionError);
                }
              }

              // Send emails AFTER order is created
              try {
                logger.log('📧 Sending purchase notification email...');
                await sendPurchaseNotification({
                  customerEmail: customerEmail,
                  customerName: customerName,
                  customerPhone: customerPhone,
                  items: purchaseItems,
                  subtotal: state.orderData.subtotal,
                  discountCode: state.orderData.discountCode,
                  discountPercent: state.orderData.discountPercent,
                  discountAmount: state.orderData.discountAmount,
                  totalAmount: state.orderData.total,
                  orderDate: state.orderData.timestamp,
                  sessionId: orderId
                });
                logger.log('✅ Purchase notification sent successfully!');

                // Send customer confirmation email
                logger.log('📧 Sending customer confirmation email...');
                await sendCustomerConfirmation({
                  customerEmail: customerEmail,
                  customerName: customerName,
                  customerPhone: customerPhone,
                  items: purchaseItems,
                  subtotal: subtotal,
                  discountCode: state.orderData.discountCode,
                  discountPercent: state.orderData.discountPercent,
                  discountAmount: state.orderData.discountAmount,
                  shipping: state.orderData.shipping || 0,
                  tax: state.orderData.tax || 0,
                  totalAmount: state.orderData.total,
                  orderDate: state.orderData.timestamp,
                  orderId: orderId
                });
                logger.log('✅ Customer confirmation sent successfully!');

                // Mark email as sent AFTER successfully sending emails
                try {
                  await notionService.markOrderConfirmedEmailSent(orderId);
                  logger.log('✅ Order confirmed email marked as sent');
                } catch (markError) {
                  logger.error('❌ Failed to mark order confirmed email as sent:', markError);
                }
              } catch (emailError) {
                logger.error('❌ Failed to send emails:', emailError);
              }
            }
          } catch (emailError) {
            logger.error('❌ Failed to send emails:', emailError);
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
              logger.log('💳 Payment confirmed, preparing email notification...');
              logger.log('📦 Cart items:', cart.cartItems);

              const purchaseItems = cart.cartItems.map(cartItem => {
                const variations: string[] = [];
                if (cartItem.selections.weight) {
                  const weight = cartItem.selections.weight;
                  variations.push(weight);
                }
                if (cartItem.selections.size) {
                  variations.push(cartItem.selections.size);
                }

                const imageUrl = undefined;
                logger.log(`📸 Item "${cartItem.item.name}" image:`, imageUrl);

                return {
                  name: cartItem.item.name,
                  sku: cartItem.variantSku || cartItem.item.sku,
                  quantity: cartItem.quantity,
                  price: cartItem.variantPrice || cartItem.item.price,
                  variations: variations.length > 0 ? variations.join(', ') : undefined,
                  image: imageUrl
                };
              });

              const orderId = sessionId.slice(-8).toUpperCase();
              const subtotal = purchaseItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

              // Get shipment data if available
              const shipmentData = (data as any).shipmentData || null;
              const isLocalPickup = (data as any).isLocalPickup || false;
              const orderPickupId = (data as any).orderPickupId || '';

              // Check if order confirmed email was already sent
              const { emailSent, orderExists } = await notionService.checkOrderConfirmedEmailSent(orderId);

              if (orderExists && emailSent) {
                logger.log('ℹ️ Order exists and email already sent, skipping email sending');
              } else {
                // Create Notion database entry (only if order doesn't exist)
                if (!orderExists) {
                  logger.log('📝 Creating Notion order entry...');
                  try {
                    await notionService.createOrder({
                      customerName: data.customer_name || 'Valued Customer',
                      customerEmail: data.customer_email || 'N/A',
                      customerPhone: (data as any).customer_phone || '',
                      orderId: orderId,
                      items: purchaseItems,
                      totalAmount: data.amount_total / 100,
                      orderDate: new Date().toISOString(),
                      transactionId: sessionId,
                      shippingAddress: (data as any).shipping_address || '',
                      shipmentData: shipmentData,
                      shippingBox: shipmentData?.boxSize || '',
                      isLocalPickup: isLocalPickup,
                      orderPickupId: orderPickupId,
                      discountCode: undefined
                    });
                    logger.log('✅ Notion order created successfully!');
                  } catch (notionError) {
                    logger.error('❌ Failed to create Notion order:', notionError);
                  }
                }

                // Send emails AFTER order is created
                try {
                  logger.log('📧 Sending purchase notification email...');
                  await sendPurchaseNotification({
                    customerEmail: data.customer_email || 'N/A',
                    customerName: data.customer_name,
                    items: purchaseItems,
                    totalAmount: data.amount_total / 100,
                    orderDate: new Date().toISOString(),
                    sessionId: sessionId
                  });
                  logger.log('✅ Purchase notification sent successfully!');

                  // Send customer confirmation email
                  logger.log('📧 Sending customer confirmation email...');
                  const totalAmount = data.amount_total / 100;

                  // Extract tax and shipping from Stripe line items
                  let tax = 0;
                  let shipping = 0;
                  if (data.line_items && data.line_items.data) {
                    data.line_items.data.forEach((item: any) => {
                      const amount = item.amount / 100;
                      const description = item.description?.toLowerCase() || '';
                      if (description.includes('tax')) {
                        tax += amount;
                      } else if (description.includes('shipping')) {
                        shipping += amount;
                      }
                    });
                  }

                  // If no explicit shipping line item, calculate from total
                  if (shipping === 0) {
                    shipping = totalAmount - subtotal - tax;
                  }

                  await sendCustomerConfirmation({
                    customerEmail: data.customer_email,
                    customerName: data.customer_name || 'Valued Customer',
                    items: purchaseItems,
                    subtotal: subtotal,
                    shipping: shipping,
                    tax: tax,
                    totalAmount: totalAmount,
                    orderDate: new Date().toISOString(),
                    orderId: orderId
                  });
                  logger.log('✅ Customer confirmation sent successfully!');

                  // Mark email as sent AFTER successfully sending emails
                  try {
                    await notionService.markOrderConfirmedEmailSent(orderId);
                    logger.log('✅ Order confirmed email marked as sent');
                  } catch (markError) {
                    logger.error('❌ Failed to mark order confirmed email as sent:', markError);
                  }
                } catch (emailError) {
                  logger.error('❌ Failed to send emails:', emailError);
                }
              }
            } catch (emailError) {
              logger.error('❌ Failed to send emails:', emailError);
            }
          }

          cart.cartItems = [];
          localStorage.removeItem('koinonia_cart');
        }
      } catch (err) {
        logger.error('Error fetching session:', err);
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
