// Content and structured data for /initiatives.
// Kept free of imports so scripts/prerender-seo.js can load it at build time.
//
// To add an initiative, append an entry to `initiatives` below. Rows render in
// array order and alternate photo/copy sides automatically.

export const SITE_URL = "https://koinoniacoffeeproject.com";
export const PAGE_PATH = "/initiatives";
export const HERO_IMAGE = `${SITE_URL}/assets/images/DSC_0532.jpeg`;

export const initiativesPage = {
  path: PAGE_PATH,
  /** <title> tag / og:title. */
  seoTitle: "Community Initiatives | Koinonia Coffee Project",
  description:
    "Beyond the coffee cart: the community initiatives Koinonia Coffee Project runs to give back and create spaces for fellowship in Southern California.",
};

export interface Initiative {
  /** URL fragment for the row, so /initiatives#<slug> links straight to it. */
  slug: string;
  /** Short label above the title, e.g. a category or start date. */
  eyebrow: string;
  title: string;
  summary: string;
  image: {
    /** Path under /public, e.g. /assets/images/photo.jpg. */
    src: string;
    /** Describe what is in the photo, for screen readers and image search. */
    alt: string;
  };
  /**
   * The in-depth page or blog post. Internal paths ("/church-partnership")
   * route in-app; full URLs open in a new tab. Leave it out until the
   * write-up exists and the row shows without a link.
   */
  link?: {
    href: string;
    label: string;
  };
}

export const initiatives: Initiative[] = [
  {
    slug: "ten-percent",
    eyebrow: "10%",
    title: "Our commitment to give back",
    summary:
      "10% of our profits go to non-profit organizations aimed for caring for the community.",
    image: {
      src: "/assets/images/IMG_2147.jpg",
      alt: "People sharing coffee and conversation together",
    },
    // link: {
    //   href: "/church-partnership",
    //   label: "LEARN ABOUT THE PROGRAM",
    // },
  },
  {
    slug: "sustainable-sourcing",
    eyebrow: "Sustainable sourcing",
    title: "Sustainable coffee sourcing",
    summary:
      "We are committed to sourcing our coffee in a way that supports sustainable farming practices and protects the environment. Sustainably supports the farmers that have been cultivating coffee for generations, while giving you the highest quality of coffee in your cup.",
    image: {
      src: "/assets/images/daniella-5.png",
      alt: "People sharing coffee and conversation together",
    },
    // link: {
    //   href: "/church-partnership",
    //   label: "LEARN ABOUT THE PROGRAM",
    // },
  },
  {
    slug: "church-partnership",
    eyebrow: "CHURCH & MINISTRIES",
    title: "Church & Ministry Partnership Program",
    summary:
      "Wholesale coffee, barista training, and a custom coffee ministry playbook that help churches across Southern California keep their coffee ministries going and make room for fellowship.",
    image: {
      src: "/assets/images/DSC_0532.jpeg",
      alt: "People sharing coffee and conversation together",
    },
    link: {
      href: "/church-partnership",
      label: "LEARN ABOUT THE PROGRAM",
    },
  },
];

const absoluteUrl = (href: string): string =>
  href.startsWith("/") ? `${SITE_URL}${href}` : href;

export const buildStructuredData = () => {
  const url = `${SITE_URL}${PAGE_PATH}`;
  return [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Community Initiatives",
      url,
      description: initiativesPage.description,
      image: HERO_IMAGE,
      publisher: {
        "@type": "Organization",
        name: "Koinonia Coffee Project",
        url: SITE_URL,
      },
      mainEntity: {
        "@type": "ItemList",
        numberOfItems: initiatives.length,
        itemListElement: initiatives.map((initiative, index) => ({
          "@type": "ListItem",
          position: index + 1,
          item: {
            "@type": "CreativeWork",
            name: initiative.title,
            description: initiative.summary,
            image: absoluteUrl(initiative.image.src),
            url: initiative.link
              ? absoluteUrl(initiative.link.href)
              : `${url}#${initiative.slug}`,
          },
        })),
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: `${SITE_URL}/`,
        },
        { "@type": "ListItem", position: 2, name: "Initiatives", item: url },
      ],
    },
  ];
};
