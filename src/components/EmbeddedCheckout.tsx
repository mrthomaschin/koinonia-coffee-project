import React, { useState, useEffect, useRef } from 'react';
import { createLogger } from '../util/logger';
import { Elements, PaymentElement, useStripe, useElements, AddressElement } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import ShippingSelector, { ShippingOption, DEFAULT_SHIPPING_OPTIONS } from './ShippingSelector';
import { mapEasyPostRates, filterAllowedServices } from '../util/EasyPostMapper';
import { EasyPostRate } from '../models/ShippingModels';
import { TaxCodes } from '../constants/TaxCodes';
import { calculateParcel, formatParcelForEasyPost } from '../util/shipping';
import { SHIPPING_RESTRICTION_MESSAGE, cartContainsCoffee } from '../services/shippingLocationsService';
import { validateStripeAddress, type AddressValidationResult } from '../services/addressValidationService';
import { notionService, type OrderPickupOption } from '../services/notionService';
import './EmbeddedCheckout.css';

const logger = createLogger('EmbeddedCheckout');

// Free shipping threshold
const FREE_SHIPPING_THRESHOLD = 40;

const stripePromise = loadStripe(process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY || '').then(stripe => {
  logger.log('[stripe] Stripe.js loaded', { hasStripe: !!stripe });
  return stripe;
}).catch(error => {
  logger.error('[stripe] Stripe.js failed to load', error);
  return null;
});
const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';

const formatPickupTimeframe = (start: string, end: string | null): string => {
  const startDate = new Date(start);
  const endDate = end ? new Date(end) : null;
  const dateFormat: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' };
  const timeFormat: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
  const date = startDate.toLocaleDateString(undefined, dateFormat);
  const startTime = startDate.toLocaleTimeString(undefined, timeFormat);
  const endTime = endDate ? endDate.toLocaleTimeString(undefined, timeFormat) : null;
  return `${date}, ${startTime}${endTime ? `–${endTime}` : ''}`;
};

interface DiscountCodeProp {
  code: string;
  percentOff: number;
}

interface CheckoutFormProps {
  onSuccess: (paymentIntentId?: string, email?: string, name?: string, phone?: string, shipmentData?: any, shippingAddress?: string, tax?: number, shippingAddressData?: any, orderPickupId?: string) => void;
  onCancel: () => void;
  totalAmount: number;
  onShippingChange: (option: ShippingOption) => void;
  selectedShipping: ShippingOption;
  onAddressChange?: (address: any) => void;
  discountCode?: DiscountCodeProp | null;
  originalShippingPrice?: number;
  hasSubscription: boolean;
}

