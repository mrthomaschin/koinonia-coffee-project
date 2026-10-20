/** Browser origins allowed to call the API. */
export const ALLOWED_ORIGINS = [
  "https://koinoniacoffeeproject.com",
  "https://koinonia-coffee-project.web.app",
  "http://localhost:3001",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5001",
];

const PRODUCTION_SITE_URL = "https://koinoniacoffeeproject.com";

/** Inbox that receives new-order alerts and contact form messages. */
export const STORE_NOTIFICATION_EMAIL = "thomas@koinoniacoffeeproject.com";

/**
 * Base URL for links in emails. Uses the requesting site only when it is one
 * of ours, so a forged Origin header cannot send a token to another domain.
 */
export const siteUrlFor = (origin?: string): string =>
  origin && ALLOWED_ORIGINS.includes(origin) ? origin : PRODUCTION_SITE_URL;
