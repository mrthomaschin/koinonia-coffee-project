import { FieldValue } from "firebase-admin/firestore";
import { getDatabase } from "../integrations/firebase_admin";
import type { StaffMember } from "../admin/staff_repository";
import type { ContentBlock } from "../services/notion_content";

/**
 * Website products, edited in the dashboard and published to the shop.
 *
 * products/{parentSku}       drafts staff edit
 * site_content/products      what was last published
 * inventory_cache/latest     what the shop and checkout read: the published
 *                            products in the exact shape Notion produced, plus
 *                            the next roast date. Rebuilt on publish and by
 *                            the 15-minute inventory job.
 * stock/{sku}                live stock for SKUs that track it; the shop's
 *                            product list overlays it at read time, so a sale
 *                            or a restock shows without republishing.
 */

export const ITEM_TYPES = ["Coffee", "Apparel", "Drinkware", "Brew Tools", "Accessories", "Stickers"];
// What the shop shows for a SKU that doesn't track stock: always available.
export const UNLIMITED = 999;

export interface ProductImage {
  // The uploaded or original file, and the web-sized copies the shop serves.
  original: string;
  large: string;
  thumb: string;
}

export interface BrewMethod {
  dose: string;
  yield: string;
  waterTemperature: string;
  ratio: string;
  time: string;
  description: string;
  maxPressure?: string;
  milkRatio?: string;
}

export interface ProductVariant {
  sku: string;
  size: string;
  color: string;
  weight: string;
  // Grams; renewals and shipping quotes size parcels from it.
  shippingWeight: number;
  price: number;
  active: boolean;
  isWholesale: boolean;
  ltoEndDate: string | null;
  ltoUnlimitedPurchases: boolean;
  trackStock: boolean;
}

export interface Product {
  sku: string;
  name: string;
  itemType: string;
  active: boolean;
  isWholesale: boolean;
  // Sort order on the shop (lowest first).
  index: number | null;
  price: number;
  shippingWeight: number;
  trackStock: boolean;
  images: ProductImage[];
  roastLevel: string;
  origins: string[];
  tastingNotes: string[];
  process: string[];
  varietals: string[];
  ltoEndDate: string | null;
  ltoUnlimitedPurchases: boolean;
  variants: ProductVariant[];
  content: ContentBlock[];
  // Plain-text/markdown summary the shop falls back to without content blocks.
  summary: string;
  itemDetails: string;
  brewingMethods: Record<"singleDripper" | "batchDripper" | "espresso" | "milkDrink", BrewMethod>;
  createdAt: string;
  updatedAt: string;
  updatedBy: { email: string; name: string } | null;
}

export interface PublishedProducts {
  products: Product[];
  versions: Record<string, string>;
  publishedAt: string;
  publishedBy: { email: string; name: string } | null;
}

export interface StockMovement {
  at: string;
  sku: string;
  change: number;
  quantityAfter: number;
  reason: "order" | "adjustment" | "import" | "count";
  orderId?: string;
  note?: string;
  actor: { email: string; name: string } | null;
}

const db = () => getDatabase();
const products = () => db().collection("products");
const stock = () => db().collection("stock");
const PUBLISHED = "site_content/products";

export const emptyBrewMethod = (): BrewMethod => ({ dose: "", yield: "", waterTemperature: "", ratio: "", time: "", description: "" });

