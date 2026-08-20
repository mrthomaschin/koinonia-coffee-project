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

export interface ShipmentStatus {
    status: string; // pre_transit, in_transit, out_for_delivery, delivered, etc.
    trackingNumber: string;
    trackingUrl?: string;
    estimatedDelivery?: string;
}

export async function getShipmentStatus(shipmentId: string): Promise<ShipmentStatus | null> {
    try {
        const client = getEasyPostClient();
        const shipment = await client.Shipment.retrieve(shipmentId);

        return {
            status: shipment.status || 'unknown',
            trackingNumber: shipment.tracking_code || '',
            trackingUrl: shipment.tracker?.public_url || '',
            estimatedDelivery: shipment.tracker?.est_delivery_date || '',
        };
    } catch (error) {
        logger.error('Error retrieving shipment status', {
            shipmentId,
            error: (error as Error).message,
        });
        return null;
    }
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
 * Purchase shipment with specific rate
 */
export const purchaseShipment = async (
    toAddress: Address,
    rateId: string,
    fromAddress?: Address,
    parcel?: Parcel,
    shipmentId?: string
): Promise<{ trackingNumber: string; labelUrl: string; shipmentId: string; carrier?: string; service?: string; shippingPrice?: number }> => {
    try {
        logger.info('Starting shipment purchase process', {
            step: 'init',
            rateId,
            toAddress: toAddress.city,
            toState: toAddress.state,
            hasShipmentId: !!shipmentId,
            shipmentId
        });

        const client = getEasyPostClient();

        let shipment: any;

        if (shipmentId) {
            logger.info('Retrieving existing shipment', { step: 'retrieve_shipment', shipmentId });
            shipment = await client.Shipment.retrieve(shipmentId);
            logger.info('Existing shipment retrieved', { step: 'shipment_retrieved', ratesCount: shipment.rates?.length || 0 });
        } else {
            // Use provided addresses/parcel or defaults
            const from = fromAddress || DEFAULT_FROM_ADDRESS;
            const pkg = parcel || DEFAULT_PARCEL;

            logger.info('Setting up shipment parameters', {
                step: 'params',
                fromAddress: from.city,
                fromState: from.state,
                toAddress: toAddress.city,
                toState: toAddress.state,
                parcel: pkg
            });

            // Create EasyPost objects
            logger.info('Creating EasyPost objects (address and parcel)', { step: 'create_objects' });

            const [easyPostFromAddress, easyPostToAddress, easyPostParcel] = await Promise.all([
                createEasyPostAddress(client, from, false),
                createEasyPostAddress(client, toAddress, true),
                createEasyPostParcel(client, pkg),
            ]);

            logger.info('EasyPost objects created successfully', {
                step: 'objects_created',
                fromAddressId: easyPostFromAddress.id,
                toAddressId: easyPostToAddress.id,
                parcelId: easyPostParcel.id
            });

            // Create shipment
            logger.info('Creating shipment with EasyPost', { step: 'create_shipment' });

            shipment = await client.Shipment.create({
                to_address: easyPostToAddress,
                from_address: easyPostFromAddress,
                parcel: easyPostParcel,
                options: {
                    label_format: 'PNG',
                    label_size: '4x6'
                }
            });

            logger.info('Shipment created successfully', {
                step: 'shipment_created',
                shipmentId: shipment.id,
                ratesCount: shipment.rates?.length || 0
            });
        }

        // Find and purchase the specific rate
        logger.info('Finding and purchasing specific rate', { step: 'find_rate', rateId });

        const rate = shipment.rates.find((r: any) => r.id === rateId);
        if (!rate) {
            logger.error('Rate not found in shipment', {
                step: 'rate_not_found',
                rateId,
                availableRates: shipment.rates?.map((r: any) => r.id)
            });
            throw new Error('Rate not found in shipment');
        }

        logger.info('Rate found, attempting purchase', {
            step: 'rate_found',
            rateId,
            service: rate.service,
            carrier: rate.carrier,
            price: rate.rate
        });

        // Purchase the shipment with the selected rate
        logger.info('Purchasing shipment with selected rate', { step: 'purchase' });

        const purchasedShipment = await client.Shipment.buy(shipment.id, rate.id);

        logger.info('Shipment purchased successfully', {
            step: 'purchase_complete',
            shipmentId: purchasedShipment.id,
            trackingNumber: purchasedShipment.tracking_code,
            labelUrl: purchasedShipment.postage_label?.label_url,
            carrier: purchasedShipment.selected_rate?.carrier,
            service: purchasedShipment.selected_rate?.service,
            shippingPrice: purchasedShipment.selected_rate?.rate
        });

        return {
            trackingNumber: purchasedShipment.tracking_code,
            labelUrl: purchasedShipment.postage_label.label_url,
            shipmentId: purchasedShipment.id,
            carrier: purchasedShipment.selected_rate?.carrier,
            service: purchasedShipment.selected_rate?.service,
            shippingPrice: Number(purchasedShipment.selected_rate?.rate),
        };
    } catch (error) {
        logger.error('Error purchasing shipment', {
            step: 'error',
            error: (error as Error).message,
            rateId,
            toAddress: toAddress.city
        });
        throw error;
    }
};
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
export interface ShippingRatesResponse {
    rates: ShippingRate[];
    shipmentId: string;
}

export const fetchShippingRates = async (
    toAddress: Address,
    fromAddress?: Address,
    parcel?: Parcel
): Promise<ShippingRatesResponse> => {
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
            options: {
                label_format: 'PNG',
                label_size: '4x6'
            }
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
        return { rates, shipmentId: shipment.id };
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
        return res.json({ rates: rates.rates, shipmentId: rates.shipmentId });
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
