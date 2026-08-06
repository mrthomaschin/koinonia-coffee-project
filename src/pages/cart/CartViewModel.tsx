import { Item, ItemType } from "../shop/item/ItemModel";
import trackingService from "../../services/trackingService";
import { TaxCodes } from "../../constants/TaxCodes";
import { allowsUnlimitedPurchases } from "../../util/limitedTimeOffer";

export interface CartItemSelection {
    weight?: string;
    size?: string;
    color?: string;
    variantSku?: string;
    variantPrice?: number;
    variantShippingWeight?: number;
}

export interface CartItem {
    item: Item;
    quantity: number;
    selections: CartItemSelection;
    variantPrice?: number;
    variantSku?: string;
    taxCode?: string;
}

export interface DiscountCode {
    code: string;
    percentOff: number;
}

export class CartViewModel {
    cartItems: Array<CartItem> = [];
    discountCode: DiscountCode | null = null;

    getSubtotal(): number {
        return this.cartItems.reduce((total, cartItem) => {
            const itemPrice = this.getItemPrice(cartItem);
            return total + (itemPrice * cartItem.quantity);
        }, 0);
    }

    getDiscountAmount(): number {
        if (!this.discountCode) return 0;
        const subtotal = this.getSubtotal();
        return subtotal * (this.discountCode.percentOff / 100);
    }

    getSubtotalAfterDiscount(): number {
        return this.getSubtotal() - this.getDiscountAmount();
    }

    setDiscountCode(code: string, percentOff: number): void {
        this.discountCode = { code, percentOff };
    }

    clearDiscountCode(): void {
        this.discountCode = null;
    }

    getItemPrice(cartItem: CartItem): number {
        return cartItem.variantPrice ?? cartItem.item.price;
    }

    private getTaxCode(item: Item): string {
        // Map item types to tax codes
        switch (item.itemType) {
            case ItemType.coffee:
                return TaxCodes.COFFEE;
            case ItemType.apparel:
                return TaxCodes.APPAREL;
            case ItemType.drinkware:
                return TaxCodes.DRINKWARE;
            case ItemType.accessories:
            case ItemType.brewTools:
            case ItemType.stickers:
            default:
                return TaxCodes.MERCH;
        }
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
        // Only set variantSku if there's an actual variant selection, not for non-variant items
        let variantSku = selections.variantSku || undefined;
        let variantPrice = selections.variantPrice || item.price;
        let availableQuantity = item.quantity;
        let itemForLTOCheck = item;

        console.log('[CartViewModel] addItem called:', {
            itemSku: item.sku,
            variantSku,
            selections,
            hasVariants: !!item.variants,
        });

        // If variant SKU provided, get variant quantity and LTO properties
        if (selections.variantSku && item.variants && item.variants.length > 0) {
            const variant = item.variants.find(v => v.sku === selections.variantSku);
            if (variant) {
                availableQuantity = variant.quantity;
                itemForLTOCheck = variant as Item;
            }
        }

        // Check stock limits only if unlimited purchases is not enabled
        if (!allowsUnlimitedPurchases(itemForLTOCheck)) {
            if (availableQuantity === 0) {
                return { success: false, message: 'Item is out of stock' };
            }
            if (quantity > availableQuantity) {
                return { success: false, message: `Only ${availableQuantity} available in stock` };
            }
        }

        const existingIndex = this.cartItems.findIndex(
            ci => ci.variantSku === variantSku &&
                JSON.stringify(ci.selections) === JSON.stringify(selections)
        );

        if (existingIndex >= 0) {
            const newQuantity = this.cartItems[existingIndex].quantity + quantity;

            if (!allowsUnlimitedPurchases(itemForLTOCheck) && newQuantity > availableQuantity) {
                return { success: false, message: `Only ${availableQuantity} available in stock` };
            }

            this.cartItems[existingIndex].quantity = newQuantity;
            this.cartItems[existingIndex].variantPrice = variantPrice;
            this.cartItems[existingIndex].variantSku = variantSku;
            this.cartItems[existingIndex].taxCode = this.getTaxCode(item);
            trackingService.trackAddToCart(
                variantSku || item.sku,
                item.name,
                variantPrice,
                quantity
            );
            return { success: true, message: 'Quantity updated in cart' };
        } else {
            this.cartItems.push({ item, quantity, selections, variantPrice, variantSku, taxCode: this.getTaxCode(item) });
            trackingService.trackAddToCart(
                variantSku || item.sku,
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
                cartItem.variantSku || cartItem.item.sku,
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

    clearCart(): void {
        this.cartItems = [];
    }
}