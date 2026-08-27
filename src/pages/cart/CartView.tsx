import React, { useMemo, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CartItem } from './CartViewModel';
import { ItemType } from '../shop/item/ItemModel';
import { useCart } from '../../contexts/CartContext';
import { useAccount } from '../../contexts/AccountContext';
import { stripeService } from '../../services/stripeService';
import EmbeddedCheckout from '../../components/EmbeddedCheckout';
import { ShippingOption } from '../../components/ShippingSelector';
import './Cart.css';
import { createLogger } from '../../util/logger';
import { allowsUnlimitedPurchases } from '../../util/limitedTimeOffer';

const logger = createLogger('CartView');
const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';

// Free shipping threshold
const FREE_SHIPPING_THRESHOLD = 40;

interface CartViewProps {
    availableHeight: number;
}

const CartView: React.FC<CartViewProps> = ({ availableHeight }) => {
    const navigate = useNavigate();
    const { cart: viewModel, forceUpdate, showToast } = useCart();
    const { isAuthenticated, token } = useAccount();
    const [pendingQuantities, setPendingQuantities] = useState<{ [key: number]: number }>({});
    const [updateTrigger, setUpdateTrigger] = useState(0);
    const [showCheckout, setShowCheckout] = useState(false);
    const [clientSecret, setClientSecret] = useState<string | null>(null);
    const [isLoadingCheckout, setIsLoadingCheckout] = useState(false);
    const [discountCodeInput, setDiscountCodeInput] = useState('');
    const [isValidatingDiscount, setIsValidatingDiscount] = useState(false);

    const subtotal = useMemo(() => viewModel.getSubtotal(), [viewModel.cartItems, updateTrigger]);
    const discountAmount = useMemo(() => viewModel.getDiscountAmount(), [viewModel.discountCode, subtotal]);
    const subtotalAfterDiscount = useMemo(() => viewModel.getSubtotalAfterDiscount(), [viewModel.discountCode, subtotal]);
    const isEmpty = useMemo(() => viewModel.cartItems.length === 0, [viewModel.cartItems, updateTrigger]);
    const qualifiesForFreeShipping = useMemo(() => subtotalAfterDiscount >= FREE_SHIPPING_THRESHOLD, [subtotalAfterDiscount]);

    const getPendingQuantity = useCallback((index: number) => {
        return pendingQuantities[index] ?? viewModel.cartItems[index]?.quantity ?? 1;
    }, [pendingQuantities, viewModel.cartItems]);

    const handleQuantityInputChange = useCallback((index: number, delta: number) => {
        setPendingQuantities(prev => {
            const currentPending = prev[index] ?? viewModel.cartItems[index]?.quantity ?? 1;
            const newQuantity = Math.max(0, currentPending + delta);
            return { ...prev, [index]: newQuantity };
        });
    }, [viewModel.cartItems]);

    const hasAnyChanges = useMemo(() => {
        return viewModel.cartItems.some((item, index) => {
            const pending = pendingQuantities[index];
            return pending !== undefined && pending !== item.quantity;
        });
    }, [viewModel.cartItems, pendingQuantities]);

    const handleUpdateCart = useCallback(() => {
        let hasErrors = false;
        const updates: Array<{ index: number; quantity: number; name: string }> = [];
        let removedCount = 0;
        let updatedCount = 0;

        viewModel.cartItems.forEach((cartItem, index) => {
            const newQuantity = pendingQuantities[index] ?? cartItem.quantity;
            if (newQuantity !== cartItem.quantity) {
                let availableQuantity = cartItem.item.quantity;
                if (cartItem.variantSku && cartItem.item.variants && cartItem.item.variants.length > 0) {
                    const variant = cartItem.item.variants.find(v => v.sku === cartItem.variantSku);
                    if (variant) {
                        availableQuantity = variant.quantity;
                    }
                }
                // Only validate stock if trying to increase quantity (and not removing item)
                if (newQuantity > cartItem.quantity && newQuantity > availableQuantity && !allowsUnlimitedPurchases(cartItem.item)) {
                    showToast(`${cartItem.item.name}: Only ${availableQuantity} available in stock`, 'error');
                    hasErrors = true;
                } else {
                    updates.push({ index, quantity: newQuantity, name: cartItem.item.name });
                    if (newQuantity === 0) {
                        removedCount++;
                    } else {
                        updatedCount++;
                    }
                }
            }
        });

        if (hasErrors) return;

        // Process updates in reverse order to handle index shifting when removing items
        updates.reverse().forEach(({ index, quantity }) => {
            viewModel.updateQuantity(index, quantity);
        });

        setPendingQuantities({});
        setUpdateTrigger(prev => prev + 1);
        forceUpdate();

        // Show appropriate success message
        if (removedCount > 0 && updatedCount > 0) {
            showToast(`Cart updated: ${updatedCount} item(s) updated, ${removedCount} item(s) removed`, 'success');
        } else if (removedCount > 0) {
            showToast(`${removedCount} item(s) removed from cart`, 'success');
        } else if (updatedCount > 0) {
            showToast(`${updatedCount} item(s) updated`, 'success');
        }
    }, [viewModel, forceUpdate, showToast, pendingQuantities]);

    const handleContinueShopping = useCallback(() => {
        navigate('/shop');
    }, [navigate]);

    const handleClearCart = useCallback(() => {
        if (window.confirm('Are you sure you want to clear your cart?')) {
            viewModel.clearCart();
            setPendingQuantities({});
            setUpdateTrigger(prev => prev + 1);
            forceUpdate();
            showToast('Cart cleared', 'success');
        }
    }, [viewModel, forceUpdate, showToast]);

    const handleApplyDiscount = useCallback(async () => {
        if (!discountCodeInput.trim()) {
            showToast('Please enter a discount code', 'error');
            return;
        }

        setIsValidatingDiscount(true);
        try {
            const response = await fetch(`${backendUrl}/validate-discount-code`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ code: discountCodeInput.trim() }),
            });

            const data = await response.json();

            if (response.ok && data.valid) {
                viewModel.setDiscountCode(data.code, data.percentOff);
                setUpdateTrigger(prev => prev + 1);
                forceUpdate();
                showToast(data.message, 'success');
            } else {
                const errorMessage = data.message || data.error || 'Invalid discount code';
                showToast(errorMessage, 'error');
            }
        } catch (error) {
            logger.error('[discount] Error validating discount code:', error);
            showToast('Failed to validate discount code. Please try again.', 'error');
        } finally {
            setIsValidatingDiscount(false);
        }
    }, [discountCodeInput, viewModel, forceUpdate, showToast]);

    const handleRemoveDiscount = useCallback(() => {
        viewModel.clearDiscountCode();
        setDiscountCodeInput('');
        setUpdateTrigger(prev => prev + 1);
        forceUpdate();
        showToast('Discount code removed', 'success');
    }, [viewModel, forceUpdate, showToast]);

    const handleCheckout = useCallback(async () => {
        if (viewModel.cartItems.some((item) => item.selections.subscriptionPlan) && !isAuthenticated) {
            showToast('Please sign in or create an account before checking out with a subscription.', 'error');
            return;
        }
        if (hasAnyChanges) {
            showToast('Please update your cart before proceeding to checkout', 'error');
            return;
        }

        setIsLoadingCheckout(true);
        try {
            const totalAmount = subtotalAfterDiscount;

            // Store cart items for tax calculation in embedded checkout
            try {
                // Include item shippingWeight and variants array with shippingWeight for shipping calculation
                const cartItemsWithVariants = viewModel.cartItems.map(item => ({
                    ...item,
                    item: {
                        ...item.item,
                        shippingWeight: item.item.shippingWeight,
                        variants: item.item.variants?.map(v => ({
                            sku: v.sku,
                            shippingWeight: v.shippingWeight,
                        })),
                    },
                }));
                localStorage.setItem('checkout_cart_items', JSON.stringify(cartItemsWithVariants));
                logger.log('[checkout] Stored cart items with shipping weights:', {
                    items: cartItemsWithVariants.map(item => ({
                        sku: item.item.sku,
                        shippingWeight: item.item.shippingWeight,
                        variantSku: item.variantSku,
                        hasVariants: !!item.item.variants,
                        quantity: item.quantity,
                    })),
                });
            } catch (storageError) {
                logger.error('localStorage access failed (possibly Safari ITP):', storageError);
                // Continue without localStorage - checkout will use fallback
            }

            // Clear any existing clientSecret to force fresh PaymentIntent
            setClientSecret(null);

            logger.log('[checkout] Calling createPaymentIntent with amount:', totalAmount);
            const { clientSecret: secret } = await stripeService.createPaymentIntent(
                totalAmount,
                {
                    items: JSON.stringify(viewModel.cartItems.map(item => ({
                        id: item.variantSku || item.item.sku,
                        name: item.item.name,
                        quantity: item.quantity,
                        price: item.variantPrice || item.item.price,
                        subscriptionPlan: item.selections.subscriptionPlan || ''
                    }))),
                    discountCode: viewModel.discountCode?.code || '',
                    discountPercent: viewModel.discountCode?.percentOff?.toString() || ''
                },
                token
            );

            logger.log('[checkout] Payment intent created successfully');
            setClientSecret(secret);
            setShowCheckout(true);
        } catch (error) {
            logger.error('[checkout] Error creating payment intent:', error);
            showToast('Failed to initialize checkout. Please try again.', 'error');
        } finally {
            setIsLoadingCheckout(false);
        }
    }, [hasAnyChanges, isAuthenticated, showToast, subtotalAfterDiscount, token, viewModel.cartItems, viewModel.discountCode]);

    const handleCheckoutSuccess = useCallback(async (
        paymentIntentId?: string,
        shippingOption?: ShippingOption,
        email?: string,
        name?: string,
        phone?: string,
        shipmentData?: any,
        shippingAddress?: string,
        tax?: number,
        shippingAddressData?: any
    ) => {
        logger.log('CartView handleCheckoutSuccess called with shippingAddress:', shippingAddress);
        setShowCheckout(false);
        setClientSecret(null);

        const customerEmail = email || 'customer@example.com';
        const customerName = name || 'Valued Customer';
        const customerPhone = phone || '';

        logger.log('Payment successful:', { paymentIntentId, customerEmail, customerName, customerPhone });

        const shippingCost = shippingOption?.price || 0;
        const taxAmount = tax || 0;
        const totalWithShippingAndTax = subtotalAfterDiscount + shippingCost + taxAmount;

        // Store order data before clearing cart
        const orderData = {
            paymentIntentId,
            subscriptionItems: viewModel.cartItems.filter((item) => item.selections.subscriptionPlan).map((item) => ({
                plan: item.selections.subscriptionPlan,
                itemSku: item.variantSku || item.item.sku,
                itemName: item.item.name,
                weight: item.selections.weight || '',
                unitAmount: item.variantPrice || viewModel.getItemPrice(item),
            })),
            items: viewModel.cartItems.map(item => ({
                name: item.item.name,
                quantity: item.quantity,
                price: item.variantPrice || viewModel.getItemPrice(item),
                sku: item.variantSku || item.item.sku,
                image: item.item.firebaseImageUrls?.[0] || '/assets/images/shop_placeholder.png',
                selections: {
                    ...item.selections,
                    sku: item.variantSku || item.item.sku
                }
            })),
            subtotal: subtotal,
            discountCode: viewModel.discountCode?.code,
            discountPercent: viewModel.discountCode?.percentOff,
            discountAmount: discountAmount,
            subtotalAfterDiscount: subtotalAfterDiscount,
            shipping: shippingCost,
            tax: tax,
            shippingMethod: shippingOption?.label || 'Standard Shipping',
            total: totalWithShippingAndTax,
            timestamp: new Date().toISOString(),
            shipmentData: shipmentData || null,
            shippingAddress: shippingAddress || null,
            shippingAddressData: shippingAddressData || null,
            isLocalPickup: shippingOption?.id === 'local-pickup' || false
        };

        viewModel.cartItems = [];
        viewModel.clearDiscountCode();
        forceUpdate();
        showToast('Payment successful! Thank you for your purchase.', 'success');

        // Navigate with order data in state
        navigate('/order-confirmation', {
            state: {
                orderData,
                fromEmbeddedCheckout: true,
                customerEmail,
                customerName,
                customerPhone
            }
        });
    }, [viewModel, forceUpdate, showToast, navigate, subtotal, subtotalAfterDiscount, discountAmount]);

    const handleCheckoutCancel = useCallback(() => {
        setShowCheckout(false);
        setClientSecret(null);
    }, []);

    const formatWeight = (weight: string): string => {
        return weight;
    };

    const renderCartItem = (cartItem: CartItem, index: number) => {
        const itemPrice = viewModel.getItemPrice(cartItem);
        const itemTotal = itemPrice * cartItem.quantity;
        const pendingQty = getPendingQuantity(index);
        const imageUrl = cartItem.item.firebaseImageUrls?.[0] || '/assets/images/shop_placeholder.png';

        return (
            <div key={index} className="cart-item">
                <div className="cart-item-image">
                    <img src={imageUrl} alt={cartItem.item.name} />
                </div>

                <div className="cart-item-details">
                    <h3 className="cart-item-name">{cartItem.item.name}</h3>

                    {cartItem.item.itemType === ItemType.coffee && cartItem.selections.weight && (
                        <p className="cart-item-selection">
                            Weight: {formatWeight(cartItem.selections.weight)}
                        </p>
                    )}
                    {cartItem.selections.subscriptionPlan && (
                        <p className="cart-item-selection">Subscription: {cartItem.selections.subscriptionPlan.includes('every-other') ? 'every other roast' : 'every roast'} · Save 5%</p>
                    )}

                    {cartItem.selections.size && (
                        <p className="cart-item-selection">
                            Size: {cartItem.selections.size}
                        </p>
                    )}

                    <p className="cart-item-price">${itemPrice.toFixed(2)} each</p>
                </div>

                <div className="cart-item-quantity">
                    <button
                        className="quantity-btn"
                        onClick={() => handleQuantityInputChange(index, -1)}
                        disabled={pendingQty <= 0}
                    >
                        −
                    </button>
                    <span className="quantity-value">{pendingQty}</span>
                    <button
                        className="quantity-btn"
                        onClick={() => handleQuantityInputChange(index, 1)}
                    >
                        +
                    </button>
                </div>

                <div className="cart-item-total">
                    <p className="item-total-price">${itemTotal.toFixed(2)}</p>
                </div>
            </div>
        );
    };

    if (isEmpty) {
        return (
            <div className="cart-page" style={{ minHeight: availableHeight }}>
                <div className="cart-empty">
                    <h1 className="cart-title">Your Cart</h1>
                    <div className="empty-cart-content">
                        <p className="empty-cart-message">No items added to cart</p>
                        <button
                            className="continue-shopping-btn"
                            onClick={handleContinueShopping}
                        >
                            Continue Shopping
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="cart-page" style={{ minHeight: availableHeight }}>
            <div className="cart-container">
                <h1 className="cart-title">Your Cart</h1>

                <div className="cart-items-list">
                    {viewModel.cartItems.map((cartItem, index) => renderCartItem(cartItem, index))}
                </div>

                <div className="cart-summary">
                    <div className="discount-code-section">
                        <h3>Discount Code</h3>
                        {!viewModel.discountCode ? (
                            <div className="discount-input-group">
                                <input
                                    type="text"
                                    value={discountCodeInput}
                                    onChange={(e) => setDiscountCodeInput(e.target.value.toUpperCase())}
                                    placeholder="Enter code"
                                    className="discount-input"
                                    disabled={isValidatingDiscount}
                                />
                                <button
                                    onClick={handleApplyDiscount}
                                    className="apply-discount-btn"
                                    disabled={isValidatingDiscount || !discountCodeInput.trim()}
                                >
                                    {isValidatingDiscount ? 'Validating...' : 'Apply'}
                                </button>
                            </div>
                        ) : (
                            <div className="discount-applied">
                                <div className="discount-info">
                                    <span className="discount-code-text">{viewModel.discountCode.code}</span>
                                    <span className="discount-percent">({viewModel.discountCode.percentOff}% off)</span>
                                </div>
                                <button
                                    onClick={handleRemoveDiscount}
                                    className="remove-discount-btn"
                                >
                                    Remove
                                </button>
                            </div>
                        )}
                    </div>

                    {qualifiesForFreeShipping && (
                        <div className="free-shipping-notice">
                            🎉 You qualify for free USPS Ground Advantage shipping!
                        </div>
                    )}

                    <div className="summary-row">
                        <span className="summary-label">Subtotal:</span>
                        <span className="summary-value">${subtotal.toFixed(2)}</span>
                    </div>
                    {viewModel.discountCode && (
                        <>
                            <div className="summary-row discount-row">
                                <span className="summary-label">Discount ({viewModel.discountCode.code}):</span>
                                <span className="summary-value discount-value">-${discountAmount.toFixed(2)}</span>
                            </div>
                            <div className="summary-row total-after-discount">
                                <span className="summary-label">Subtotal after discount:</span>
                                <span className="summary-value">${subtotalAfterDiscount.toFixed(2)}</span>
                            </div>
                        </>
                    )}

                    <div className="cart-actions">
                        <button
                            className="continue-shopping-btn-secondary"
                            onClick={handleContinueShopping}
                        >
                            Continue Shopping
                        </button>
                        {hasAnyChanges && (
                            <button
                                className="update-cart-btn"
                                onClick={handleUpdateCart}
                            >
                                Update Cart
                            </button>
                        )}
                        <button
                            className="clear-cart-btn"
                            onClick={handleClearCart}
                        >
                            Clear Cart
                        </button>
                        <button
                            className="checkout-btn"
                            onClick={handleCheckout}
                            disabled={isLoadingCheckout}
                        >
                            {isLoadingCheckout ? 'Loading...' : 'Checkout'}
                        </button>
                    </div>
                </div>
            </div>

            {showCheckout && clientSecret && (
                <div className="checkout-modal-overlay" onClick={handleCheckoutCancel}>
                    <div className="checkout-modal-content" onClick={(e) => e.stopPropagation()}>
                        <EmbeddedCheckout
                            clientSecret={clientSecret}
                            totalAmount={subtotalAfterDiscount}
                            onSuccess={handleCheckoutSuccess}
                            onCancel={handleCheckoutCancel}
                            discountCode={viewModel.discountCode}
                            hasSubscription={viewModel.cartItems.some((item) => !!item.selections.subscriptionPlan)}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default CartView;
