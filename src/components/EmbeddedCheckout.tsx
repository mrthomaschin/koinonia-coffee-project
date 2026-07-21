import React, { useState, useEffect } from 'react';
import { createLogger } from '../util/logger';
import { Elements, PaymentElement, useStripe, useElements, AddressElement } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import ShippingSelector, { ShippingOption, DEFAULT_SHIPPING_OPTIONS } from './ShippingSelector';
import { mapEasyPostRates, filterAllowedServices } from '../util/EasyPostMapper';
import { EasyPostRate } from '../models/ShippingModels';
import { TaxCodes } from '../constants/TaxCodes';
import { calculateParcel, formatParcelForEasyPost } from '../util/shipping';
import './EmbeddedCheckout.css';

const logger = createLogger('EmbeddedCheckout');

const stripePromise = loadStripe(process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY || '').then(stripe => {
  logger.log('[stripe] Stripe.js loaded', { hasStripe: !!stripe });
  return stripe;
}).catch(error => {
  logger.error('[stripe] Stripe.js failed to load', error);
  return null;
});
const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';

interface CheckoutFormProps {
  onSuccess: (paymentIntentId?: string, email?: string, name?: string, phone?: string, shipmentData?: any, shippingAddress?: string, tax?: number) => void;
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
  const [stripeLoading, setStripeLoading] = useState(true);
  const [elementsMounted, setElementsMounted] = useState({
    shipping: false,
    billing: false,
    payment: false
  });
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [shippingOptions, setShippingOptions] = useState<ShippingOption[]>(DEFAULT_SHIPPING_OPTIONS);
  const [isLoadingShipping, setIsLoadingShipping] = useState(false);
  const [shippingAddressComplete, setShippingAddressComplete] = useState(false);
  const [deliveryMethod, setDeliveryMethod] = useState<'pickup' | 'shipping'>('shipping');
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(null);
  const [shipmentId, setShipmentId] = useState<string | null>(null);
  const [taxAmount, setTaxAmount] = useState(0);
  const [currentAddress, setCurrentAddress] = useState<any>(null);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
    };
  }, [debounceTimer]);

  // Track when Stripe is ready
  useEffect(() => {
    if (stripe && elements) {
      setStripeLoading(false);
      logger.log('[stripe] Stripe and elements are ready', {
        hasStripe: !!stripe,
        hasElements: !!elements,
        stripeKey: process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY?.substring(0, 10) + '...'
      });
    }
  }, [stripe, elements]);

  // Recalculate shipping rates when cart items change and address is complete
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'checkout_cart_items' && currentAddress && shippingAddressComplete && deliveryMethod === 'shipping') {
        logger.log('[shipping] Cart items changed (storage event), recalculating shipping rates');
        fetchShippingRatesFromEasyPost(currentAddress);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAddress, shippingAddressComplete, deliveryMethod]);

  // Recalculate shipping rates on mount if address is complete
  useEffect(() => {
    if (currentAddress && shippingAddressComplete && deliveryMethod === 'shipping') {
      logger.log('[shipping] EmbeddedCheckout mounted, recalculating shipping rates');
      fetchShippingRatesFromEasyPost(currentAddress);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen to element changes to get tax amount
  useEffect(() => {
    if (!elements) return;

    const element = elements.getElement('payment');
    if (!element) return;

    const handleChange = (event: any) => {
      if (event.value && event.value.taxAmount) {
        setTaxAmount(event.value.taxAmount / 100); // Convert from cents to dollars
      }
    };

    const handleReady = () => {
      logger.log('[stripe] Payment element ready');
    };

    element.on('change', handleChange);
    element.on('ready', handleReady);

    return () => {
      element.off('change', handleChange);
      element.off('ready', handleReady);
    };
  }, [elements]);

  // Calculate tax when shipping address changes
  const calculateTaxForAddress = async (address: any) => {
    if (!address || !address.line1 || !address.city || !address.state || !address.postal_code) {
      setTaxAmount(0);
      return;
    }

    try {
      logger.log('[tax] Calculating tax for address', { address, totalAmount });

      // Get cart items from localStorage to send proper line items with tax codes
      let lineItems = [];
      try {
        const cartItemsStr = localStorage.getItem('checkout_cart_items');
        if (cartItemsStr) {
          const cartItems = JSON.parse(cartItemsStr);
          lineItems = cartItems.map((item: any) => {
            const price = item.variantPrice || item.item.price;
            const amount = Math.round(price * 100); // Convert to cents

            // Use pre-calculated tax code from cart item, fallback to default
            const taxCode = item.taxCode || TaxCodes.DEFAULT;

            return {
              amount: amount * item.quantity,
              reference: item.item.sku,
              tax_code: taxCode,
            };
          });
        }
      } catch (storageError) {
        logger.error('[tax] localStorage access failed (possibly Safari ITP):', storageError);
        // Continue with fallback line item
      }

      // Fallback to single line item if cart items not available
      if (lineItems.length === 0) {
        lineItems = [{
          amount: Math.round(totalAmount * 100),
          reference: 'order_total',
          tax_code: TaxCodes.DEFAULT,
        }];
      }

      const response = await fetch(`${backendUrl}/calculate-tax`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          lineItems,
          currency: 'usd',
          shippingAddress: {
            line1: address.line1,
            line2: address.line2 || '',
            city: address.city,
            state: address.state,
            postal_code: address.postal_code,
            country: address.country || 'US',
          },
        }),
      });

      logger.log('[tax] Tax calculation response status', { status: response.status });

      if (response.ok) {
        const data = await response.json();
        logger.log('[tax] Tax calculated successfully', { taxAmount: data.taxAmount, source: data.source });
        setTaxAmount(data.taxAmount);
      } else {
        const errorData = await response.json().catch(() => ({}));
        logger.error('[tax] Tax calculation failed', { error: errorData });
        setTaxAmount(0);
      }
    } catch (error) {
      logger.error('[tax] Error calculating tax:', error);
      setTaxAmount(0);
    }
  };

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

      // Get cart items to calculate parcel dimensions and weight
      let cartItems = [];
      try {
        const cartItemsStr = localStorage.getItem('checkout_cart_items');
        if (cartItemsStr) {
          cartItems = JSON.parse(cartItemsStr);
        }
      } catch (storageError) {
        logger.error('[shipping] localStorage access failed (possibly Safari ITP):', storageError);
      }

      logger.log('[shipping] Cart items for parcel calculation:', {
        cartItemsCount: cartItems.length,
        cartItems: cartItems.map((item: any) => ({
          sku: item.item?.sku,
          variantSku: item.variantSku,
          shippingWeight: item.item?.shippingWeight,
          variants: item.item?.variants?.map((v: any) => ({
            sku: v.sku,
            shippingWeight: v.shippingWeight,
          })),
          quantity: item.quantity,
        })),
      });

      // Calculate parcel based on cart items
      const parcel = cartItems.length > 0 ? calculateParcel(cartItems) : null;
      const formattedParcel = parcel ? formatParcelForEasyPost(parcel) : null;

      logger.log('[shipping] Fetching rates with parcel data', {
        hasCartItems: cartItems.length > 0,
        parcel: formattedParcel,
      });

      const response = await fetch(`${backendUrl}/get-shipping-rates`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ toAddress, parcel: formattedParcel }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch shipping rates: ${errorText}`);
      }

      const data = await response.json();

      // Store shipment ID for later use in purchase
      if (data.shipmentId) {
        setShipmentId(data.shipmentId);
      }

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
      // On error, show no shipping options
      setShippingOptions([]);
    } finally {
      setIsLoadingShipping(false);
    }
  };

  const handleAddressChange = async (event: any) => {
    const addressData = event.value;

    // Stripe's AddressElement should provide complete property
    // Try multiple ways to access it
    const isComplete = event.complete || addressData?.complete;

    if (isComplete) {
      setShippingAddressComplete(true);

      // Validate the address before fetching rates
      const address = addressData?.address || addressData;
      const isAddressValid = validateAddress(address);

      if (!isAddressValid) {
        // Show default options only when address is explicitly invalid
        setShippingOptions(DEFAULT_SHIPPING_OPTIONS);
        setIsLoadingShipping(false);
        setTaxAmount(0);
        return;
      }

      // Store current address for cart change recalculation
      setCurrentAddress(address);

      // Set loading state immediately to prevent message flicker
      setIsLoadingShipping(true);
      setShippingOptions([]);

      // Calculate tax for the address
      await calculateTaxForAddress(address);

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
      setShippingAddressComplete(false);
      // Clear any pending fetch if address becomes incomplete
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        setDebounceTimer(null);
      }
      // Clear options when address is incomplete (don't show defaults)
      setShippingOptions([]);
      setIsLoadingShipping(false);
      setTaxAmount(0);
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
        // Purchase shipment if shipping is selected and rate is available
        logger.log('[shipment] Checking shipment purchase conditions', {
          deliveryMethod,
          selectedShippingId: selectedShipping.id,
          shouldPurchase: deliveryMethod === 'shipping' && selectedShipping.id !== 'local-pickup'
        });

        let currentShippingAddress = '';

        if (deliveryMethod === 'shipping' && selectedShipping.id !== 'local-pickup') {
          logger.log('[shipment] Starting shipment purchase process');

          try {
            const addressData = await elements?.getElement('address', { mode: 'shipping' })?.getValue();
            const toAddress = addressData?.value?.address;

            logger.log('[shipment] Address retrieved', { hasAddress: !!toAddress });

            if (toAddress) {
              // Format shipping address for display
              const formattedAddress = [
                toAddress.line1,
                toAddress.line2,
                toAddress.city,
                toAddress.state,
                toAddress.postal_code,
                toAddress.country
              ].filter(Boolean).join(', ');

              logger.log('[shipment] Formatted address', { formattedAddress });

              // Pass formatted address directly to avoid timing issues with state updates
              currentShippingAddress = formattedAddress;

              // Recalculate parcel for box size determination
              let formattedParcel = null;
              try {
                const cartItemsStr = localStorage.getItem('checkout_cart_items');
                if (cartItemsStr) {
                  const cartItems = JSON.parse(cartItemsStr);
                  const parcel = cartItems.length > 0 ? calculateParcel(cartItems) : null;
                  formattedParcel = parcel ? formatParcelForEasyPost(parcel) : null;
                  logger.log('[shipment] Recalculated parcel for purchase', { formattedParcel });
                }
              } catch (storageError) {
                logger.error('[shipment] Failed to recalculate parcel:', storageError);
              }

              logger.log('[shipment] Calling purchase-shipment endpoint', {
                endpoint: `${backendUrl}/purchase-shipment`,
                rateId: selectedShipping.id
              });

              const response = await fetch(`${backendUrl}/purchase-shipment`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  toAddress: {
                    street1: toAddress.line1,
                    street2: toAddress.line2,
                    city: toAddress.city,
                    state: toAddress.state,
                    zip: toAddress.postal_code,
                    country: toAddress.country || 'US',
                  },
                  rateId: selectedShipping.id,
                  shipmentId: shipmentId,
                  parcel: formattedParcel,
                }),
              });

              const shipmentData = await response.json();

              logger.log('[shipment] Purchase shipment response received', {
                status: response.status,
                ok: response.ok,
                hasTrackingNumber: !!shipmentData.trackingNumber,
                hasLabelUrl: !!shipmentData.labelUrl
              });

              if (response.ok) {
                logger.log('[shipment] Shipment purchased successfully', shipmentData);
                // Pass shipment data along with payment success
                onSuccess(
                  paymentIntent?.id,
                  customerEmail,
                  customerName,
                  customerPhone,
                  shipmentData,
                  currentShippingAddress,
                  taxAmount
                );
              } else {
                logger.error('[shipment] Purchase shipment API call failed', {
                  status: response.status,
                  statusText: response.statusText
                });
                // Still proceed with payment success even if shipment purchase fails
                onSuccess(paymentIntent?.id, customerEmail, customerName, customerPhone, null, currentShippingAddress, taxAmount);
              }
            } else {
              logger.log('[shipment] No address available, skipping shipment purchase');
              // No address available, proceed without shipment purchase
              onSuccess(paymentIntent?.id, customerEmail, customerName, customerPhone, null, currentShippingAddress, taxAmount);
            }
          } catch (shipmentError) {
            logger.error('[shipment] Error during shipment purchase:', shipmentError);
            // Still proceed with payment success even if shipment purchase fails
            onSuccess(paymentIntent?.id, customerEmail, customerName, customerPhone, null, currentShippingAddress, taxAmount);
          }
        } else {
          logger.log('[shipment] Shipment purchase conditions not met, skipping', {
            deliveryMethod,
            selectedShippingId: selectedShipping.id
          });
          // Local pickup or no shipping rate selected
          onSuccess(paymentIntent?.id, customerEmail, customerName, customerPhone, null, currentShippingAddress, taxAmount);
        }
      }
    } catch (err) {
      setErrorMessage('Payment failed. Please try again.');
      setIsProcessing(false);
    }
  };

  const displayTotal = totalAmount + selectedShipping.price + taxAmount;

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
          <div className={`shipping-row ${deliveryMethod !== 'shipping' ? 'hidden' : ''}`}>
            <span>Shipping:</span>
            <span>{selectedShipping.price === 0 ? 'FREE' : `$${selectedShipping.price.toFixed(2)}`}</span>
          </div>
          <div className="tax-row">
            <span>Tax:</span>
            <span>${taxAmount.toFixed(2)}</span>
          </div>
          <div className="total-row">
            <span>Total:</span>
            <span className="total-amount">${displayTotal.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {stripeLoading && (
        <div className="loading-message">Loading payment form...</div>
      )}

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
              // Calculate tax for local pickup based on store location (California)
              calculateTaxForAddress({
                line1: '15215 Avis Ave',
                city: 'Lawndale',
                state: 'CA',
                postal_code: '90260',
                country: 'US'
              });
              onShippingChange({ id: 'local-pickup', label: 'Local Pickup', price: 0, description: 'Pick up at our location - Free' });
            }}
          >
            <span>Local Pickup</span>
          </div>
          <div
            className={`delivery-method-option ${deliveryMethod === 'shipping' ? 'selected' : ''}`}
            onClick={() => {
              setDeliveryMethod('shipping');
              // Tax will be calculated when address is completed
            }}
          >
            <span>Shipping</span>
          </div>
        </div>
      </div>

      {deliveryMethod === 'shipping' && (
        <div className="shipping-sections-container expanded">
          <div className="address-section">
            <h3>Shipping Address</h3>
            <AddressElement
              options={{ mode: 'shipping' }}
              onChange={handleAddressChange}
              onReady={() => {
                logger.log('[stripe] Shipping address element ready');
                setElementsMounted(prev => ({ ...prev, shipping: true }));
              }}
            />
            {!elementsMounted.shipping && <div className="debug-info">Shipping address loading...</div>}
          </div>

          <ShippingSelector
            onShippingChange={onShippingChange}
            selectedShipping={selectedShipping}
            shippingOptions={shippingOptions}
            isLoading={isLoadingShipping}
            showShippingOptions={shippingAddressComplete}
          />
        </div>
      )}

      <div className="address-section">
        <h3>Billing Address</h3>
        <AddressElement
          options={{ mode: 'billing' }}
          onReady={() => {
            logger.log('[stripe] Billing address element ready');
            setElementsMounted(prev => ({ ...prev, billing: true }));
          }}
        />
        {!elementsMounted.billing && <div className="debug-info">Billing address loading...</div>}
      </div>

      <div className="payment-element-container">
        <PaymentElement
          options={{
            fields: {
              billingDetails: {
                address: 'never',
              }
            },
          }}
          onReady={() => {
            logger.log('[stripe] Payment element ready');
            setElementsMounted(prev => ({ ...prev, payment: true }));
          }}
        />
        {!elementsMounted.payment && <div className="debug-info">Payment element loading...</div>}
      </div>

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
  onSuccess: (paymentIntentId?: string, shippingOption?: ShippingOption, email?: string, name?: string, phone?: string, shipmentData?: any, shippingAddress?: string, tax?: number) => void;
  onCancel: () => void;
}

const EmbeddedCheckout: React.FC<EmbeddedCheckoutProps> = ({
  clientSecret,
  totalAmount,
  onSuccess,
  onCancel,
}) => {
  const [stripeLoadError, setStripeLoadError] = useState<string | null>(null);
  const [selectedShipping, setSelectedShipping] = useState<ShippingOption>(
    DEFAULT_SHIPPING_OPTIONS[0] // Default to local pickup
  );

  const handleShippingChange = (option: ShippingOption) => {
    setSelectedShipping(option);
  };

  const handleAddressChange = (address: any) => {
    // Handle address change if needed for parent component
  };

  // Check if Stripe loaded successfully
  useEffect(() => {
    stripePromise.then(stripe => {
      if (!stripe) {
        setStripeLoadError('Stripe.js failed to load. Please refresh the page.');
        logger.error('[stripe] Stripe.js is null after loading');
      } else {
        logger.log('[stripe] Stripe.js loaded successfully', {
          hasClientSecret: !!clientSecret,
          clientSecretLength: clientSecret?.length,
          clientSecretPrefix: clientSecret?.substring(0, 10) + '...'
        });
      }
    });
  }, [clientSecret]);

  const handleSuccess = (paymentIntentId?: string, email?: string, name?: string, phone?: string, shipmentData?: any, shippingAddress?: string, tax?: number) => {
    logger.log('[EmbeddedCheckout] handleSuccess called with shippingAddress:', shippingAddress);
    onSuccess(paymentIntentId, selectedShipping, email, name, phone, shipmentData, shippingAddress, tax);
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
        fontSizeBase: '16px',
      },
      rules: {
        '.Input': {
          fontSize: '16px',
          padding: '12px',
        },
        '.Label': {
          fontSize: '14px',
        },
      },
    },
  };

  return (
    <div className="embedded-checkout-container">
      {stripeLoadError && (
        <div className="error-message">
          {stripeLoadError}
        </div>
      )}
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
