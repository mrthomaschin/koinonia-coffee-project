/**
 * EasyPost Rate Mapper
 * Maps raw EasyPost rate data to user-friendly display formats
 */

import {
    EasyPostRate,
    MappedShippingRate,
    ALLOWED_SERVICES,
    getServiceClass
} from '../models/ShippingModels';

/**
 * Carrier name mapping for display purposes
 */
const CARRIER_NAMES: Record<string, string> = {
    'USPS': 'USPS',
    'UPSDAP': 'UPS',
    'FedExDefault': 'FedEx',
};

/**
 * Format price to currency string
 */
export const formatPrice = (price: number): string => {
    return `$${price.toFixed(2)}`;
};

/**
 * Format estimated delivery days to user-friendly string
 */
export const formatEstimatedDelivery = (days: number): string => {
    if (days === 1) {
        return '1 day';
    }
    return `${days} days`;
};

/**
 * Filter rates by allowed services
 */
export const filterAllowedServices = (rates: EasyPostRate[]): EasyPostRate[] => {
    return rates.filter((rate) =>
        ALLOWED_SERVICES.some((allowed) =>
            allowed.carrier === rate.carrier && allowed.service === rate.service
        )
    );
};

/**
 * Map raw EasyPost rate to user-friendly format
 */
export const mapEasyPostRate = (rate: EasyPostRate): MappedShippingRate => {
    const carrierName = CARRIER_NAMES[rate.carrier] || rate.carrier;
    const serviceClass = getServiceClass(rate.carrier, rate.service);
    const serviceName = serviceClass?.displayName || rate.service;

    return {
        id: rate.id,
        carrier: carrierName,
        service: rate.service,
        displayService: serviceName,
        price: formatPrice(rate.rate),
        estimatedDelivery: formatEstimatedDelivery(rate.estimatedDays),
    };
};

/**
 * Map array of EasyPost rates to user-friendly format
 */
export const mapEasyPostRates = (rates: EasyPostRate[]): MappedShippingRate[] => {
    return rates.map(mapEasyPostRate);
};