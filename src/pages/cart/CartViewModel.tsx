import { Item } from "../shop/item/ItemModel";
import { CoffeeBagWeight } from "../shop/item/coffee_bag/CoffeeBagItem";
import trackingService from "../../services/trackingService";

export interface CartItemSelection {
    weight?: CoffeeBagWeight;
    size?: string;
    color?: string;
    variantSku?: string;
    variantPrice?: number;
}

export interface CartItem {
    item: Item;
    quantity: number;
    selections: CartItemSelection;
    variantPrice?: number;
    variantSku?: string;
}

export class CartViewModel {
    cartItems: Array<CartItem> = [];

    getSubtotal(): number {
        return this.cartItems.reduce((total, cartItem) => {
            const itemPrice = this.getItemPrice(cartItem);
            return total + (itemPrice * cartItem.quantity);
        }, 0);
    }

    getItemPrice(cartItem: CartItem): number {
        return cartItem.variantPrice ?? cartItem.item.price;
    }

    updateQuantity(index: number, newQuantity: number): void {
        if (newQuantity <= 0) {
            this.removeItem(index);
        } else {
            this.cartItems[index].quantity = newQuantity;
        }
    }

    addItem(item: Item, quantity: number = 1, selections: CartItemSelection = {}): { success: boolean; message: string } {
        // Use variant SKU and price from selections if provided (passed from detail page)
        let variantSku = selections.variantSku || item.sku;
        let variantPrice = selections.variantPrice || item.price;

        // For stock checking: if variant SKU provided, try to find variant quantity, otherwise use parent quantity
        let availableQuantity = item.quantity;
        if (selections.variantSku && item.variants && item.variants.length > 0) {
            const variant = item.variants.find(v => v.sku === selections.variantSku);
            if (variant) {
                availableQuantity = variant.quantity;
            }
        }

        // Only check stock if we have a quantity requirement (parent items might have 0 quantity)
        // Variants are assumed to be in stock if they're being added
        if (!selections.variantSku && availableQuantity === 0) {
            return { success: false, message: 'Item is out of stock' };
        }

        const existingIndex = this.cartItems.findIndex(
            ci => ci.item.sku === variantSku &&
                JSON.stringify(ci.selections) === JSON.stringify(selections)
        );

        if (existingIndex >= 0) {
            const newQuantity = this.cartItems[existingIndex].quantity + quantity;

            if (newQuantity > availableQuantity && availableQuantity > 0) {
                return { success: false, message: `Only ${availableQuantity} available in stock` };
            }

            this.cartItems[existingIndex].quantity = newQuantity;
            this.cartItems[existingIndex].variantPrice = variantPrice;
            this.cartItems[existingIndex].variantSku = variantSku;
            trackingService.trackAddToCart(
                variantSku,
                item.name,
                variantPrice,
                quantity
            );
            return { success: true, message: 'Quantity updated in cart' };
        } else {
            if (quantity > availableQuantity && availableQuantity > 0) {
                return { success: false, message: `Only ${availableQuantity} available in stock` };
            }

            this.cartItems.push({ item, quantity, selections, variantPrice, variantSku });
            trackingService.trackAddToCart(
                variantSku,
                item.name,
                variantPrice,
                quantity
            );
            return { success: true, message: 'Item added to cart' };
        }
    }

    removeItem(index: number): void {
        const cartItem = this.cartItems[index];
        if (cartItem) {
            trackingService.trackRemoveFromCart(
                cartItem.item.sku,
                cartItem.item.name,
                this.getItemPrice(cartItem),
                cartItem.quantity
            );
        }
        this.cartItems.splice(index, 1);
    }

    getTotalItems(): number {
        return this.cartItems.reduce((total, cartItem) => total + cartItem.quantity, 0);
    }
}