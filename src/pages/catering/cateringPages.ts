// Content and structured data for /catering and its subpages.
// Kept free of imports so scripts/prerender-seo.js can load it at build time.

export const SITE_URL = "https://koinoniacoffeeproject.com";
export const HERO_IMAGE = `${SITE_URL}/assets/images/koinonia-29.jpg`;

export interface CateringFaq {
  question: string;
  answer: string;
}

export interface CateringHighlight {
  title: string;
  body: string;
}

interface AreaServed {
  "@type": "AdministrativeArea" | "City" | "Place";
  name: string;
}

export interface CateringPageConfig {
  path: string;
  kind: "hub" | "city" | "event";
  /** Short label used in breadcrumbs, link grids, and the footer. */
  navLabel: string;
  /** Visible h1 on the page. */
  title: string;
  /** <title> tag / og:title. */
  seoTitle: string;
  description: string;
  heroSubtitle: string;
  intro: string[];
  highlights?: {
    eyebrow: string;
    heading: string;
    items: CateringHighlight[];
  };
  /** Page-specific FAQs, shown ahead of the shared ones. */
  faqs?: CateringFaq[];
  serviceType?: string;
  areaServed?: AreaServed[];
}

const serviceAreaFaqs: CateringFaq[] = [
  {
    question: "Where do you cater?",
    answer:
      "We cater events throughout the greater Los Angeles area, including Los Angeles County, Orange County, and the Inland Empire.",
  },
  {
    question: "Is there a travel fee?",
    answer:
      "Travel is $1 per mile, round trip from our base in Lawndale, and is included in your custom quote. For most events in Los Angeles, that comes to about $20–$40.",
  },
];

const sharedFaqs: CateringFaq[] = [
  {
    question: "How do you price your packages?",
    answer:
      "Pricing is based on guest count, service length, and travel, and includes the staffing, equipment, and ingredients your event needs. We aim for competitive pricing without settling for less in our quality. Please choose your full service time when you request a quote.",
  },
  {
    question: "How far in advance should I book?",
    answer:
      "We recommend booking as early as you can, since each date can only go to one event. We need at least 4 days’ notice to prepare your coffee bar, and events booked within 10 days of the event date include a 10% short-notice fee.",
  },
  {
    question: "What is included in the coffee bar?",
    answer:
      "Our standard espresso bar includes hot and iced lattes, mochas, Americanos, and hot chocolate, plus whole milk, oat milk, house-made vanilla syrup, and Lactaid. Our freshly-made matcha and hojicha lattes are included as well. We provide the ingredients and materials and take care of setup, service, and tear-down.",
  },
  {
    question: "What add-ons are available?",
    answer:
      "You can add our Selah Decaf Blend, an additional barista, custom cups, custom cart branding, or a latte printer. Select them in the quote form and we’ll include them in your custom quote.",
  },
  {
    question: "Can you set up outside?",
    answer:
      "Yes! Our cart is fully self-contained with portable power included, so we can set up almost anywhere, no outlet needed.",
  },
  {
    question: "Do you offer service for night events?",
    answer:
      "Yes. We serve both daytime and evening events. For later gatherings, add our Selah Decaf Blend, served alongside our Koin Blend, so guests can enjoy the same coffee bar experience without the caffeine.",
  },
  {
    question: "How do I get a quote?",
    answer:
      "Fill out the quote form with a few details about your event, and we’ll follow up with a custom quote.",
  },
];

export const hubPage: CateringPageConfig = {
  path: "/catering",
  kind: "hub",
  navLabel: "Catering",
  title: "Coffee cart catering for your next event.",
  seoTitle:
    "Coffee Cart Catering in Southern California | Koinonia Coffee Project",
  description:
    "Book a mobile coffee cart for weddings, corporate events, and private gatherings in Los Angeles, Orange County, and the Inland Empire.",
  heroSubtitle: "Serving Los Angeles, Orange County, and the Inland Empire.",
  intro: [
    "Bring freshly prepared beverages and warm, professional service to your wedding, corporate event, or private gathering.",
  ],
  faqs: serviceAreaFaqs,
};

