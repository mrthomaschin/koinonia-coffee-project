/**
 * Shipping Models
 * Defines interfaces and classes for shipping services and rates
 */

/**
 * Base Service interface for shipping services
 */
export interface Service {
    carrier: string;
    service: string;
    displayName: string;
}

/**
 * EasyPost Rate interface
 */
export interface EasyPostRate {
    id: string;
    carrier: string;
    service: string;
    rate: number;
    estimatedDays: number;
}

/**
 * Mapped Shipping Rate interface
 */
export interface MappedShippingRate {
    id: string;
    carrier: string;
    service: string;
    displayService: string;
    price: string;
    estimatedDelivery: string;
}

/**
 * USPS Services
 */
export class USPSGroundAdvantage implements Service {
    carrier = 'USPS';
    service = 'GroundAdvantage';
    displayName = 'Ground Advantage';
}

export class USPSPriority implements Service {
    carrier = 'USPS';
    service = 'Priority';
    displayName = 'Priority Mail';
}

export class USPSExpress implements Service {
    carrier = 'USPS';
    service = 'Express';
    displayName = 'Priority Mail Express';
}

/**
 * UPS Services
 */
export class UPSGround implements Service {
    carrier = 'UPSDAP';
    service = 'Ground';
    displayName = 'Ground';
}

export class UPS2ndDayAir implements Service {
    carrier = 'UPSDAP';
    service = '2ndDayAir';
    displayName = '2nd Day Air';
}

export class UPSNextDayAir implements Service {
    carrier = 'UPSDAP';
    service = 'NextDayAir';
    displayName = 'Next Day Air';
}

export class UPSNextDayAirSaver implements Service {
    carrier = 'UPSDAP';
    service = 'NextDayAirSaver';
    displayName = 'Next Day Air Saver';
}

export class UPSNextDayAirEarlyAM implements Service {
    carrier = 'UPSDAP';
    service = 'NextDayAirEarlyAM';
    displayName = 'Next Day Air Early AM';
}

export class UPS3DaySelect implements Service {
    carrier = 'UPSDAP';
    service = '3DaySelect';
    displayName = '3 Day Select';
}

export class UPSGroundSaver implements Service {
    carrier = 'UPSDAP';
    service = 'UPSGroundsaverGreaterThan1lb';
    displayName = 'Ground Saver';
}

/**
 * FedEx Services
 */
export class FedExGround implements Service {
    carrier = 'FedExDefault';
    service = 'FEDEX_GROUND';
    displayName = 'FedEx Ground';
}

export class FedEx2Day implements Service {
    carrier = 'FedExDefault';
    service = 'FEDEX_2_DAY';
    displayName = 'FedEx 2 Day';
}

export class FedEx2DayAM implements Service {
    carrier = 'FedExDefault';
    service = 'FEDEX_2_DAY_AM';
    displayName = 'FedEx 2 Day AM';
}

export class FedExFirstOvernight implements Service {
    carrier = 'FedExDefault';
    service = 'FIRST_OVERNIGHT';
    displayName = 'FedEx First Overnight';
}

export class FedExPriorityOvernight implements Service {
    carrier = 'FedExDefault';
    service = 'PRIORITY_OVERNIGHT';
    displayName = 'FedEx Priority Overnight';
}

export class FedExStandardOvernight implements Service {
    carrier = 'FedExDefault';
    service = 'STANDARD_OVERNIGHT';
    displayName = 'FedEx Standard Overnight';
}

export class FedExSmartPost implements Service {
    carrier = 'FedExDefault';
    service = 'SMART_POST';
    displayName = 'FedEx Smart Post';
}

export class FedExExpressSaver implements Service {
    carrier = 'FedExDefault';
    service = 'FEDEX_EXPRESS_SAVER';
    displayName = 'FedEx Express Saver';
}

/**
 * Allowed shipping services instances
 */
export const ALLOWED_SERVICES: Service[] = [
    new USPSGroundAdvantage(),
    new USPSPriority(),
    new UPSGround(),
    new UPS2ndDayAir(),
    new UPSNextDayAir(),
];

/**
 * Get service class by carrier and service name
 */
export const getServiceClass = (carrier: string, service: string): Service | null => {
    const allServices: Service[] = [
        new USPSGroundAdvantage(),
        new USPSPriority(),
        new USPSExpress(),
        new UPSGround(),
        new UPS2ndDayAir(),
        new UPSNextDayAir(),
        new UPSNextDayAirSaver(),
        new UPSNextDayAirEarlyAM(),
        new UPS3DaySelect(),
        new UPSGroundSaver(),
        new FedExGround(),
        new FedEx2Day(),
        new FedEx2DayAM(),
        new FedExFirstOvernight(),
        new FedExPriorityOvernight(),
        new FedExStandardOvernight(),
        new FedExSmartPost(),
        new FedExExpressSaver(),
    ];

    return allServices.find(s => s.carrier === carrier && s.service === service) || null;
};