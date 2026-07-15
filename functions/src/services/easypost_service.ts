import { Request, Response } from 'express';
import { createLogger } from '../logger';
import EasyPost from '@easypost/api';

const logger = createLogger('easypost_service');

// Initialize EasyPost client
const getEasyPostClient = () => {
    const apiKey = process.env.EASYPOST_API_KEY;
    if (!apiKey) {
        throw new Error('EASYPOST_API_KEY environment variable is not set');
    }
    return new EasyPost(apiKey);
};

export interface Address {
    name?: string;
    company?: string;
    street1: string;
    street2?: string;
    city: string;
    state: string;
    zip: string;
    country: string;
    phone?: string;
    email?: string;
}

export interface Parcel {
    length: number;
    width: number;
    height: number;
    weight: number;
}

export interface ShippingRate {
    id: string;
    carrier: string;
    service: string;
    rate: number;
    estimatedDays: string;
}

export interface ShipmentRequest {
    toAddress: Address;
    fromAddress?: Address;
    parcel: Parcel;
}

// Default from address (your business address)
const DEFAULT_FROM_ADDRESS: Address = {
    name: 'Koinonia Coffee Project',
    street1: '15215 Avis Ave',
    city: 'Lawndale',
    state: 'CA',
    zip: '90260',
    country: 'US',
    phone: '858-705-2554',
};

// Default parcel dimensions (adjust based on your typical package)
const DEFAULT_PARCEL: Parcel = {
    length: 12,
    width: 10,
    height: 6,
    weight: 32, // in ounces (2 lbs)
};

/**
 * Create and verify an EasyPost Address object
 */
const createEasyPostAddress = async (client: any, addressData: Address, verify: boolean = true) => {
    try {
        const addressParams: any = {
            street1: addressData.street1,
            street2: addressData.street2,
            city: addressData.city,
            state: addressData.state,
            zip: addressData.zip,
            country: addressData.country,
        };

        // Add optional fields only if provided
        if (addressData.name) addressParams.name = addressData.name;
        if (addressData.company) addressParams.company = addressData.company;
        if (addressData.phone) addressParams.phone = addressData.phone;
        if (addressData.email) addressParams.email = addressData.email;

        logger.info('Creating address with params', { addressParams, verify });

        const address = await client.Address.create(addressParams);

        logger.info('Address created', {
            addressId: address.id,
            verifications: address.verifications
        });

        // Check if address verification failed (if verification was requested)
        if (verify && address.verifications && address.verifications.delivery) {
            const deliveryVerification = address.verifications.delivery;
            if (deliveryVerification.success === false) {
                logger.warn('Address verification failed', {
                    errors: deliveryVerification.errors,
                    originalAddress: addressParams
                });
                throw new Error('Address verification failed: ' + (deliveryVerification.errors?.[0]?.message || 'Invalid address'));
            }
        }

        return address;
    } catch (error) {
        logger.error('Error creating EasyPost address', { error: (error as Error).message });
        throw error;
    }
};

/**
 * Create an EasyPost Parcel object
 */
const createEasyPostParcel = async (client: any, parcelData: Parcel) => {
    try {
        const parcel = await client.Parcel.create({
            length: parcelData.length,
            width: parcelData.width,
            height: parcelData.height,
            weight: parcelData.weight,
        });
        return parcel;
    } catch (error) {
        logger.error('Error creating EasyPost parcel', { error: (error as Error).message });
        throw error;
    }
};

/**
 * Fetch shipping rates from EasyPost
 */
export const fetchShippingRates = async (
    toAddress: Address,
    fromAddress?: Address,
    parcel?: Parcel
): Promise<ShippingRate[]> => {
    try {
        const client = getEasyPostClient();

        // Use provided addresses/parcel or defaults
        const from = fromAddress || DEFAULT_FROM_ADDRESS;
        const pkg = parcel || DEFAULT_PARCEL;

        logger.info('Fetching shipping rates', {
            toAddress: toAddress.city,
            fromAddress: from.city
        });

        logger.info('Creating EasyPost objects with data', {
            from,
            to: toAddress,
            parcel: pkg
        });

        // Create EasyPost objects with address verification
        const [easyPostFromAddress, easyPostToAddress, easyPostParcel] = await Promise.all([
            createEasyPostAddress(client, from, false), // Don't verify from address (your address)
            createEasyPostAddress(client, toAddress, true), // Verify to address (customer address)
            createEasyPostParcel(client, pkg),
        ]);

        logger.info('EasyPost objects created successfully', {
            fromAddressId: easyPostFromAddress.id,
            toAddressId: easyPostToAddress.id,
            parcelId: easyPostParcel.id
        });

        // Create shipment
        logger.info('Creating shipment with EasyPost objects', {
            toAddressId: easyPostToAddress.id,
            fromAddressId: easyPostFromAddress.id,
            parcelId: easyPostParcel.id
        });

        const shipment = await client.Shipment.create({
            to_address: easyPostToAddress,
            from_address: easyPostFromAddress,
            parcel: easyPostParcel,
        });

        logger.info('Shipment created successfully', { shipmentId: shipment.id });

        // Get rates
        const rates = shipment.rates.map((rate: any) => ({
            id: rate.id,
            carrier: rate.carrier,
            service: rate.service,
            rate: parseFloat(rate.rate),
            estimatedDays: rate.est_delivery_days || 'Unknown',
        }));

        logger.info(`Fetched ${rates.length} shipping rates`);
        return rates;
    } catch (error) {
        logger.error('Error fetching shipping rates', { error: (error as Error).message });
        throw error;
    }
};

/**
 * Express handler for fetching shipping rates
 */
export const getShippingRates = async (req: Request, res: Response) => {
    try {
        const { toAddress, fromAddress, parcel } = req.body;

        if (!toAddress) {
            return res.status(400).json({ error: 'toAddress is required' });
        }

        // Validate required toAddress fields
        if (!toAddress.street1 || !toAddress.city || !toAddress.state || !toAddress.zip || !toAddress.country) {
            return res.status(400).json({
                error: 'toAddress must include street1, city, state, zip, and country'
            });
        }

        const rates = await fetchShippingRates(toAddress, fromAddress, parcel);
        return res.json({ rates });
    } catch (error) {
        logger.error('Error in getShippingRates handler', { error: (error as Error).message });
        return res.status(500).json({ error: (error as Error).message });
    }
};

/**
 * Purchase a shipping label
 */
export const purchaseShippingLabel = async (shipmentId: string, rateId: string) => {
    try {
        const client = getEasyPostClient();
        const shipment: any = await client.Shipment.retrieve(shipmentId);

        // Find the rate
        const rate = shipment.rates.find((r: any) => r.id === rateId);
        if (!rate) {
            throw new Error('Rate not found');
        }

        // Purchase the label
        await shipment.buy(rate.id);

        logger.info('Purchased shipping label', { shipmentId, rateId });
        return {
            labelUrl: shipment.postage_label.label_url,
            trackingNumber: shipment.tracking_code,
            trackingUrl: shipment.tracker.public_url,
        };
    } catch (error) {
        logger.error('Error purchasing shipping label', { error: (error as Error).message });
        throw error;
    }
};