const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export const ProductStore = {
  async list(): Promise<Product[]> {
    const snapshot = await products().get();
    return snapshot.docs.map((doc) => doc.data() as Product)
      .sort((a, b) => (a.index ?? 9999) - (b.index ?? 9999) || b.createdAt.localeCompare(a.createdAt));
  },

  async get(sku: string): Promise<Product | null> {
    const snapshot = await products().doc(sku).get();
    return snapshot.exists ? (snapshot.data() as Product) : null;
  },

  async save(product: Omit<Product, "createdAt" | "updatedAt" | "updatedBy"> & { createdAt?: string }, staff: StaffMember | null): Promise<Product> {
    const existing = await ProductStore.get(product.sku);
    const now = new Date().toISOString();
    const saved: Product = {
      ...product,
      createdAt: existing?.createdAt ?? product.createdAt ?? now,
      updatedAt: now,
      updatedBy: staff ? { email: staff.email, name: staff.name } : null,
    };
    await products().doc(saved.sku).set(plain(saved));
    return saved;
  },

  async remove(sku: string): Promise<void> {
    await products().doc(sku).delete();
  },

  async published(): Promise<PublishedProducts | null> {
    const snapshot = await db().doc(PUBLISHED).get();
    return snapshot.exists ? (snapshot.data() as PublishedProducts) : null;
  },

  async pendingChanges(): Promise<{ added: string[]; changed: string[]; removed: string[] }> {
    const [drafts, published] = await Promise.all([ProductStore.list(), ProductStore.published()]);
    const versions = published?.versions || {};
    const skus = new Set(drafts.map((product) => product.sku));
    return {
      added: drafts.filter((product) => !(product.sku in versions)).map((product) => product.sku),
      changed: drafts.filter((product) => product.sku in versions && versions[product.sku] !== product.updatedAt).map((product) => product.sku),
      removed: Object.keys(versions).filter((sku) => !skus.has(sku)),
    };
  },

  async publish(staff: StaffMember | null): Promise<PublishedProducts> {
    const drafts = await ProductStore.list();
    const snapshot: PublishedProducts = {
      products: drafts,
      versions: Object.fromEntries(drafts.map((product) => [product.sku, product.updatedAt])),
      publishedAt: new Date().toISOString(),
      publishedBy: staff ? { email: staff.email, name: staff.name } : null,
    };
    await db().doc(PUBLISHED).set(plain(snapshot));
    return snapshot;
  },
};

// ---- What the shop reads ----

/** Every SKU's live stock (only SKUs that track it have a document). */
export const stockLevels = async (): Promise<Map<string, number>> => {
  const snapshot = await stock().get();
  return new Map(snapshot.docs.map((doc) => [doc.id, Number(doc.data().quantity) || 0]));
};

const quantityFor = (sku: string, tracks: boolean, levels: Map<string, number>) =>
  tracks ? levels.get(sku) ?? 0 : UNLIMITED;

/**
 * The shop's inventory items, in the shape Notion produced (see
 * NotionService.fetchInventoryFromNotion): active products only, and active
 * or wholesale variants only.
 */
export const buildInventoryItems = (published: Product[], levels: Map<string, number>, nextRoastDate: string | null): any[] =>
  published
    .filter((product) => product.active)
    .map((product) => {
      const images = product.images.length
        ? product.images
        : [{ original: "/assets/images/shop_placeholder.png", large: "/assets/images/shop_placeholder.png", thumb: "/assets/images/shop_placeholder.png" }];
      const variants = product.variants
        .filter((variant) => variant.active || variant.isWholesale)
        .map((variant) => {
          const quantity = quantityFor(variant.sku, variant.trackStock, levels);
          return {
            sku: variant.sku,
            size: variant.size,
            color: variant.color,
            weight: variant.weight,
            shippingWeight: variant.shippingWeight || product.shippingWeight || 200,
            quantity,
            price: variant.price,
            isSoldOut: quantity <= 0,
            active: variant.active || variant.isWholesale,
            ltoEndDate: variant.ltoEndDate,
            ltoUnlimitedPurchases: variant.ltoUnlimitedPurchases,
            isWholesale: variant.isWholesale,
          };
        });
      const unique = (values: string[]) => [...new Set(values.filter(Boolean))];
      return {
        sku: product.sku,
        name: product.name,
        itemSummary: product.summary,
        itemContent: product.content,
        itemDetails: product.itemDetails,
        nextRoastDate,
        price: product.price,
        firebaseImageUrls: images.map((image) => image.large),
        thumbnailUrls: images.map((image) => image.thumb),
        originalImageUrls: images.map((image) => image.original),
        itemType: product.itemType,
        createdAt: product.createdAt,
        quantity: quantityFor(product.sku, product.trackStock, levels),
        isWholesale: product.isWholesale,
        // The option lists the shop shows come from the active variants.
        weights: unique(product.variants.filter((variant) => variant.active).map((variant) => variant.weight)),
        shippingWeight: product.shippingWeight,
        roastLevel: product.roastLevel,
        origin: product.origins.join(", "),
        origins: product.origins,
        tastingNotes: product.tastingNotes,
        process: product.process,
        varietals: product.varietals,
        sizes: unique(product.variants.filter((variant) => variant.active).map((variant) => variant.size)),
        colors: unique(product.variants.filter((variant) => variant.active).map((variant) => variant.color)),
        variants: variants.length ? variants : null,
        ltoEndDate: product.ltoEndDate,
        ltoUnlimitedPurchases: product.ltoUnlimitedPurchases,
        brewingMethods: product.brewingMethods,
      };
    });

