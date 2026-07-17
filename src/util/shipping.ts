/**
 * Shipping utilities for calculating parcel dimensions and weight
 */

export interface Parcel {
    length: number;
    width: number;
    height: number;
    weight: number; // in ounces
}

// Use the actual CartItem structure from CartViewModel
export interface CartItem {
    item: {
        sku: string;
        shippingWeight?: number;
        weights?: string[];
        variants?: Array<{
            sku: string;
            shippingWeight?: number;
        }> | null;
    };
    quantity: number;
    selections?: {
        weight?: number | string;
        variantSku?: string;
        variantShippingWeight?: number;
    };
    variantSku?: string;
}

/**
 * Box sizes available for shipping
 */
const BOX_SIZES = {
    SMALL: {
        length: 6,
        width: 4,
        height: 2,
        maxWeightOunces: 12, // Fits 1 bag of coffee snug (7 oz + 4 oz box)
        boxWeightOunces: 4, // ~113g box weight
    },
    MEDIUM: {
        length: 8,
        width: 6,
        height: 3,
        maxWeightOunces: 28, // Fits 3 bags of coffee snug (21 oz + 6 oz box)
        boxWeightOunces: 6, // ~170g box weight
    },
    LARGE: {
        length: 10,
        width: 8,
        height: 4,
        maxWeightOunces: 96, // 6 lbs
        boxWeightOunces: 8, // ~227g box weight
    },
    XL: {
        length: 12,
        width: 10,
        height: 6,
        maxWeightOunces: 160, // 10 lbs
        boxWeightOunces: 12, // ~340g box weight
    },
    XXL: {
        length: 18,
        width: 14,
        height: 10,
        maxWeightOunces: 320, // 20 lbs
        boxWeightOunces: 20, // ~567g box weight
    },
} as const;

/**
 * Convert weight to ounces
 * Weight from Notion is always in grams (number)
 * Also handles CoffeeBagWeight enum values (200 for 200g, 5 for 5lb) for backward compatibility
 * Also handles string formats like "200g", "5lb" for backward compatibility
 */
export const convertWeightToOunces = (weight: string | number): number => {
    if (typeof weight === 'number') {
        // Handle CoffeeBagWeight enum values for backward compatibility
        if (weight === 200) {
            return 7; // 200g ≈ 7oz
        } else if (weight === 5) {
            return 80; // 5lb = 80oz
        }
        // Weight from Notion is always in grams
        return weight / 28.35;
    }

    const weightStr = String(weight).toLowerCase().trim();

    // Parse numeric value
    const match = weightStr.match(/(\d+(?:\.\d+)?)/);
    if (!match) {
        console.warn(`Invalid weight format: ${weight}`);
        return 0;
    }

    const value = parseFloat(match[1]);

    // Determine unit and convert to ounces
    if (weightStr.includes('g')) {
        // Grams to ounces
        return value / 28.35;
    } else if (weightStr.includes('lb')) {
        // Pounds to ounces
        return value * 16;
    } else if (weightStr.includes('oz')) {
        // Already in ounces
        return value;
    }

    // Default: assume grams if value > 100, else ounces
    return value > 100 ? value / 28.35 : value;
};

/**
 * Calculate total weight of cart items in ounces
 * Uses variantShippingWeight from selections if variant was selected, otherwise item.shippingWeight
 */
export const calculateTotalWeight = (cartItems: CartItem[]): number => {
    return cartItems.reduce((total, cartItem) => {
        let weight: number | undefined;

        // If variant was selected, use the variantShippingWeight stored in selections
        if (cartItem.selections?.variantShippingWeight) {
            weight = cartItem.selections.variantShippingWeight;
            console.log(`[Shipping] Using variant shippingWeight from selections for ${cartItem.item.sku}: ${weight}g`);
        }

        // Otherwise use item.shippingWeight
        if (!weight) {
            weight = cartItem.item.shippingWeight;
        }

        if (!weight) {
            console.warn(`No shipping weight found for item: ${cartItem.item.sku}`, {
                hasItemShippingWeight: !!cartItem.item.shippingWeight,
                hasVariantShippingWeight: !!cartItem.selections?.variantShippingWeight,
            });
            return total;
        }

        const weightInOunces = convertWeightToOunces(weight);
        console.log(`[Shipping] Item ${cartItem.item.sku}: shippingWeight=${weight}g, ${weightInOunces}oz, quantity=${cartItem.quantity}`);
        return total + (weightInOunces * cartItem.quantity);
    }, 0);
};

/**
 * Determine box size based on total weight
 * Returns parcel with total weight including box weight
 */
export const determineBoxSize = (totalWeightOunces: number): Parcel => {
    let boxSize;
    if (totalWeightOunces <= BOX_SIZES.SMALL.maxWeightOunces) {
        boxSize = BOX_SIZES.SMALL;
    } else if (totalWeightOunces <= BOX_SIZES.MEDIUM.maxWeightOunces) {
        boxSize = BOX_SIZES.MEDIUM;
    } else if (totalWeightOunces <= BOX_SIZES.LARGE.maxWeightOunces) {
        boxSize = BOX_SIZES.LARGE;
    } else if (totalWeightOunces <= BOX_SIZES.XL.maxWeightOunces) {
        boxSize = BOX_SIZES.XL;
    } else {
        boxSize = BOX_SIZES.XXL;
    }

    return {
        length: boxSize.length,
        width: boxSize.width,
        height: boxSize.height,
        weight: totalWeightOunces + boxSize.boxWeightOunces, // Include box weight
    };
};

/**
 * Calculate parcel for shipping based on cart items
 */
export const calculateParcel = (cartItems: CartItem[]): Parcel => {
    const totalWeight = calculateTotalWeight(cartItems);
    const parcel = determineBoxSize(totalWeight);

    console.log('[Shipping] Calculated parcel:', {
        itemsWeightOunces: totalWeight,
        totalWeightOunces: parcel.weight,
        boxWeightOunces: parcel.weight - totalWeight,
        parcel,
    });

    return parcel;
};

/**
 * Format parcel for EasyPost API
 */
export const formatParcelForEasyPost = (parcel: Parcel) => {
    return {
        length: parcel.length,
        width: parcel.width,
        height: parcel.height,
        weight: Math.round(parcel.weight), // EasyPost expects rounded weight
    };
};
