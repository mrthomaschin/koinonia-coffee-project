import React, { useMemo, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CartItem } from './CartViewModel';
import { ItemType } from '../shop/item/ItemModel';
import { CoffeeBagWeight } from '../shop/item/coffee_bag/CoffeeBagItem';
import { useCart } from '../../contexts/CartContext';
import { stripeService } from '../../services/stripeService';
import EmbeddedCheckout from '../../components/EmbeddedCheckout';
import { ShippingOption } from '../../components/ShippingSelector';
import './Cart.css';
import { createLogger } from '../../util/logger';

const logger = createLogger('CartView');

interface CartViewProps {
    availableHeight: number;
}

const CartView: React.FC<CartViewProps> = ({ availableHeight }) => {
    const navigate = useNavigate();
    const { cart: viewModel, forceUpdate, showToast } = useCart();
    const [pendingQuantities, setPendingQuantities] = useState<{ [key: number]: number }>({});
    const [updateTrigger, setUpdateTrigger] = useState(0);
    const [showCheckout, setShowCheckout] = useState(false);
    const [clientSecret, setClientSecret] = useState<string | null>(null);
    const [isLoadingCheckout, setIsLoadingCheckout] = useState(false);

    const subtotal = useMemo(() => viewModel.getSubtotal(), [viewModel.cartItems, updateTrigger]);
    const isEmpty = useMemo(() => viewModel.cartItems.length === 0, [viewModel.cartItems, updateTrigger]);

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
                if (newQuantity > 0 && newQuantity > availableQuantity && availableQuantity > 0) {
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

    const handleCheckout = useCallback(async () => {
        if (hasAnyChanges) {
            showToast('Please update your cart before proceeding to checkout', 'error');
            return;
        }

        setIsLoadingCheckout(true);
        try {
            const totalAmount = subtotal;
            const { clientSecret: secret } = await stripeService.createPaymentIntent(
                totalAmount,
                {
                    items: JSON.stringify(viewModel.cartItems.map(item => ({
                        id: item.variantSku || item.item.sku,
                        name: item.item.name,
                        quantity: item.quantity,
                        price: item.variantPrice || item.item.price
                    })))
                }
            );

            setClientSecret(secret);
            setShowCheckout(true);
        } catch (error) {
            logger.error('Error creating payment intent:', error);
            showToast('Failed to initialize checkout. Please try again.', 'error');
        } finally {
            setIsLoadingCheckout(false);
        }
    }, [hasAnyChanges, showToast, subtotal, viewModel.cartItems]);

    const handleCheckoutSuccess = useCallback(async (
        paymentIntentId?: string,
        shippingOption?: ShippingOption,
        email?: string,
        name?: string,
        phone?: string
    ) => {
        setShowCheckout(false);
        setClientSecret(null);

        const customerEmail = email || 'customer@example.com';
        const customerName = name || 'Valued Customer';
        const customerPhone = phone || '';

        logger.log('Payment successful:', { paymentIntentId, customerEmail, customerName, customerPhone });

        const shippingCost = shippingOption?.price || 0;
        const totalWithShipping = subtotal + shippingCost;

        // Store order data before clearing cart
        const orderData = {
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
            shipping: shippingCost,
            shippingMethod: shippingOption?.label || 'Standard Shipping',
            total: totalWithShipping,
            timestamp: new Date().toISOString()
        };

        viewModel.cartItems = [];
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
    }, [viewModel, forceUpdate, showToast, navigate, subtotal]);

    const handleCheckoutCancel = useCallback(() => {
        setShowCheckout(false);
        setClientSecret(null);
    }, []);

    const formatWeight = (weight: CoffeeBagWeight): string => {
        switch (weight) {
            case CoffeeBagWeight._200g:
                return '200g';
            case CoffeeBagWeight._5lb:
                return '5lb';
            default:
                return '';
        }
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
                    <div className="summary-row">
                        <span className="summary-label">Subtotal:</span>
                        <span className="summary-value">${subtotal.toFixed(2)}</span>
                    </div>

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
                            totalAmount={subtotal}
                            onSuccess={handleCheckoutSuccess}
                            onCancel={handleCheckoutCancel}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default CartView;