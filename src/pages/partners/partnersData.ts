// Content for /partners.
// Kept free of imports so scripts/prerender-seo.js can load it at build time.
//
// To add a partner, append an entry to `partners`. Rows render in array order.
// Link to a filtered view with /partners?type=<category>, e.g.
// /partners?type=coffee-exporter.

export const SITE_URL = "https://koinoniacoffeeproject.com";
export const PAGE_PATH = "/partners";

export const partnersPage = {
  path: PAGE_PATH,
  /** <title> tag / og:title. */
  seoTitle: "Our Partners | Koinonia Coffee Project",
  description:
    "The non-profits and coffee exporters Koinonia Coffee Project works with, from the farms our coffee comes from to the organizations we give back to.",
};

export const PARTNER_CATEGORIES = {
  nonprofit: { label: "Non-profit", plural: "Non-profits" },
  "coffee-exporter": { label: "Coffee exporter", plural: "Coffee exporters" },
} as const;

export type PartnerCategory = keyof typeof PARTNER_CATEGORIES;

export const isPartnerCategory = (value: unknown): value is PartnerCategory =>
  typeof value === "string" &&
  Object.prototype.hasOwnProperty.call(PARTNER_CATEGORIES, value);

export interface Partner {
  /** URL fragment, so /partners#<slug> links straight to the row. */
  slug: string;
  name: string;
  category: PartnerCategory;
  /** One or two sentences: who they are and why we work with them. */
  blurb: string;
  image: {
    /** Path under /public. A logo or a photo both work. */
    src: string;
    alt: string;
    /** "contain" for logos (padded, never cropped); "cover" for photos. Default "cover". */
    fit?: "contain" | "cover";
  };
  /** Partner's homepage. Leave out until confirmed and the row shows no link. */
  website?: string;
}

export const partners: Partner[] = [
  {
    slug: "cima-cafe",
    name: "Cima Café",
    category: "coffee-exporter",
    // TODO(Thomas): confirm blurb and add website.
    blurb:
      "Cima Café connects roasters with coffee producers in Honduras, buying green coffee directly from the farms that grow it.",
    image: {
      src: "/assets/images/cima_cafe_transparent.png",
      alt: "Cima Café logo",
      fit: "contain",
    },
  },
  {
    slug: "unblended",
    name: "Unblended",
    category: "coffee-exporter",
    // TODO(Thomas): replace blurb and add website.
    blurb:
      "Unblended sources single-origin green coffee and shares the story of where each lot comes from.",
    image: {
      src: "/assets/images/Logo_UNBLND_2-removebg-preview.png",
      alt: "Unblended logo",
      fit: "contain",
    },
  },
];
