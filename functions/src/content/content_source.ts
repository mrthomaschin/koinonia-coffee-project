import { getDatabase } from "../integrations/firebase_admin";

/**
 * Where each module reads from while Notion is being retired. A module stays
 * on Notion (as before) until its one-time import in the dashboard switches
 * it to Firestore, so deploying the new code changes nothing on its own.
 */
export type ContentModule = "events" | "discounts" | "reviews" | "products";
export type ContentSource = "notion" | "firestore";

const DOC = "admin_sync/content_sources";
const CACHE_MS = 30 * 1000;
let cache: { at: number; sources: Partial<Record<ContentModule, ContentSource>> } | null = null;

export const contentSource = async (module: ContentModule): Promise<ContentSource> => {
  if (!cache || Date.now() - cache.at > CACHE_MS) {
    const data = (await getDatabase().doc(DOC).get()).data() || {};
    cache = { at: Date.now(), sources: data as Partial<Record<ContentModule, ContentSource>> };
  }
  return cache.sources[module] === "firestore" ? "firestore" : "notion";
};

export const setContentSource = async (module: ContentModule, source: ContentSource): Promise<void> => {
  await getDatabase().doc(DOC).set({ [module]: source, [`${module}SwitchedAt`]: new Date().toISOString() }, { merge: true });
  cache = null;
};

export const allContentSources = async (): Promise<Record<ContentModule, ContentSource>> => ({
  events: await contentSource("events"),
  discounts: await contentSource("discounts"),
  reviews: await contentSource("reviews"),
  products: await contentSource("products"),
});
