/**
 * Address Validation Service
 * Validates addresses from Stripe AddressElement and EasyPost
 */

import { isShippingAllowedForCart } from './shippingLocationsService';

export interface Address {
    line1?: string;
    line2?: string;
    street1?: string;
    street2?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    zip?: string;
    country?: string;
}

export interface AddressValidationResult {
    isValid: boolean;
    isAllowedForShipping: boolean;
    errors: string[];
}

/**
 * Normalize address object to a consistent format
 * Handles both Stripe (line1, postal_code) and EasyPost (street1, zip) formats
 */
export const normalizeAddress = (address: Address): Address => {
    return {
        line1: address.line1 || address.street1,
        line2: address.line2 || address.street2,
        city: address.city,
        state: address.state,
        postal_code: address.postal_code || address.zip,
        country: address.country,
    };
};

/**
 * Validate address structure and required fields
 */
export const validateAddressStructure = (address: Address): { isValid: boolean; errors: string[] } => {
    const errors: string[] = [];
    const normalized = normalizeAddress(address);

    // Check required fields
    if (!normalized.line1 || normalized.line1.trim().length < 3) {
        errors.push('Street address is required and must be at least 3 characters');
    }

    if (!normalized.city || normalized.city.trim().length < 2) {
        errors.push('City is required and must be at least 2 characters');
    }

    if (!normalized.state || normalized.state.trim().length < 2) {
        errors.push('State is required');
    }

    if (!normalized.postal_code || normalized.postal_code.trim().length < 5) {
        errors.push('Postal code is required and must be at least 5 characters');
    }

    if (!normalized.country || normalized.country.trim().length < 2) {
        errors.push('Country is required');
    }

    // Validate US zip code format
    if (normalized.country && (normalized.country === 'US' || normalized.country === 'USA')) {
        const zipPattern = /^\d{5}(-\d{4})?$/;
        if (normalized.postal_code && !zipPattern.test(normalized.postal_code)) {
            errors.push('Invalid US zip code format (must be 12345 or 12345-6789)');
        }
    }

    // Validate US state code format
    if (normalized.country && (normalized.country === 'US' || normalized.country === 'USA')) {
        const statePattern = /^[A-Z]{2}$/;
        if (normalized.state && !statePattern.test(normalized.state.toUpperCase())) {
            errors.push('Invalid US state code (must be 2 letters, e.g., CA)');
        }
    }

    return {
        isValid: errors.length === 0,
        errors,
    };
};

/**
 * Comprehensive address validation including shipping location check
 * @param address - Address to validate
 * @param cartItems - Optional cart items to determine if California restriction applies
 */
export const validateAddress = (
    address: Address | null | undefined,
    cartItems?: any[]
): AddressValidationResult => {
    if (!address) {
        return {
            isValid: false,
            isAllowedForShipping: false,
            errors: ['Address is required'],
        };
    }

    const normalized = normalizeAddress(address);
    const structureValidation = validateAddressStructure(normalized);

    // Check if state is allowed for shipping based on cart contents
    // If cartItems not provided, default to California-only restriction
    const isAllowedForShipping = cartItems
        ? isShippingAllowedForCart(normalized.state, cartItems)
        : isShippingAllowedForCart(normalized.state, []);

    return {
        isValid: structureValidation.isValid,
        isAllowedForShipping,
        errors: structureValidation.errors,
    };
};

/**
 * Check if address is complete (all required fields present)
 * This is a lighter check than full validation
 */
export const isAddressComplete = (address: Address | null | undefined): boolean => {
    if (!address) return false;

    const normalized = normalizeAddress(address);

    return !!(
        normalized.line1 &&
        normalized.city &&
        normalized.state &&
        normalized.postal_code &&
        normalized.country
    );
};

/**
 * Validate Stripe AddressElement value
 * @param addressData - Address data from Stripe
 * @param cartItems - Optional cart items to determine if California restriction applies
 */
export const validateStripeAddress = (
    addressData: any,
    cartItems?: any[]
): AddressValidationResult => {
    const address = addressData?.address || addressData;
    return validateAddress(address, cartItems);
};

/**
 * Validate EasyPost address format
 * @param addressData - Address data from EasyPost
 * @param cartItems - Optional cart items to determine if California restriction applies
 */
export const validateEasyPostAddress = (
    addressData: any,
    cartItems?: any[]
): AddressValidationResult => {
    return validateAddress(addressData, cartItems);
};
