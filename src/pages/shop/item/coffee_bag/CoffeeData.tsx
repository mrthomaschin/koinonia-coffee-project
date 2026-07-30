import { ICONS } from "../../../../util/constants";

export interface BrewMethod {
    name: string;
    dose: string;
    yield: string;
    waterTemperature: string;
    ratio: string;
    milkRatio?: string;
    maxPressure?: string;
    time: string;
    description: string;
    icon: string;
}

export interface Coffee {
    name: string;
    origin: string;
    altitude: string;
    processing: string;
    variety: string;
    flavorProfile: string;
    roastLevel: string;
    roastDate: string;
    brewingMethods: BrewMethod[];
}

/**
 * COFFEES
 */

export class KoinBlend implements Coffee {
    name: string;
    origin: string;
    altitude: string;
    processing: string;
    variety: string;
    flavorProfile: string;
    roastLevel: string;
    roastDate: string;
    brewingMethods: BrewMethod[];

    constructor(
        origin: string,
        altitude: string,
        processing: string,
        variety: string,
        flavorProfile: string,
        roastLevel: string,
        roastDate: string,
        brewingMethods: BrewMethod[]
    ) {
        this.name = "Koin Blend";
        this.origin = origin;
        this.altitude = altitude;
        this.processing = processing;
        this.variety = variety;
        this.flavorProfile = flavorProfile;
        this.roastLevel = roastLevel;
        this.roastDate = roastDate;
        this.brewingMethods = brewingMethods;
    }
}

export class Ethiopia implements Coffee {
    name: string;
    origin: string;
    altitude: string;
    processing: string;
    variety: string;
    flavorProfile: string;
    roastLevel: string;
    roastDate: string;
    brewingMethods: BrewMethod[];

    constructor(
        origin: string,
        altitude: string,
        processing: string,
        variety: string,
        flavorProfile: string,
        roastLevel: string,
        roastDate: string,
        brewingMethods: BrewMethod[]
    ) {
        this.name = "Ethiopia Yirgacheffe";
        this.origin = origin;
        this.altitude = altitude;
        this.processing = processing;
        this.variety = variety;
        this.flavorProfile = flavorProfile;
        this.roastLevel = roastLevel;
        this.roastDate = roastDate;
        this.brewingMethods = brewingMethods;
    }
}

/**
 * BREW METHODS
 */

export class SingleDripper implements BrewMethod {
    name: string;
    dose: string;
    yield: string;
    waterTemperature: string;
    ratio: string;
    time: string;
    description: string;
    icon: string;

    constructor(
        coffee: string,
        water: string,
        waterTemperature: string,
        ratio: string,
        time: string,
        description: string,
    ) {
        this.name = "Single Dripper";
        this.dose = coffee;
        this.yield = water;
        this.waterTemperature = waterTemperature;
        this.ratio = ratio;
        this.time = time;
        this.description = description;
        this.icon = ICONS.v60;
    }
}

export class BatchDripper implements BrewMethod {
    name: string;
    dose: string;
    yield: string;
    waterTemperature: string;
    ratio: string;
    time: string;
    description: string;
    icon: string;

    constructor(
        coffee: string,
        water: string,
        waterTemperature: string,
        ratio: string,
        time: string,
        description: string,
    ) {
        this.name = "Batch Dripper";
        this.dose = coffee;
        this.yield = water;
        this.waterTemperature = waterTemperature;
        this.ratio = ratio;
        this.time = time;
        this.description = description;
        this.icon = ICONS.chemex;
    }
}

export class Espresso implements BrewMethod {
    name: string;
    dose: string;
    yield: string;
    waterTemperature: string;
    ratio: string;
    maxPressure: string;
    time: string;
    description: string;
    icon: string;

    constructor(
        coffee: string,
        water: string,
        waterTemperature: string,
        ratio: string,
        maxPressure: string,
        time: string,
        description: string,
    ) {
        this.name = "Espresso";
        this.dose = coffee;
        this.yield = water;
        this.waterTemperature = waterTemperature;
        this.ratio = ratio;
        this.maxPressure = maxPressure;
        this.time = time;
        this.description = description;
        this.icon = ICONS.espresso;
    }
}

export class MilkDrink implements BrewMethod {
    name: string;
    dose: string;
    yield: string;
    waterTemperature: string;
    ratio: string;
    milkRatio: string;
    maxPressure: string;
    time: string;
    description: string;
    icon: string;

    constructor(
        coffee: string,
        water: string,
        waterTemperature: string,
        ratio: string,
        milkRatio: string,
        maxPressure: string,
        time: string,
        description: string,
    ) {
        this.name = "Milk Drink";
        this.dose = coffee;
        this.yield = water;
        this.waterTemperature = waterTemperature;
        this.ratio = ratio;
        this.milkRatio = milkRatio;
        this.maxPressure = maxPressure;
        this.time = time;
        this.description = description;
        this.icon = ICONS.espresso;
    }
}

export const coffeeDataMap: Record<string, Coffee> = {
    'B-ETH-W': new Ethiopia(
        'Yirgacheffe, Ethiopia',
        '1,800-2,200m',
        'Washed',
        'Heirloom',
        'Bright and floral with notes of bergamot, jasmine, and citrus. Tea-like body with a clean finish.',
        'Light',
        new Date().toLocaleDateString(),
        [
            new SingleDripper(
                '20g',
                '300g',
                '93°C',
                '1:15',
                '2:30-3:00',
                'Perfect for highlighting delicate flavors and bright acidity. The slower extraction brings out clarity and complexity.',
            ),
            new BatchDripper(
                '60g',
                '1000g',
                '93°C',
                '1:16.7',
                '4:00-5:00',
                'Ideal for consistent, balanced cups when brewing for multiple people. Produces a clean, well-rounded flavor profile.',
            ),
            new Espresso(
                '18g',
                '36g',
                '93°C',
                '1:2',
                '9 bar',
                '25-30s',
                'Concentrated and intense, espresso emphasizes body and sweetness. Best for showcasing chocolate and caramel notes.',
            )
        ]
    ),
    'B-KOIN': new KoinBlend(
        'Ethiopia, Colombia',
        '1,600-2,000m',
        'Washed, Natural',
        'Heirloom, Caturra',
        'Well-balanced with chocolate, caramel, and nutty notes. Medium body with a smooth finish.',
        'Medium-Light',
        new Date().toLocaleDateString(),
        [
            new SingleDripper(
                '22g',
                '330g',
                '93°C',
                '1:15',
                '2:45-3:15',
                'Brings out the chocolate and caramel sweetness with a smooth, balanced body.',
            ),
            new BatchDripper(
                '65g',
                '1040g',
                '93°C',
                '1:16',
                '4:30-5:30',
                'Perfect for sharing, this method produces a crowd-pleasing cup with consistent flavor.',
            ),
            new Espresso(
                '18g',
                '40g',
                '93°C',
                '1:2.2',
                '9 bar',
                '27-32s',
                'Rich and full-bodied with pronounced chocolate and caramel notes. Excellent for milk-based drinks.',
            ),
            new MilkDrink(
                '18g',
                '40g',
                '93°C',
                '1:2.2',
                '1:3',
                '9 bar',
                '27-32s',
                'Ideal for lattes and cappuccinos. The chocolate and caramel notes shine through milk.',
            )
        ]
    ),
};

export const getCoffeeDataById = (id: string): Coffee | undefined => {
    return coffeeDataMap[id];
};