/** Applies live stock to cached items (the shop's product list does this on every read). */
export const overlayStock = (items: any[], levels: Map<string, number>, published: Product[]): any[] => {
  const tracked = new Set<string>();
  for (const product of published) {
    if (product.trackStock) tracked.add(product.sku);
    for (const variant of product.variants) if (variant.trackStock) tracked.add(variant.sku);
  }
  return items.map((item) => ({
    ...item,
    quantity: tracked.has(item.sku) ? levels.get(item.sku) ?? 0 : item.quantity,
    variants: item.variants?.map((variant: any) => {
      if (!tracked.has(variant.sku)) return variant;
      const quantity = levels.get(variant.sku) ?? 0;
      return { ...variant, quantity, isSoldOut: quantity <= 0 };
    }) ?? item.variants,
  }));
};

// ---- Stock ----

export const StockStore = {
  async movements(sku: string, limit = 50): Promise<StockMovement[]> {
    const snapshot = await db().collection("stock_movements").where("sku", "==", sku).get();
    return snapshot.docs.map((doc) => doc.data() as StockMovement)
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, limit);
  },

  /** Adds `change` (negative to remove) and records why. Returns the new quantity. */
  async adjust(sku: string, change: number, entry: Omit<StockMovement, "at" | "sku" | "change" | "quantityAfter">): Promise<number> {
    const ref = stock().doc(sku);
    const movement = db().collection("stock_movements").doc();
    return db().runTransaction(async (transaction) => {
      const current = Number((await transaction.get(ref)).data()?.quantity) || 0;
      const quantity = current + change;
      transaction.set(ref, { sku, quantity, updatedAt: new Date().toISOString() });
      transaction.set(movement, plain({ ...entry, at: new Date().toISOString(), sku, change, quantityAfter: quantity }));
      return quantity;
    });
  },

  /** Sets an exact count (a stock take). */
  async set(sku: string, quantity: number, entry: Omit<StockMovement, "at" | "sku" | "change" | "quantityAfter">): Promise<number> {
    const ref = stock().doc(sku);
    const movement = db().collection("stock_movements").doc();
    return db().runTransaction(async (transaction) => {
      const current = Number((await transaction.get(ref)).data()?.quantity) || 0;
      transaction.set(ref, { sku, quantity, updatedAt: new Date().toISOString() });
      transaction.set(movement, plain({ ...entry, at: new Date().toISOString(), sku, change: quantity - current, quantityAfter: quantity }));
      return quantity;
    });
  },
};

/**
 * Takes a new order's items out of stock, once per order. Only SKUs that
 * track stock, and only orders placed after products moved to the dashboard
 * (orders imported from Notion already counted there).
 */
export const takeOrderFromStock = async (orderId: string, items: Array<{ sku?: string; quantity?: number; internalQuantity?: number }>): Promise<void> => {
  const published = await ProductStore.published();
  if (!published) return;
  const tracked = new Set<string>();
  for (const product of published.products) {
    if (product.trackStock) tracked.add(product.sku.toUpperCase());
    for (const variant of product.variants) if (variant.trackStock) tracked.add(variant.sku.toUpperCase());
  }
  const marker = db().collection("stock_orders").doc(orderId);
  // The marker makes a retried trigger a no-op.
  const first = await marker.create({ at: new Date().toISOString() }).then(() => true, () => false);
  if (!first) return;
  for (const item of items) {
    const sku = String(item.sku || "").toUpperCase();
    if (!sku || !tracked.has(sku)) continue;
    const count = Number(item.internalQuantity ?? item.quantity) || 0;
    if (count <= 0) continue;
    await StockStore.adjust(sku, -count, { reason: "order", orderId, actor: null });
  }
  await marker.set({ done: true, doneAt: FieldValue.serverTimestamp() }, { merge: true });
};
