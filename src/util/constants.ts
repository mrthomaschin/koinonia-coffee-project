export const PAGES = {
  HOME: 'home',
  MENU: 'menu',
  SHOP: 'shop',
  ABOUT: 'about',
  GALLERY: 'gallery',
  EVENTS: 'events',
  CONTACT: 'contact',
  CART: 'cart'
} as const;

export type PageType = typeof PAGES[keyof typeof PAGES];

export const ICONS = {
  logoMark: '/assets/logos/koinoniacp_logomark-black.svg',
  primary: '/assets/logos/koinoniacp_primary-black.svg',
  secondary: '/assets/logos/koinoniacp_secondary-black.svg',
  instagramIcon: '/assets/icons/icons8-instagram-96.png',
  emailIcon: '/assets/icons/icons8-mail-50.svg',
  heroImage: '/assets/images/DSCF3464.jpg',
  shopPlaceholder: '/assets/images/shop_placeholder.png',
  v60: '/assets/icons/v60.png',
  chemex: '/assets/icons/chemex.png',
  espresso: '/assets/icons/espresso.png'
} as const;

export const ASSETS = {
  koinoniaSigTeeOne: '/assets/images/DSCF6417.jpg',
  koinoniaSigTeeTwo: '/assets/images/DSCF6368.jpg',
  koinoniaBlendOne: '/assets/images/cgpt_koin_blend_1.png',
  koinoniaBlendTwo: '/assets/images/espresso_shot.png',
  ethiopiaOne: '/assets/images/cgpt_ethiopia_1.png',
  coffeeBags: '/assets/images/cgpt_bags_3.png',
  circleSticker1: '/assets/images/cgpt_circle_sticker.png',
  logoSticker1: '/assets/images/cgpt_logo_sticker.png',
  letterSticker1: '/assets/images/cgpt_letter_sticker2.png',
  letterSticker2: '/assets/images/cgpt_letter_sticker_2.png',
  stickerGroup1: '/assets/images/cgpt_render_2.png'
} as const;

export const FONTS = {
  primary: 'HedvigLettersSerif_18pt',
  slug: 'ShipporiAntiqueB1',
  secondary: 'Besley-Italic',
  body: 'RethinkSans-Regular'
} as const;

export const COLORS = {
  midnightPrimary: '#2F2B39',
  linenPrimary: '#CBC5B9',
  marinaPrimary: '#313D66',
  pearlPrimary: '#F8F5EB',
  denimSecondary: '#59667E',
  smokeSecondary: '#C2CAD3',
  eucalyptusSecondary: '#84825E',
  sageSecondary: '#C3C8A4',
  white: '#FFFFFF'
} as const;

export const LAYOUT = {
  appBarHeight: 80,
  bottomBarHeight: 140,
  mobileBreakpoint: 768,
  desktopBreakpoint: 1024
} as const;

export const isMobile = (width: number): boolean => width < LAYOUT.mobileBreakpoint;
export const isDesktop = (width: number): boolean => width >= LAYOUT.desktopBreakpoint;