export const cateringPages: CateringPageConfig[] = [
  {
    path: "/catering/los-angeles",
    kind: "city",
    navLabel: "Los Angeles",
    title: "Coffee cart catering in Los Angeles.",
    seoTitle: "Los Angeles Coffee Cart Catering | Koinonia Coffee Project",
    description:
      "Book a mobile coffee cart in Los Angeles for weddings, corporate events, and private gatherings. Espresso, matcha, and hojicha drinks with full setup and service.",
    heroSubtitle:
      "From Downtown LA and the Westside to Pasadena and the South Bay.",
    intro: [
      "Los Angeles is home for us. Our cart is based in Lawndale, so most LA events are a short drive away, and that keeps travel costs low for you.",
      "Whether it’s a backyard wedding in Silver Lake, an office celebration in Culver City, or a studio launch in the Arts District, we bring a full espresso and matcha bar to you, with no outlet or water hookup needed.",
    ],
    highlights: {
      eyebrow: "EVENTS ACROSS LA",
      heading: "Coffee catering for every corner of Los Angeles.",
      items: [
        {
          title: "Weddings and receptions",
          body: "From garden venues in Pasadena to rooftop receptions downtown, a coffee bar keeps guests energized from cocktail hour through the last dance.",
        },
        {
          title: "Offices and studios",
          body: "Employee appreciation days, all-hands meetings, and client visits in Santa Monica, Culver City, Hollywood, and Downtown LA.",
        },
        {
          title: "Pop-ups and brand moments",
          body: "Custom cups and a branded cart for launches, retail activations, and creative events around the city.",
        },
        {
          title: "Low travel, easy logistics",
          body: "Travel is $1 per mile round trip from Lawndale, which comes to about $20–$40 for most events in Los Angeles. It’s built into your quote.",
        },
      ],
    },
    faqs: [
      {
        question: "Which parts of Los Angeles do you serve?",
        answer:
          "All of Los Angeles County, including Downtown LA, the Westside, Hollywood, Silver Lake, Pasadena, Long Beach, and the South Bay. If you’re unsure about your location, include it in the quote form and we’ll confirm.",
      },
      {
        question: "How much is travel within Los Angeles?",
        answer:
          "Travel is $1 per mile, round trip from our base in Lawndale. For most events in Los Angeles, that comes to about $20–$40, and it’s included in your custom quote.",
      },
      {
        question: "Can you serve at venues without power or water?",
        answer:
          "Yes. Our cart is fully self-contained with portable power, which makes it a good fit for parks, beaches, backyards, and other LA venues without hookups.",
      },
    ],
    areaServed: [
      { "@type": "City", name: "Los Angeles, CA" },
      { "@type": "AdministrativeArea", name: "Los Angeles County, CA" },
    ],
  },
  {
    path: "/catering/orange-county",
    kind: "city",
    navLabel: "Orange County",
    title: "Coffee cart catering in Orange County.",
    seoTitle: "Coffee Cart Catering Orange County | Koinonia Coffee Project",
    description:
      "Book a mobile coffee cart in Orange County for weddings, corporate events, and private gatherings, from Irvine and Anaheim to Huntington Beach and Newport Beach.",
    heroSubtitle:
      "Irvine, Anaheim, Costa Mesa, Huntington Beach, Newport Beach, and beyond.",
    intro: [
      "From business parks in Irvine to beachside celebrations in Huntington Beach and Newport Beach, we bring a full specialty coffee bar to events across Orange County.",
      "Our team handles setup, service, and tear-down, and our self-contained cart works just as well on a coastal lawn as it does in an office lobby.",
    ],
    highlights: {
      eyebrow: "EVENTS ACROSS OC",
      heading: "A café on wheels for Orange County events.",
      items: [
        {
          title: "Corporate events in Irvine and Costa Mesa",
          body: "Team breakfasts, conferences, and client appreciation days for offices and campuses across Irvine, Tustin, and Costa Mesa.",
        },
        {
          title: "Coastal weddings",
          body: "Garden and beachside weddings from Huntington Beach to Laguna Beach and San Clemente, with portable power so we can set up outdoors.",
        },
        {
          title: "Conventions and community events",
          body: "Trade shows, church gatherings, and community events in Anaheim, Fullerton, Orange, and Santa Ana.",
        },
        {
          title: "Clear travel pricing",
          body: "Travel is $1 per mile round trip from Lawndale. Most Orange County events come to about $50–$120, and the exact amount is in your quote.",
        },
      ],
    },
    faqs: [
      {
        question: "Which Orange County cities do you serve?",
        answer:
          "We serve all of Orange County, including Irvine, Anaheim, Santa Ana, Costa Mesa, Huntington Beach, Newport Beach, Fullerton, Tustin, Orange, Laguna Beach, and San Clemente.",
      },
      {
        question: "How much is travel to Orange County?",
        answer:
          "Travel is $1 per mile, round trip from our base in Lawndale. Most Orange County events come to about $50–$120, depending on the city, and it’s included in your custom quote.",
      },
    ],
    areaServed: [{ "@type": "AdministrativeArea", name: "Orange County, CA" }],
  },
  {
    path: "/catering/inland-empire",
    kind: "city",
    navLabel: "Inland Empire",
    title: "Coffee cart catering in the Inland Empire.",
    seoTitle: "Coffee Cart Catering Inland Empire | Koinonia Coffee Project",
    description:
      "Book a mobile coffee cart in the Inland Empire for weddings, corporate events, and private gatherings in Riverside, San Bernardino, Ontario, Rancho Cucamonga, and beyond.",
    heroSubtitle:
      "Riverside, Ontario, Rancho Cucamonga, Chino, Corona, and Temecula.",
    intro: [
      "The Inland Empire has some of Southern California’s best spaces for gatherings, from ranch and vineyard wedding venues to growing master-planned communities.",
      "We bring a full espresso and matcha bar to events across Riverside and San Bernardino counties, with everything we need on the cart, including power.",
    ],
    highlights: {
      eyebrow: "EVENTS ACROSS THE IE",
      heading: "Specialty coffee for Inland Empire events.",
      items: [
        {
          title: "Ranch and vineyard weddings",
          body: "Outdoor weddings in Temecula wine country, Riverside, and the foothills, where a self-contained cart makes service easy.",
        },
        {
          title: "Community and HOA events",
          body: "Neighborhood socials, clubhouse events, and resident appreciation days in Ontario Ranch, Eastvale, Chino, and Rancho Cucamonga.",
        },
        {
          title: "Workplace events",
          body: "Employee appreciation days and team events for offices, warehouses, and distribution centers across the region.",
        },
        {
          title: "Transparent travel",
          body: "Travel is $1 per mile round trip from Lawndale. Most Inland Empire events come to about $90–$170, and the exact amount is in your quote.",
        },
      ],
    },
    faqs: [
      {
        question: "Which Inland Empire cities do you serve?",
        answer:
          "We serve Riverside and San Bernardino counties, including Ontario, Ontario Ranch, Rancho Cucamonga, Chino, Chino Hills, Eastvale, Corona, Riverside, Fontana, Redlands, and Temecula.",
      },
      {
        question: "How much is travel to the Inland Empire?",
        answer:
          "Travel is $1 per mile, round trip from our base in Lawndale. Most Inland Empire events come to about $90–$170, and it’s included in your custom quote.",
      },
    ],
    areaServed: [
      { "@type": "AdministrativeArea", name: "Inland Empire, CA" },
      { "@type": "AdministrativeArea", name: "Riverside County, CA" },
      { "@type": "AdministrativeArea", name: "San Bernardino County, CA" },
    ],
  },
  {
    path: "/catering/torrance",
    kind: "city",
    navLabel: "Torrance",
    title: "Coffee cart catering in Torrance.",
    seoTitle: "Coffee Cart Catering Torrance, CA | Koinonia Coffee Project",
    description:
      "Book a mobile coffee cart in Torrance and the South Bay for weddings, corporate events, and private gatherings, with full setup, service, and tear-down.",
    heroSubtitle:
      "Torrance, Redondo Beach, Manhattan Beach, Hermosa Beach, and the South Bay.",
    intro: [
      "The South Bay is our neighborhood. Our cart is based in nearby Lawndale, so Torrance events are just minutes away.",
      "From Old Torrance to the neighborhoods around Del Amo and Wilson Park, we serve offices, churches, schools, and backyard celebrations across Torrance and the surrounding beach cities.",
    ],
    highlights: {
      eyebrow: "SOUTH BAY EVENTS",
      heading: "Your neighborhood coffee cart.",
      items: [
        {
          title: "Office and campus events",
          body: "Team breakfasts, employee appreciation days, and client visits for businesses across Torrance and El Segundo.",
        },
        {
          title: "Churches and schools",
          body: "Sunday gatherings, fundraisers, teacher appreciation, and community nights across the South Bay.",
        },
        {
          title: "Beach city celebrations",
          body: "Birthdays, showers, and weddings in Redondo Beach, Hermosa Beach, Manhattan Beach, and Palos Verdes.",
        },
        {
          title: "Minimal travel",
          body: "Travel is $1 per mile round trip from Lawndale, so most Torrance events come to around $10–$20.",
        },
      ],
    },
    faqs: [
      {
        question: "Which South Bay cities do you serve?",
        answer:
          "We serve all of the South Bay, including Torrance, Redondo Beach, Hermosa Beach, Manhattan Beach, El Segundo, Gardena, Lomita, Carson, and the Palos Verdes Peninsula.",
      },
      {
        question: "How much is travel to Torrance?",
        answer:
          "Travel is $1 per mile, round trip from our base in Lawndale. Most Torrance events come to around $10–$20, and it’s included in your custom quote.",
      },
    ],
    areaServed: [
      { "@type": "City", name: "Torrance, CA" },
      { "@type": "Place", name: "South Bay, Los Angeles" },
    ],
  },
  {
    path: "/catering/ontario-ranch",
    kind: "city",
    navLabel: "Ontario Ranch",
    title: "Coffee cart catering in Ontario Ranch.",
    seoTitle:
      "Coffee Cart Catering Ontario Ranch, CA | Koinonia Coffee Project",
    description:
      "Book a mobile coffee cart in Ontario Ranch for weddings, community events, and private gatherings, serving Ontario, Chino, Eastvale, and the surrounding Inland Empire.",
    heroSubtitle: "Serving Ontario Ranch, Ontario, Chino, and Eastvale.",
    intro: [
      "Ontario Ranch is one of the fastest-growing communities in the Inland Empire, with neighborhoods like New Haven, Esperanza, and Rich-Haven bringing new families, parks, and clubhouses to the area.",
      "We bring a full espresso and matcha bar to community gatherings, model home openings, and private celebrations across Ontario Ranch and nearby Chino and Eastvale.",
    ],
    highlights: {
      eyebrow: "ONTARIO RANCH EVENTS",
      heading: "Coffee for a growing community.",
      items: [
        {
          title: "HOA and community events",
          body: "Resident socials, clubhouse events, holiday gatherings, and park celebrations for Ontario Ranch neighborhoods.",
        },
        {
          title: "New home and model openings",
          body: "Give visitors a reason to stay longer at model home grand openings, realtor previews, and new-community events.",
        },
        {
          title: "Backyard celebrations",
          body: "Birthdays, baby showers, and graduation parties at home. Our cart needs no outlet, so it fits right into the backyard.",
        },
        {
          title: "Transparent travel",
          body: "Travel is $1 per mile round trip from Lawndale. Most Ontario Ranch events come to about $90–$100, and the exact amount is in your quote.",
        },
      ],
    },
    faqs: [
      {
        question: "Do you serve events in Ontario Ranch neighborhoods?",
        answer:
          "Yes. We serve neighborhoods across Ontario Ranch, as well as the rest of Ontario, Chino, Chino Hills, and Eastvale.",
      },
      {
        question: "How much is travel to Ontario Ranch?",
        answer:
          "Travel is $1 per mile, round trip from our base in Lawndale. Most Ontario Ranch events come to about $90–$100, and it’s included in your custom quote.",
      },
    ],
    areaServed: [
      { "@type": "Place", name: "Ontario Ranch, Ontario, CA" },
      { "@type": "City", name: "Ontario, CA" },
    ],
  },
  {
    path: "/catering/weddings",
    kind: "event",
    navLabel: "Weddings",
    title: "Coffee cart catering for your wedding day.",
    seoTitle: "Wedding Coffee Cart Catering | Koinonia Coffee Project",
    description:
      "Add a mobile coffee cart to your wedding. Espresso, matcha, and hojicha drinks served for your guests across Los Angeles, Orange County, and the Inland Empire.",
    heroSubtitle:
      "Weddings in Los Angeles, Orange County, and the Inland Empire.",
    intro: [
      "A coffee bar gives your guests something to gather around, whether it’s a latte during cocktail hour or an espresso before the dancing starts.",
      "We take care of setup, service, and tear-down so your planner has one less vendor to manage, and our self-contained cart works at venues with or without power.",
    ],
    highlights: {
      eyebrow: "YOUR WEDDING",
      heading: "Ways couples use our coffee bar.",
      items: [
        {
          title: "Cocktail hour",
          body: "Give guests a non-alcoholic option that feels just as special, with iced lattes, matcha, and hojicha drinks.",
        },
        {
          title: "After dinner",
          body: "Pair the coffee bar with dessert and add our Selah Decaf Blend for evening receptions.",
        },
        {
          title: "Getting ready",
          body: "Keep the wedding party energized in the morning before photos and the ceremony.",
        },
        {
          title: "Personal touches",
          body: "Custom cups and a latte printer can carry your names, monogram, or wedding date.",
        },
      ],
    },
    faqs: [
      {
        question: "When should we book a coffee cart for our wedding?",
        answer:
          "As early as you can. Each date can only go to one event, and wedding dates book first. Once you have a date and venue, request a quote to hold your spot.",
      },
      {
        question: "Can you personalize the coffee bar for our wedding?",
        answer:
          "Yes. Add custom cups or a latte printer to feature your names, monogram, or wedding date, and we’ll include them in your custom quote.",
      },
    ],
    serviceType: "Wedding coffee cart catering",
  },
  {
    path: "/catering/corporate-events",
    kind: "event",
    navLabel: "Corporate Events",
    title: "Coffee cart catering for your next corporate event.",
    seoTitle: "Corporate Coffee Cart Catering | Koinonia Coffee Project",
    description:
      "Mobile espresso bar catering for corporate events, office parties, conferences, and employee appreciation days in Los Angeles, Orange County, and the Inland Empire.",
    heroSubtitle: "For offices, conferences, and company celebrations.",
    intro: [
      "A barista-made latte does more for morale than a coffee urn. Our mobile espresso bar turns an ordinary workday or conference into something people talk about.",
      "We handle everything from setup to tear-down, so your team can focus on the event itself.",
    ],
    highlights: {
      eyebrow: "AT WORK",
      heading: "Corporate events we serve.",
      items: [
        {
          title: "Employee appreciation",
          body: "Say thank you with unlimited specialty drinks for your whole team.",
        },
        {
          title: "Conferences and trade shows",
          body: "Draw people to your booth or keep attendees energized between sessions.",
        },
        {
          title: "Holiday parties",
          body: "Hot drinks, matcha, and decaf options for end-of-year celebrations.",
        },
        {
          title: "Client and recruiting events",
          body: "Custom cups and cart branding put your company’s name in every guest’s hand.",
        },
      ],
    },
    faqs: [
      {
        question: "Can you brand the coffee cart with our company logo?",
        answer:
          "Yes. Custom cart branding, custom cups, and a latte printer are available as add-ons, and we’ll include them in your custom quote.",
      },
      {
        question: "Can you serve inside our office?",
        answer:
          "Yes. Our cart is self-contained with portable power, so we can set up in lobbies, break rooms, courtyards, and event spaces.",
      },
    ],
    serviceType: "Corporate event coffee catering",
  },
  {
    path: "/catering/real-estate",
    kind: "event",
    navLabel: "Real Estate",
    title: "Coffee cart catering for open houses and real estate events.",
    seoTitle: "Real Estate & Open House Coffee Cart | Koinonia Coffee Project",
    description:
      "Draw more foot traffic to your open house, broker preview, or client appreciation event with a mobile coffee cart in Los Angeles, Orange County, and the Inland Empire.",
    heroSubtitle: "For agents, brokerages, and home builders.",
    intro: [
      "A coffee cart out front gives buyers and agents a reason to stop, come inside, and stay longer.",
      "We work with open houses, broker previews, and new-community openings, and our self-contained cart sets up on a driveway, patio, or model home courtyard.",
    ],
    highlights: {
      eyebrow: "REAL ESTATE",
      heading: "Events that bring people through the door.",
      items: [
        {
          title: "Open houses",
          body: "Stand out from the other listings on the weekend tour and give visitors a reason to linger.",
        },
        {
          title: "Broker previews",
          body: "Agents remember the listing with great coffee, and they bring their buyers back.",
        },
        {
          title: "Model home openings",
          body: "Welcome visitors to new communities, from the South Bay to Ontario Ranch.",
        },
        {
          title: "Client appreciation",
          body: "Thank past clients with custom cups featuring your name or brokerage.",
        },
      ],
    },
    faqs: [
      {
        question: "Can you set up on a driveway or front yard?",
        answer:
          "Yes. Our cart is fully self-contained with portable power, so we can set up on a driveway, patio, or lawn without an outlet.",
      },
    ],
    serviceType: "Open house and real estate event coffee catering",
  },
  {
    path: "/catering/grand-openings",
    kind: "event",
    navLabel: "Grand Openings",
    title: "Coffee cart catering for your grand opening.",
    seoTitle: "Grand Opening Coffee Cart Catering | Koinonia Coffee Project",
    description:
      "Celebrate your grand opening or ribbon cutting with a mobile espresso bar that brings people through the door. Serving Los Angeles, Orange County, and the Inland Empire.",
    heroSubtitle: "For storefronts, studios, offices, and ribbon cuttings.",
    intro: [
      "Free coffee is one of the simplest ways to draw a crowd on opening day.",
      "We set up outside or inside your new space, serve your guests, and pack up when the day is done.",
    ],
    highlights: {
      eyebrow: "OPENING DAY",
      heading: "Make your first day memorable.",
      items: [
        {
          title: "Foot traffic",
          body: "A coffee cart out front catches the attention of people walking by.",
        },
        {
          title: "Ribbon cuttings",
          body: "Give city officials, chamber members, and neighbors something to enjoy while they celebrate with you.",
        },
        {
          title: "Your brand in their hands",
          body: "Custom cups and cart branding help guests remember your name after they leave.",
        },
      ],
    },
    faqs: [
      {
        question: "Can you set up on a sidewalk or in a parking lot?",
        answer:
          "Yes. Our cart is fully self-contained with portable power. Let us know about your space in the quote form, and check any permits your property or city requires for outdoor setups.",
      },
    ],
    serviceType: "Grand opening coffee catering",
  },
  {
    path: "/catering/brand-activations",
    kind: "event",
    navLabel: "Brand Activations",
    title: "Coffee cart catering for brand activations and pop-ups.",
    seoTitle: "Brand Activation Coffee Cart | Koinonia Coffee Project",
    description:
      "Branded mobile coffee cart for brand activations, product launches, and pop-up events, with custom cups available. Serving Los Angeles, Orange County, and the Inland Empire.",
    heroSubtitle: "For product launches, pop-ups, and experiential marketing.",
    intro: [
      "A branded coffee cart gives people a reason to stop, a drink to hold, and a moment to engage with your brand.",
      "We can wrap the cart in your branding, serve drinks in custom cups, and print your logo directly onto lattes.",
    ],
    highlights: {
      eyebrow: "ACTIVATIONS",
      heading: "Put your brand on every cup.",
      items: [
        {
          title: "Custom branded cart",
          body: "Your logo and colors on the cart itself, built into your custom quote.",
        },
        {
          title: "Latte printing",
          body: "Print your logo or campaign artwork right onto the foam for shareable drinks.",
        },
        {
          title: "Custom cups",
          body: "Branded cups that keep your name in guests’ hands long after they walk away.",
        },
        {
          title: "Set up anywhere",
          body: "Portable power means we can serve on a sidewalk, in a showroom, or at an outdoor festival.",
        },
      ],
    },
    faqs: [
      {
        question: "What branding options are available?",
        answer:
          "Custom cart branding, custom cups, and a latte printer are all available as add-ons. Select them in the quote form and we’ll include them in your custom quote.",
      },
    ],
    serviceType: "Brand activation coffee catering",
  },
];

