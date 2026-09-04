/**
 * Shipping Locations Service
 * Manages allowed shipping locations and validation
 */
import { ItemType } from '../pages/shop/item/ItemModel';

// Temporarily disabled while keeping the restriction configuration and
// validation logic available for a future re-enable.
export const SHIPPING_RESTRICTION_ENABLED = false;

export const ALLOWED_SHIPPING_STATES = ['CA', 'CALIFORNIA'];

export const SHIPPING_RESTRICTION_MESSAGE =
    'Due to health permitting regulations, we can only ship coffee to California addresses at this time. We apologize for the inconvenience.';

/**
 * Check if a state is allowed for shipping
 * @param state - State code or name to validate
 * @returns true if shipping is allowed to this state
 */
export const isStateAllowedForShipping = (state: string | undefined): boolean => {
    if (!SHIPPING_RESTRICTION_ENABLED) return true;
    if (!state) return false;

    const normalizedState = state.toUpperCase().trim();
    return ALLOWED_SHIPPING_STATES.includes(normalizedState);
};

/**
 * Validate if an address is allowed for shipping
 * @param address - Address object with state property
 * @returns true if shipping is allowed to this address
 */
export const isAddressAllowedForShipping = (address: { state?: string }): boolean => {
    return isStateAllowedForShipping(address.state);
};

/**
 * Check if cart contains coffee beans.
 * @param cartItems - Array of cart items from localStorage
 * @returns true if cart contains any coffee items
 */
export const cartContainsCoffee = (cartItems: any[]): boolean => {
    if (!cartItems || cartItems.length === 0) return false;

    return cartItems.some((cartItem: any) => {
        const item = cartItem.item;
        return item && item.itemType === ItemType.coffee;
    });
};

/**
 * Check if shipping location restriction should apply based on cart contents
 * Coffee items can only ship to California, other items can ship anywhere in USA
 * @param state - State code or name
 * @param cartItems - Array of cart items from localStorage
 * @returns true if shipping is allowed to this state for the given cart contents
 */
export const isShippingAllowedForCart = (state: string | undefined, cartItems: any[]): boolean => {
    if (!SHIPPING_RESTRICTION_ENABLED) return true;

    const hasCoffee = cartContainsCoffee(cartItems);

    // If cart has coffee, restrict to California only
    if (hasCoffee) {
        return isStateAllowedForShipping(state);
    }

    // If no coffee, allow shipping anywhere in USA
    // For now, we'll just return true, but you could add USA state validation here
    return true;
};
