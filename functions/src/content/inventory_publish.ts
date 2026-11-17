import { getDatabase } from "../integrations/firebase_admin";
import { createLogger } from "../logger";
import { nextUpcomingRoastSessionDate } from "../services/account_service";
import { buildInventoryItems, overlayStock, ProductStore, stockLevels } from "./products_store";

/**
 * Builds inventory_cache/latest from the products published in the dashboard
 * (used once products have moved off Notion). Same document and shape the
 * Notion sync wrote, so the shop, checkout pricing and link previews read it
 * unchanged.
 */
const logger = createLogger("inventory_publish");
const CACHE = "inventory_cache/latest";
// Must match INVENTORY_SCHEMA_VERSION in index.ts.
export const INVENTORY_SCHEMA_VERSION = 4;

export const rebuildInventoryCache = async (): Promise<{ items: any[]; lastSyncedAt: number }> => {
  const [published, levels] = await Promise.all([ProductStore.published(), stockLevels()]);
  if (!published) throw new Error("No products have been published from the dashboard yet");
  let nextRoastDate: string | null = null;
  try {
    nextRoastDate = await nextUpcomingRoastSessionDate();
  } catch (error) {
    logger.error("Couldn't load the roast calendar; inventory has no next roast date", { error: (error as Error).message });
  }
  const cache = { items: buildInventoryItems(published.products, levels, nextRoastDate), lastSyncedAt: Date.now() };
  await getDatabase().doc(CACHE).set({ ...JSON.parse(JSON.stringify(cache)), schemaVersion: INVENTORY_SCHEMA_VERSION });
  return cache;
};

/** The cached items with live stock applied (stock changes don't wait for a rebuild). */
export const inventoryWithLiveStock = async (cache: { items: any[]; lastSyncedAt: number }) => {
  const [published, levels] = await Promise.all([ProductStore.published(), stockLevels()]);
  return { ...cache, items: overlayStock(cache.items, levels, published?.products || []) };
};

const RUNTIME = "admin_sync/runtime";
const JOB_VERSION = 2;

/** Recorded by the 15-minute inventory job on every run. */
export const markInventoryJobCurrent = async (): Promise<void> => {
  await getDatabase().doc(RUNTIME).set({ inventoryJobVersion: JOB_VERSION, inventoryJobRanAt: new Date().toISOString() }, { merge: true });
};

/**
 * Whether the deployed inventory job understands dashboard products. Until it
 * does, an older Notion-only job would overwrite the published products.
 */
export const inventoryJobIsCurrent = async (): Promise<boolean> => {
  const data = (await getDatabase().doc(RUNTIME).get()).data();
  return Number(data?.inventoryJobVersion) >= JOB_VERSION && !!data?.inventoryJobRanAt &&
    Date.now() - Date.parse(data.inventoryJobRanAt) < 2 * 60 * 60 * 1000;
};
