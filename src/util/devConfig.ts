export const isDevelopment = (): boolean => {
  return (
    process.env.NODE_ENV === 'development' ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'
  );
};

export const DEV_FLAGS = {
  ENABLE_SHOP: true,
  ENABLE_EVENTS: false,
  ENABLE_MENU: false,
  ENABLE_ABOUT: false,
  ENABLE_BLOG: false,
  ENABLE_GALLERY: false,
  ENABLE_CONTACT: true,
} as const;

export const isPageEnabled = (page: string): boolean => {
  if (isDevelopment()) {
    return true;
  }

  const flagMap: Record<string, boolean> = {
    shop: DEV_FLAGS.ENABLE_SHOP,
    events: DEV_FLAGS.ENABLE_EVENTS,
    menu: DEV_FLAGS.ENABLE_MENU,
    about: DEV_FLAGS.ENABLE_ABOUT,
    blog: DEV_FLAGS.ENABLE_BLOG,
    gallery: DEV_FLAGS.ENABLE_GALLERY,
    contact: DEV_FLAGS.ENABLE_CONTACT
  };

  return flagMap[page] ?? true;
};
