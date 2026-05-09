import { Item, ItemType } from "../shop/item/ItemModel";
import { CoffeeBagWeight } from "../shop/item/coffee_bag/CoffeeBagItem";

export interface CartItemSelection {
    weight?: CoffeeBagWeight;
    size?: string;
    shopifyVariantId?: string;
}

export interface CartItem {
    item: Item;
    quantity: number;
    selections: CartItemSelection;
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
        const basePrice = cartItem.item.price;

        if (cartItem.item.itemType === ItemType.beans && cartItem.selections.weight) {
            const weightMultiplier = cartItem.selections.weight / 12;
            return basePrice * weightMultiplier;
        }

        return basePrice;
    }

    updateQuantity(index: number, newQuantity: number): void {
        if (newQuantity <= 0) {
            this.removeItem(index);
        } else {
            this.cartItems[index].quantity = newQuantity;
        }
    }

    addItem(item: Item, quantity: number = 1, selections: CartItemSelection = {}): { success: boolean; message: string } {
        if (item.quantity === 0) {
            return { success: false, message: 'Item is out of stock' };
        }

        const existingIndex = this.cartItems.findIndex(
            ci => ci.item.id === item.id &&
                JSON.stringify(ci.selections) === JSON.stringify(selections)
        );

        if (existingIndex >= 0) {
            const newQuantity = this.cartItems[existingIndex].quantity + quantity;

            if (newQuantity > item.quantity) {
                return { success: false, message: `Only ${item.quantity} available in stock` };
            }

            this.cartItems[existingIndex].quantity = newQuantity;
            return { success: true, message: 'Quantity updated in cart' };
        } else {
            if (quantity > item.quantity) {
                return { success: false, message: `Only ${item.quantity} available in stock` };
            }

            this.cartItems.push({ item, quantity, selections });
            return { success: true, message: 'Item added to cart' };
        }
    }

    removeItem(index: number): void {
        this.cartItems.splice(index, 1);
    }

    getTotalItems(): number {
        return this.cartItems.reduce((total, cartItem) => total + cartItem.quantity, 0);
    }

    getShopifyLineItems(): Array<{ variantId: string; quantity: number }> {
        return this.cartItems
            .map(cartItem => {
                const variantId = cartItem.selections.shopifyVariantId || cartItem.item.shopifyVariantId;
                if (!variantId) {
                    console.warn(`No Shopify variant ID found for item: ${cartItem.item.name}`);
                    return null;
                }
                return {
                    variantId,
                    quantity: cartItem.quantity
                };
            })
            .filter((item): item is { variantId: string; quantity: number } => item !== null);
    }
}