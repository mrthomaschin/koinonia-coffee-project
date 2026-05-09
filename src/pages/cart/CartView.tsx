import React, { useMemo, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CartItem } from './CartViewModel';
import { ItemType } from '../shop/item/ItemModel';
import { CoffeeBagWeight } from '../shop/item/coffee_bag/CoffeeBagItem';
import { useCart } from '../../contexts/CartContext';
import { shopifyService } from '../../services/shopifyService';
import './Cart.css';

interface CartViewProps {
    availableHeight: number;
}

const CartView: React.FC<CartViewProps> = ({ availableHeight }) => {
    const navigate = useNavigate();
    const { cart: viewModel, forceUpdate, showToast } = useCart();
    const [pendingQuantities, setPendingQuantities] = useState<{ [key: number]: number }>({});
    const [updateTrigger, setUpdateTrigger] = useState(0);
    const [isCheckingOut, setIsCheckingOut] = useState(false);

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
                if (newQuantity > 0 && newQuantity > cartItem.item.quantity) {
                    showToast(`${cartItem.item.name}: Only ${cartItem.item.quantity} available in stock`, 'error');
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
        setIsCheckingOut(true);
        try {
            const lineItems = viewModel.getShopifyLineItems();

            if (lineItems.length === 0) {
                showToast('No items with Shopify variant IDs found. Please configure your products.', 'error');
                setIsCheckingOut(false);
                return;
            }

            if (lineItems.length < viewModel.cartItems.length) {
                showToast('Some items are missing Shopify configuration and will be skipped.', 'error');
            }

            const checkoutUrl = await shopifyService.createCheckout(lineItems);
            window.location.href = checkoutUrl;
        } catch (error) {
            console.error('Checkout error:', error);
            if (error instanceof Error) {
                showToast(error.message, 'error');
            } else {
                showToast('Failed to create checkout. Please try again.', 'error');
            }
            setIsCheckingOut(false);
        }
    }, [viewModel, showToast]);

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

    const renderCartItem = (cartItem: CartItem, index: number) => {
        const itemPrice = viewModel.getItemPrice(cartItem);
        const itemTotal = itemPrice * cartItem.quantity;
        const pendingQty = getPendingQuantity(index);

        return (
            <div key={index} className="cart-item">
                <div className="cart-item-image">
                    <img src={cartItem.item.image} alt={cartItem.item.name} />
                </div>

                <div className="cart-item-details">
                    <h3 className="cart-item-name">{cartItem.item.name}</h3>

                    {cartItem.item.itemType === ItemType.beans && cartItem.selections.weight && (
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
                            disabled={isCheckingOut}
                        >
                            {isCheckingOut ? 'Redirecting...' : 'Checkout'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CartView;