const CheckoutForm: React.FC<CheckoutFormProps> = ({
  onSuccess,
  onCancel,
  totalAmount,
  onShippingChange,
  selectedShipping,
  onAddressChange,
  discountCode
  , hasSubscription
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
  const [showShippingRestriction, setShowShippingRestriction] = useState(false);
  const [addressValidation, setAddressValidation] = useState<AddressValidationResult | null>(null);
  const [pickupOptions, setPickupOptions] = useState<OrderPickupOption[]>([]);
  const [selectedPickupId, setSelectedPickupId] = useState('');
  const [isLoadingPickupOptions, setIsLoadingPickupOptions] = useState(false);
  const [pickupOptionsError, setPickupOptionsError] = useState<string | null>(null);
  const [originalShippingPrice, setOriginalShippingPrice] = useState(0);
  const shippingRequestRef = useRef<AbortController | null>(null);
  const deliveryMethodRef = useRef(deliveryMethod);
  deliveryMethodRef.current = deliveryMethod;
  const qualifiesForFreeShipping = totalAmount >= FREE_SHIPPING_THRESHOLD;

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

  const getCartItems = (): any[] => {
    try {
      const cartItemsStr = localStorage.getItem('checkout_cart_items');
      if (cartItemsStr) {
        return JSON.parse(cartItemsStr);
      }
    } catch (error) {
      logger.error('[cart] Failed to get cart items from localStorage:', error);
    }
    return [];
  };

  useEffect(() => {
    if (deliveryMethod !== 'pickup') return;

    let cancelled = false;
    const loadPickupOptions = async () => {
      setIsLoadingPickupOptions(true);
      setPickupOptionsError(null);
      try {
        const options = await notionService.getOrderPickupOptions(
          cartContainsCoffee(getCartItems())
        );
        if (!cancelled) {
          setPickupOptions(options);
          setSelectedPickupId((current) => options.some((option) => option.pickupId === current)
            ? current
            : options[0]?.pickupId || '');
        }
      } catch {
        if (!cancelled) {
          setPickupOptions([]);
          setSelectedPickupId('');
          setPickupOptionsError('Pickup times are temporarily unavailable. Please try again.');
        }
      } finally {
        if (!cancelled) setIsLoadingPickupOptions(false);
      }
    };

    loadPickupOptions();
    return () => { cancelled = true; };
    // Pickup options are loaded when the user chooses local pickup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryMethod]);


  const fetchShippingRatesFromEasyPost = async (address: any) => {
    if (!address || !address.line1 || !address.city || !address.state || !address.postal_code || !address.country) {
      return;
    }

    // Validate address before calling EasyPost API
    const cartItems = getCartItems();
    const validation = validateStripeAddress(address, cartItems);

    logger.log('[shipping] Validating address before EasyPost API call', {
      isValid: validation.isValid,
      isAllowedForShipping: validation.isAllowedForShipping,
      errors: validation.errors,
    });

    // Don't call API if address is invalid or not in allowed shipping locations
    if (!validation.isValid || !validation.isAllowedForShipping) {
      logger.log('[shipping] Skipping EasyPost API call - address validation failed');
      setIsLoadingShipping(false);
      setShippingOptions([]);
      return;
    }

    shippingRequestRef.current?.abort();
    const requestController = new AbortController();
    shippingRequestRef.current = requestController;
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
        signal: requestController.signal,
        body: JSON.stringify({ toAddress, parcel: formattedParcel }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch shipping rates: ${errorText}`);
      }

      const data = await response.json();

      // A request can finish after the user changes delivery method. Only the
      // latest request may update shipping state or the selected shipping option.
      if (shippingRequestRef.current !== requestController || deliveryMethodRef.current !== 'shipping') {
        logger.log('[shipping] Ignoring stale shipping rates response');
        return;
      }

      // Store shipment ID for later use in purchase
      if (data.shipmentId) {
        setShipmentId(data.shipmentId);
      }

      // Filter rates by allowed services using EasyPostMapper
      const filteredRates = filterAllowedServices(data.rates as EasyPostRate[]);

      // Map filtered rates using EasyPostMapper
      const mappedRates = mapEasyPostRates(filteredRates);

      // Convert mapped rates to ShippingOption format
      // Only apply free shipping to USPS Ground Advantage
      const options: ShippingOption[] = mappedRates.map((mappedRate) => {
        const originalPrice = parseFloat(mappedRate.price.replace('$', ''));
        const isGroundAdvantage = mappedRate.carrier === 'USPS' && mappedRate.service === 'GroundAdvantage';
        const discountedPrice = qualifiesForFreeShipping && isGroundAdvantage ? 0 : originalPrice;

        return {
          id: mappedRate.id,
          label: `${mappedRate.carrier} ${mappedRate.displayService}`,
          price: discountedPrice,
          description: `Estimated delivery: ${mappedRate.estimatedDelivery}`,
          carrier: mappedRate.carrier,
          service: mappedRate.service,
          originalPrice: isGroundAdvantage ? originalPrice : undefined,
        };
      });

      // Sort shipping options by price (cheapest to most expensive)
      options.sort((a, b) => a.price - b.price);

      // Only update shipping options if still in shipping mode
      // This prevents race condition when user switches to pickup while rates are loading
      if (shippingRequestRef.current === requestController && deliveryMethodRef.current === 'shipping') {
        setShippingOptions(options);

        // Select the first option by default
        if (options.length > 0) {
          const firstOption = options[0];
          // Store original price for display purposes
          if (qualifiesForFreeShipping) {
            const originalPrice = parseFloat(mappedRates[0].price.replace('$', ''));
            setOriginalShippingPrice(originalPrice);
          }
          onShippingChange(firstOption);
        }
      } else {
        logger.log('[shipping] Ignoring shipping rates - user switched to pickup');
      }
    } catch (error) {
      // On error, show no shipping options (only if still in shipping mode)
      if (error instanceof DOMException && error.name === 'AbortError') {
        logger.log('[shipping] Shipping rates request cancelled');
      } else if (shippingRequestRef.current === requestController && deliveryMethodRef.current === 'shipping') {
        setShippingOptions([]);
      }
    } finally {
      if (shippingRequestRef.current === requestController) {
        shippingRequestRef.current = null;
        setIsLoadingShipping(false);
      }
    }
  };

  const handleAddressChange = async (event: any) => {
    const addressData = event.value;

    // Stripe's AddressElement should provide complete property
    // Try multiple ways to access it
    const isComplete = event.complete || addressData?.complete;

    if (isComplete) {
      setShippingAddressComplete(true);

      // Validate the address using the validation service
      const address = addressData?.address || addressData;
      const cartItems = getCartItems();
      const hasCoffee = cartContainsCoffee(cartItems);
      const validation = validateStripeAddress(address, cartItems);
      setAddressValidation(validation);

      logger.log('[address] Validation result', {
        isValid: validation.isValid,
        isAllowedForShipping: validation.isAllowedForShipping,
        errors: validation.errors,
        cartHasCoffee: hasCoffee,
        state: address.state,
      });

      // If address structure is invalid, don't proceed
      if (!validation.isValid) {
        logger.log('[address] Address structure is invalid', { errors: validation.errors });
        setShippingOptions(DEFAULT_SHIPPING_OPTIONS);
        setIsLoadingShipping(false);
        setTaxAmount(0);
        setShippingAddressComplete(false);
        setShowShippingRestriction(false);
        return;
      }

      // Check if address is in an allowed shipping state (only for shipping mode)
      if (deliveryMethod === 'shipping') {
        if (!validation.isAllowedForShipping) {
          logger.log('[shipping] Address not in allowed shipping states', { state: address.state });
          setShowShippingRestriction(true);
          setShippingOptions([]);
          setIsLoadingShipping(false);
          setTaxAmount(0);
          setShippingAddressComplete(false);
          return;
        } else {
          // Clear restriction if address is now valid
          setShowShippingRestriction(false);
        }
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
        // Only fetch if still in shipping mode
        if (deliveryMethod === 'shipping') {
          await fetchShippingRatesFromEasyPost(address);
        }
      }, 2000);

      setDebounceTimer(timer);
    } else {
      setShippingAddressComplete(false);
      setAddressValidation(null);
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
        // Capture the pickup ID before the shipping branch narrows deliveryMethod.
        const orderPickupId = deliveryMethod === 'pickup' ? selectedPickupId : undefined;

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
                  taxAmount,
                  currentAddress,
                  orderPickupId
                );
              } else {
                logger.error('[shipment] Purchase shipment API call failed', {
                  status: response.status,
                  statusText: response.statusText
                });
                // Still proceed with payment success even if shipment purchase fails
                onSuccess(paymentIntent?.id, customerEmail, customerName, customerPhone, null, currentShippingAddress, taxAmount, currentAddress, orderPickupId);
              }
            } else {
              logger.log('[shipment] No address available, skipping shipment purchase');
              // No address available, proceed without shipment purchase
              onSuccess(paymentIntent?.id, customerEmail, customerName, customerPhone, null, currentShippingAddress, taxAmount, currentAddress, orderPickupId);
            }
          } catch (shipmentError) {
            logger.error('[shipment] Error during shipment purchase:', shipmentError);
            // Still proceed with payment success even if shipment purchase fails
            onSuccess(paymentIntent?.id, customerEmail, customerName, customerPhone, null, currentShippingAddress, taxAmount, currentAddress, orderPickupId);

          }
        } else {
          logger.log('[shipment] Shipment purchase conditions not met, skipping', {
            deliveryMethod,
            selectedShippingId: selectedShipping.id
          });
          // Local pickup or no shipping rate selected
          onSuccess(paymentIntent?.id, customerEmail, customerName, customerPhone, null, currentShippingAddress, taxAmount, currentAddress, orderPickupId);
        }
      }
    } catch (err) {
      setErrorMessage('Payment failed. Please try again.');
      setIsProcessing(false);
    }
  };

  const displayTotal = totalAmount + selectedShipping.price + taxAmount;

  // Check if form is ready for submission
  const isFormValid = () => {
    // Check required contact fields
    if (!customerName.trim() || !customerEmail || !customerPhone) {
      logger.log('[form] Form invalid: missing contact fields', {
        hasName: !!customerName.trim(),
        hasEmail: !!customerEmail,
        hasPhone: !!customerPhone,
      });
      return false;
    }

    // Check email and phone validation
    if (!validateEmail(customerEmail) || !validatePhone(customerPhone)) {
      logger.log('[form] Form invalid: email or phone format incorrect');
      return false;
    }

    if (deliveryMethod === 'pickup' && !selectedPickupId) {
      return false;
    }

    // For shipping mode, check if address is complete and valid
    if (deliveryMethod === 'shipping') {
      // If shipping restriction is shown, form is invalid
      if (showShippingRestriction) {
        logger.log('[form] Form invalid: shipping restriction shown');
        return false;
      }
      // Address must be complete
      if (!shippingAddressComplete) {
        logger.log('[form] Form invalid: shipping address not complete');
        return false;
      }
      // Address must pass validation (structure and shipping location)
      if (!addressValidation || !addressValidation.isValid || !addressValidation.isAllowedForShipping) {
        logger.log('[form] Form invalid: address validation failed', {
          hasValidation: !!addressValidation,
          isValid: addressValidation?.isValid,
          isAllowedForShipping: addressValidation?.isAllowedForShipping,
        });
        return false;
      }
    }

    logger.log('[form] Form is valid');
    return true;
  };

  return (
    <>
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
            {discountCode && (
              <div className="discount-row">
                <span>Discount ({discountCode.code} - {discountCode.percentOff}% off):</span>
                <span className="discount-amount">-${(totalAmount * (discountCode.percentOff / 100)).toFixed(2)}</span>
              </div>
            )}
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
              className={`delivery-method-option ${deliveryMethod === 'shipping' ? 'selected' : ''}`}
              onClick={() => {
                setDeliveryMethod('shipping');
                // Reset shipping options to prevent showing stale local pickup option
                setShippingOptions([]);
                // If we have a current address, recalculate tax and shipping rates
                if (currentAddress && shippingAddressComplete) {
                  calculateTaxForAddress(currentAddress);
                  // Fetch shipping rates (function has internal guard for deliveryMethod)
                  fetchShippingRatesFromEasyPost(currentAddress);
                } else {
                  // Clear tax if no address is available yet
                  setTaxAmount(0);
                }
              }}
            >
              <span>Shipping</span>
            </div>
            <div
              className={`delivery-method-option ${deliveryMethod === 'pickup' ? 'selected' : ''}`}
              onClick={() => {
                shippingRequestRef.current?.abort();
                shippingRequestRef.current = null;
                setDeliveryMethod('pickup');
                // Cancel any pending shipping rate fetches
                if (debounceTimer) {
                  clearTimeout(debounceTimer);
                  setDebounceTimer(null);
                }
                // Clear shipping options and loading state
                setShippingOptions([]);
                setIsLoadingShipping(false);
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
          </div>
        </div>

        {deliveryMethod === 'pickup' && (
          <div className="pickup-info-container expanded">
            <div className="pickup-info-text">
              <div>Choose a pickup time and location. Local pickup is free.</div>
              <label htmlFor="pickup-option" className="pickup-select-label">Pickup time and location *</label>
              {isLoadingPickupOptions ? (
                <div className="loading-shipping">Loading pickup options...</div>
              ) : pickupOptionsError ? (
                <div className="field-error">{pickupOptionsError}</div>
              ) : (
                <select
                  id="pickup-option"
                  className="form-input pickup-select"
                  value={selectedPickupId}
                  onChange={(event) => setSelectedPickupId(event.target.value)}
                  required
                >
                  <option value="" disabled>Select a pickup option</option>
                  {pickupOptions.map((option) => (
                    <option key={option.id} value={option.pickupId}>
                      {formatPickupTimeframe(option.start, option.end)} — {option.address}
                    </option>
                  ))}
                </select>
              )}
              {!isLoadingPickupOptions && !pickupOptionsError && pickupOptions.length === 0 && (
                <div className="field-hint">No upcoming pickup options are available.</div>
              )}
            </div>
          </div>
        )}

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

            {showShippingRestriction && (
              <div className="shipping-restriction-container expanded">
                <div className="shipping-restriction-text">
                  {SHIPPING_RESTRICTION_MESSAGE}
                </div>
              </div>
            )}

            {qualifiesForFreeShipping && shippingAddressComplete && shippingOptions.length > 0 && (
              <div className="free-shipping-notice-checkout">
                🎉 Free USPS Ground Advantage shipping applied!
              </div>
            )}

            <ShippingSelector
              onShippingChange={onShippingChange}
              selectedShipping={selectedShipping}
              shippingOptions={shippingOptions}
              isLoading={isLoadingShipping}
              showShippingOptions={shippingAddressComplete}
              qualifiesForFreeShipping={qualifiesForFreeShipping}
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
            disabled={!stripe || isProcessing || !isFormValid()}
            className="pay-btn"
          >
            {isProcessing ? 'Processing...' : `Pay $${displayTotal.toFixed(2)}`}
          </button>
        </div>
        {hasSubscription && <p className="subscription-disclosure">Your cart contains an automatically renewing subscription. By clicking "Pay now," <strong>you expressly and affirmatively agree that you will be automatically charged the recurring amount(s) shown in your cart (plus shipping and taxes) until the subscription(s) ends or you cancel.</strong> <strong>You may cancel anytime by going to your account or contacting the store.</strong></p>}
      </form>
    </>
  );
};

interface DiscountCode {
  code: string;
  percentOff: number;
}

interface EmbeddedCheckoutProps {
  clientSecret: string;
  totalAmount: number;
  onSuccess: (paymentIntentId?: string, shippingOption?: ShippingOption, email?: string, name?: string, phone?: string, shipmentData?: any, shippingAddress?: string, tax?: number, shippingAddressData?: any, orderPickupId?: string) => void;
  onCancel: () => void;
  discountCode?: DiscountCode | null;
  hasSubscription: boolean;
}

const EmbeddedCheckout: React.FC<EmbeddedCheckoutProps> = ({
  clientSecret,
  totalAmount,
  onSuccess,
  onCancel,
  discountCode,
  hasSubscription,
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

  const handleSuccess = (paymentIntentId?: string, email?: string, name?: string, phone?: string, shipmentData?: any, shippingAddress?: string, tax?: number, shippingAddressData?: any, orderPickupId?: string) => {
    logger.log('[EmbeddedCheckout] handleSuccess called with shippingAddress:', shippingAddress);
    onSuccess(paymentIntentId, selectedShipping, email, name, phone, shipmentData, shippingAddress, tax, shippingAddressData, orderPickupId);
  };

  const options = {
    clientSecret,
    appearance: {
      theme: 'stripe' as const,
      variables: {
        colorPrimary: '#84825E',
        colorBackground: '#F8F5EB',
        colorText: '#2F2B39',
        colorDanger: '#df1b41',
        fontFamily: 'RethinkSans-Regular, sans-serif',
        spacingUnit: '4px',
        borderRadius: '0px',
        fontSizeBase: '14px',
      },
      rules: {
        '.Input': {
          fontSize: '14px',
          padding: '12px',
          borderColor: '#CBC5B9',
        },
        '.Label': {
          fontSize: '10px',
          letterSpacing: '1.5px',
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
          discountCode={discountCode}
          hasSubscription={hasSubscription}
        />
      </Elements>
    </div>
  );
};

export default EmbeddedCheckout;
