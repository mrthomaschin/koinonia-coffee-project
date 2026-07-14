import { ICONS } from "../../../../util/constants";

export interface BrewMethod {
    name: string;
    coffee: string;
    water: string;
    ratio: string;
    time: string;
    description: string;
    brewMethodDescription: string;
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
    coffee: string;
    water: string;
    ratio: string;
    time: string;
    description: string;
    brewMethodDescription: string;
    icon: string;

    constructor(
        coffee: string,
        water: string,
        ratio: string,
        time: string,
        description: string,
        brewMethodDescription: string,
    ) {
        this.name = "Single Dripper";
        this.coffee = coffee;
        this.water = water;
        this.ratio = ratio;
        this.time = time;
        this.description = description;
        this.brewMethodDescription = brewMethodDescription;
        this.icon = ICONS.v60;
    }
}

export class BatchDripper implements BrewMethod {
    name: string;
    coffee: string;
    water: string;
    ratio: string;
    time: string;
    description: string;
    brewMethodDescription: string;
    icon: string;

    constructor(
        coffee: string,
        water: string,
        ratio: string,
        time: string,
        description: string,
        brewMethodDescription: string,
    ) {
        this.name = "Batch Dripper";
        this.coffee = coffee;
        this.water = water;
        this.ratio = ratio;
        this.time = time;
        this.description = description;
        this.brewMethodDescription = brewMethodDescription;
        this.icon = ICONS.chemex;
    }
}

export class Espresso implements BrewMethod {
    name: string;
    coffee: string;
    water: string;
    ratio: string;
    time: string;
    description: string;
    brewMethodDescription: string;
    icon: string;

    constructor(
        coffee: string,
        water: string,
        ratio: string,
        time: string,
        description: string,
        brewMethodDescription: string
    ) {
        this.name = "Espresso";
        this.coffee = coffee;
        this.water = water;
        this.ratio = ratio;
        this.time = time;
        this.description = description;
        this.brewMethodDescription = brewMethodDescription;
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
                '1:15',
                '2:30-3:00',
                'Perfect for highlighting delicate flavors and bright acidity. The slower extraction brings out clarity and complexity.',
                'The V60 pour-over method allows for precise control over brewing variables, making it ideal for showcasing the floral and citrus notes of Ethiopian coffee.'
            ),
            new BatchDripper(
                '60g',
                '1000g',
                '1:16.7',
                '4:00-5:00',
                'Ideal for consistent, balanced cups when brewing for multiple people. Produces a clean, well-rounded flavor profile.',
                'The Chemex batch brewer creates a clean cup that highlights the tea-like qualities and jasmine notes of this Ethiopian coffee.'
            ),
            new Espresso(
                '18g',
                '36g',
                '1:2',
                '25-30s',
                'Concentrated and intense, espresso emphasizes body and sweetness. Best for showcasing chocolate and caramel notes.',
                'As espresso, this Ethiopian coffee produces a sweet, syrupy shot with bright berry notes and a lingering floral finish.'
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
                '1:15',
                '2:45-3:15',
                'Brings out the chocolate and caramel sweetness with a smooth, balanced body.',
                'The V60 method highlights the blend\'s complexity, emphasizing the chocolate notes from Colombian beans and the brightness from Ethiopian origins.'
            ),
            new BatchDripper(
                '65g',
                '1040g',
                '1:16',
                '4:30-5:30',
                'Perfect for sharing, this method produces a crowd-pleasing cup with consistent flavor.',
                'Batch brewing creates a well-balanced cup that showcases the nutty undertones and caramel sweetness of the Koin Blend.'
            ),
            new Espresso(
                '18g',
                '40g',
                '1:2.2',
                '27-32s',
                'Rich and full-bodied with pronounced chocolate and caramel notes. Excellent for milk-based drinks.',
                'As espresso, the Koin Blend shines with a thick crema, chocolate body, and sweet caramel finish. Perfect for lattes and cappuccinos.'
            )
        ]
    ),
};

export const getCoffeeDataById = (id: string): Coffee | undefined => {
    return coffeeDataMap[id];
};