export const cityPages = cateringPages.filter((page) => page.kind === "city");
export const eventPages = cateringPages.filter((page) => page.kind === "event");

export const faqsFor = (page: CateringPageConfig): CateringFaq[] => [
  ...(page.faqs ?? []),
  ...(page.kind === "event" ? serviceAreaFaqs : []),
  ...sharedFaqs,
];

const defaultAreaServed: AreaServed[] = [
  { "@type": "AdministrativeArea", name: "Los Angeles County" },
  { "@type": "AdministrativeArea", name: "Orange County" },
  { "@type": "AdministrativeArea", name: "Inland Empire" },
];

export const buildStructuredData = (page: CateringPageConfig) => {
  const url = `${SITE_URL}${page.path}`;
  const breadcrumbs = [
    { name: "Home", item: `${SITE_URL}/` },
    { name: "Catering", item: `${SITE_URL}/catering` },
    ...(page.kind === "hub" ? [] : [{ name: page.navLabel, item: url }]),
  ];

  return [
    {
      "@context": "https://schema.org",
      "@type": "Caterer",
      "@id": `${SITE_URL}/#caterer`,
      name: "Koinonia Coffee Project",
      url: `${SITE_URL}/catering`,
      image: HERO_IMAGE,
      description: page.description,
      address: {
        "@type": "PostalAddress",
        addressLocality: "Lawndale",
        addressRegion: "CA",
        addressCountry: "US",
      },
      sameAs: ["https://www.instagram.com/koinoniacoffeeproject"],
      areaServed: page.areaServed ?? defaultAreaServed,
      serviceType: page.serviceType ?? "Mobile coffee cart catering",
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: breadcrumbs.map(({ name, item }, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name,
        item,
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqsFor(page).map(({ question, answer }) => ({
        "@type": "Question",
        name: question,
        acceptedAnswer: { "@type": "Answer", text: answer },
      })),
    },
  ];
};
