import { randomUUID } from "crypto";
import { NextFunction, Request, Response, Router } from "express";
import { allEventsCalendar, notionEventsDetails } from "../services/account_service";
import { imageVariantsFromBuffer } from "../services/image_variants";
import { allContentSources, contentSource, setContentSource } from "../content/content_source";
import { CalendarEvent, EVENT_TYPES, EventStore } from "../content/events_store";
import type { ContentBlock } from "../services/notion_content";
import { DiscountStore, evaluateDiscount, normalizeCode } from "../content/discount_store";
import { listNotionDiscountCodes } from "../repositories/notion_discount_repository";
import { getDatabase } from "../integrations/firebase_admin";
import {
  deleteReview,
  getReview,
  listNotionReviews,
  listReviews,
  putReview,
  updateReview,
} from "../repositories/notion_review_repository";
import { ReviewService } from "../services/review_service";
import type { ReviewModel } from "../domain/reviews/review_model";
import {
  ITEM_TYPES,
  Product,
  ProductStore,
  ProductVariant,
  stockLevels,
  StockStore,
} from "../content/products_store";
import { inventoryJobIsCurrent, rebuildInventoryCache } from "../content/inventory_publish";
import { NotionService } from "../services/notion_services";
import { AuditLog } from "./audit_log";
import { currentStaff, requireAnyPermission, requirePermission } from "./admin_auth";

/** Calendar events (draft → publish), uploads, and the content-source switches. */
type Handler = (req: Request, res: Response) => Promise<void>;
const route = (handler: Handler) => (req: Request, res: Response, next: NextFunction) =>
  handler(req, res).catch(next);
const fail = (res: Response, status: number, error: string) => {
  res.status(status).json({ error });
};

const BLOCK_TYPES = new Set(["heading", "paragraph", "list", "quote", "callout", "toggle", "code", "image", "columns", "divider"]);

const parseEvent = (body: any): Omit<CalendarEvent, "createdAt" | "updatedAt" | "updatedBy" | "id" | "notionPageId"> => {
  const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");
  const name = text(body?.name, 160);
  if (!name) throw new Error("Give the event a name.");
  const start = text(body?.start, 40);
  if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?([+-]\d{2}:\d{2}|Z))?$/.test(start) || Number.isNaN(Date.parse(start))) {
    throw new Error("Choose when the event starts.");
  }
  const end = text(body?.end, 40) || null;
  if (end && (Number.isNaN(Date.parse(end)) || Date.parse(end) < Date.parse(start))) throw new Error("The end must be after the start.");
  const content = Array.isArray(body?.content) ? body.content.filter((block: any) => BLOCK_TYPES.has(block?.type)).slice(0, 200) : [];
  if (JSON.stringify(content).length > 200_000) throw new Error("The description is too long.");
  return {
    name,
    type: EVENT_TYPES.includes(body?.type) ? body.type : "Other",
    start,
    end,
    location: text(body?.location, 300) || null,
    visibility: body?.visibility === "internal" ? "internal" : "public",
    body: text(body?.body, 20_000),
    content: content as ContentBlock[],
  };
};

export const contentRouter = Router();

contentRouter.get("/sources", requirePermission("content.read"), route(async (_req, res) => {
  res.json({ sources: await allContentSources() });
}));

// ---- Events ----

contentRouter.get("/events", requirePermission("content.read"), route(async (_req, res) => {
  const [events, published, pending, source] = await Promise.all([
    EventStore.list(),
    EventStore.published(),
    EventStore.pendingChanges(),
    contentSource("events"),
  ]);
  res.json({
    events,
    types: EVENT_TYPES,
    source,
    published: published && { publishedAt: published.publishedAt, publishedBy: published.publishedBy, roastDates: published.roastDates.length },
    pending,
  });
}));

contentRouter.get("/events/:id", requirePermission("content.read"), route(async (req, res) => {
  const event = await EventStore.get(req.params.id);
  if (!event) return fail(res, 404, "No such event.");
  res.json({ event, types: EVENT_TYPES });
}));

contentRouter.post("/events", requirePermission("content.edit"), route(async (req, res) => {
  let input;
  try {
    input = parseEvent(req.body);
  } catch (error) {
    return fail(res, 400, (error as Error).message);
  }
  const staff = currentStaff(res);
  const event = await EventStore.save(input, staff);
  await AuditLog.record(staff, { action: "event.create", target: { type: "event", id: event.id }, after: { name: event.name, start: event.start } });
  res.status(201).json({ event });
}));

contentRouter.put("/events/:id", requirePermission("content.edit"), route(async (req, res) => {
  const before = await EventStore.get(req.params.id);
  if (!before) return fail(res, 404, "No such event.");
  let input;
  try {
    input = parseEvent(req.body);
  } catch (error) {
    return fail(res, 400, (error as Error).message);
  }
  const staff = currentStaff(res);
  const event = await EventStore.save({ ...input, id: before.id }, staff);
  await AuditLog.record(staff, {
    action: "event.update",
    target: { type: "event", id: event.id },
    before: { name: before.name, start: before.start, end: before.end, type: before.type, visibility: before.visibility, location: before.location },
    after: { name: event.name, start: event.start, end: event.end, type: event.type, visibility: event.visibility, location: event.location },
  });
  res.json({ event });
}));

contentRouter.delete("/events/:id", requirePermission("content.edit"), route(async (req, res) => {
  const before = await EventStore.get(req.params.id);
  if (!before) return fail(res, 404, "No such event.");
  await EventStore.remove(before.id);
  await AuditLog.record(currentStaff(res), { action: "event.delete", target: { type: "event", id: before.id }, before });
  res.json({ ok: true });
}));

contentRouter.post("/events/publish", requirePermission("content.edit"), route(async (_req, res) => {
  const staff = currentStaff(res);
  const pending = await EventStore.pendingChanges();
  const snapshot = await EventStore.publish(staff);
  // Publishing is what moves the website (and roast calendar) off Notion.
  if ((await contentSource("events")) !== "firestore") await setContentSource("events", "firestore");
  await AuditLog.record(staff, {
    action: "events.publish",
    target: { type: "events", id: "website" },
    after: { ...pending, publicEvents: snapshot.events.length, roastDates: snapshot.roastDates.length },
  });
  res.json({ publishedAt: snapshot.publishedAt, events: snapshot.events.length, roastDates: snapshot.roastDates.length });
}));

// One-time: copies Notion's "Website Calendar" events (with their content and
// images) into the dashboard as drafts. Nothing changes on the website until Publish.
contentRouter.post("/events/import-from-notion", requirePermission("settings.edit"), route(async (_req, res) => {
  const [pages, details] = await Promise.all([allEventsCalendar(), notionEventsDetails()]);
  const typeById = new Map(pages.map((page: any) => [page.id, page.properties?.["Event Type"]?.select?.name || "Other"]));
  let imported = 0;
  let skipped = 0;
  for (const detail of details) {
    if (await EventStore.get(detail.id)) {
      skipped += 1;
      continue;
    }
    const type = String(typeById.get(detail.id) || "Other");
    await EventStore.save({
      id: detail.id,
      name: detail.name,
      type: EVENT_TYPES.includes(type) ? type : "Other",
      start: detail.start,
      end: detail.end,
      location: detail.location,
      // Everything in Notion's Website Calendar is on the site today.
      visibility: "public",
      body: detail.body,
      content: detail.content,
    }, null, { notionPageId: detail.id });
    imported += 1;
  }
  await AuditLog.record(currentStaff(res), { action: "events.import_from_notion", target: { type: "events", id: "notion" }, after: { imported, skipped } });
  res.json({ imported, skipped });
}));

// ---- Uploads ----

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

// Images for page content: { dataUrl } → web-sized copies in Cloud Storage.
contentRouter.post("/uploads/image", requireAnyPermission("content.edit", "products.edit"), route(async (req, res) => {
  const match = String(req.body?.dataUrl || "").match(/^data:(image\/(?:png|jpe?g|webp|gif|heic|heif));base64,(.+)$/);
  if (!match) return fail(res, 400, "Upload a PNG, JPEG, WebP or GIF image.");
  const image = Buffer.from(match[2], "base64");
  if (image.length > MAX_UPLOAD_BYTES) return fail(res, 400, "Images must be 8 MB or smaller.");
  const variants = await imageVariantsFromBuffer(`admin-upload:${randomUUID()}`, image);
  res.status(201).json(variants);
}));

// ---- Discount codes ----

const parseDiscount = (body: any, code?: string) => {
  const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");
  const normalized = normalizeCode(code ?? text(body?.code, 40));
  if (!/^[A-Z0-9][A-Z0-9_-]{1,39}$/.test(normalized)) throw new Error("Codes are 2–40 letters, numbers, dashes or underscores.");
  const percentOff = Number(body?.percentOff);
  if (!(percentOff > 0 && percentOff <= 100)) throw new Error("Enter a percentage between 1 and 100.");
  const date = (value: unknown) => {
    const day = text(value, 40);
    if (!day) return null;
    if (Number.isNaN(Date.parse(day))) throw new Error("Check the start and expiration dates.");
    return day;
  };
  const startDate = date(body?.startDate);
  const expirationDate = date(body?.expirationDate);
  if (startDate && expirationDate && expirationDate < startDate) throw new Error("The expiration date is before the start date.");
  return {
    code: normalized,
    percentOff: Math.round(percentOff * 100) / 100,
    active: body?.active !== false,
    startDate,
    expirationDate,
    firstOrderOnly: body?.firstOrderOnly === true,
    noOtherDiscounts: body?.noOtherDiscounts === true,
    subscriptionsOnly: body?.subscriptionsOnly === true,
    automatic: body?.automatic === true,
    note: text(body?.note, 500),
  };
};

/** Per-code usage from the orders (welcome codes are summarized together). */
const discountUsage = async () => {
  const snapshot = await getDatabase().collection("orders")
    .select("discountCode", "discountAmount", "totalAmount", "createdAt", "paymentStatus").get();
  const usage = new Map<string, { orders: number; revenue: number; discountGiven: number; lastUsedAt: string | null }>();
  for (const doc of snapshot.docs) {
    const data = doc.data();
    const code = String(data.discountCode || "").trim().toUpperCase();
    if (!code || data.paymentStatus === "pending") continue;
    const key = code.startsWith("WELCOME-") ? "WELCOME-*" : code;
    const entry = usage.get(key) || { orders: 0, revenue: 0, discountGiven: 0, lastUsedAt: null };
    entry.orders += 1;
    entry.revenue += Number(data.totalAmount) || 0;
    entry.discountGiven += Number(data.discountAmount) || 0;
    if (data.createdAt && (!entry.lastUsedAt || data.createdAt > entry.lastUsedAt)) entry.lastUsedAt = data.createdAt;
    usage.set(key, entry);
  }
  return usage;
};

contentRouter.get("/discounts", requirePermission("discounts.read"), route(async (_req, res) => {
  const [list, usage, source, welcome] = await Promise.all([
    DiscountStore.list(),
    discountUsage(),
    contentSource("discounts"),
    getDatabase().collection("welcome_discount_codes").count().get(),
  ]);
  const round = (value: number) => Math.round(value * 100) / 100;
  const usageFor = (code: string) => {
    const entry = usage.get(code);
    return entry ? { ...entry, revenue: round(entry.revenue), discountGiven: round(entry.discountGiven) } : { orders: 0, revenue: 0, discountGiven: 0, lastUsedAt: null };
  };
  res.json({
    source,
    codes: list.map((code) => ({ ...code, status: evaluateDiscount(code).valid ? "live" : code.active ? "scheduled_or_expired" : "off", usage: usageFor(code.code) })),
    welcome: { issued: welcome.data().count, usage: usageFor("WELCOME-*") },
  });
}));

contentRouter.post("/discounts", requirePermission("discounts.edit"), route(async (req, res) => {
  let input;
  try {
    input = parseDiscount(req.body);
  } catch (error) {
    return fail(res, 400, (error as Error).message);
  }
  if (input.code.startsWith("WELCOME-")) return fail(res, 400, "WELCOME- codes are issued automatically to newsletter subscribers.");
  if (await DiscountStore.get(input.code)) return fail(res, 409, "That code already exists.");
  const staff = currentStaff(res);
  const saved = await DiscountStore.save(input, staff);
  await AuditLog.record(staff, { action: "discount.create", target: { type: "discount", id: saved.code }, after: saved });
  res.status(201).json({ code: saved });
}));

contentRouter.put("/discounts/:code", requirePermission("discounts.edit"), route(async (req, res) => {
  const before = await DiscountStore.get(req.params.code);
  if (!before) return fail(res, 404, "No such code.");
  let input;
  try {
    input = parseDiscount(req.body, before.code);
  } catch (error) {
    return fail(res, 400, (error as Error).message);
  }
  const staff = currentStaff(res);
  const saved = await DiscountStore.save(input, staff);
  await AuditLog.record(staff, { action: "discount.update", target: { type: "discount", id: saved.code }, before, after: saved });
  res.json({ code: saved });
}));

contentRouter.delete("/discounts/:code", requirePermission("discounts.edit"), route(async (req, res) => {
  const before = await DiscountStore.get(req.params.code);
  if (!before) return fail(res, 404, "No such code.");
  await DiscountStore.remove(before.code);
  await AuditLog.record(currentStaff(res), { action: "discount.delete", target: { type: "discount", id: before.code }, before });
  res.json({ ok: true });
}));

// One-time: copies every Notion discount code here and switches checkout to these.
contentRouter.post("/discounts/import-from-notion", requirePermission("settings.edit"), route(async (_req, res) => {
  const rows = await listNotionDiscountCodes();
  let imported = 0;
  let skipped = 0;
  for (const row of rows) {
    if (await DiscountStore.get(row.code)) {
      skipped += 1;
      continue;
    }
    await DiscountStore.save(row, null);
    imported += 1;
  }
  await setContentSource("discounts", "firestore");
  await AuditLog.record(currentStaff(res), { action: "discounts.import_from_notion", target: { type: "discounts", id: "notion" }, after: { imported, skipped } });
  res.json({ imported, skipped });
}));

// ---- Reviews ----

const reviewStatus = (review: ReviewModel): "published" | "pending" | "hidden" | "rating_only" =>
  review.hidden ? "hidden"
    : review.approved ? "published"
      : !review.text && review.photos.length === 0 ? "rating_only"
        : "pending";

contentRouter.get("/reviews", requirePermission("reviews.read"), route(async (_req, res) => {
  const source = await contentSource("reviews");
  if (source !== "firestore") {
    res.json({ source, reviews: [] });
    return;
  }
  const reviews = (await listReviews())
    .map((review) => ({ ...review, status: reviewStatus(review) }))
    .sort((a, b) => b.reviewDate.localeCompare(a.reviewDate));
  res.json({ source, reviews });
}));

// Moderation publishes right away: the website's review cache is rebuilt after each change.
contentRouter.patch("/reviews/:id", requirePermission("reviews.moderate"), route(async (req, res) => {
  if ((await contentSource("reviews")) !== "firestore") return fail(res, 409, "Import reviews from Notion first.");
  const before = await getReview(req.params.id);
  if (!before) return fail(res, 404, "No such review.");
  const changes: Partial<ReviewModel> = {};
  if (typeof req.body?.approved === "boolean") changes.approved = req.body.approved;
  if (typeof req.body?.hidden === "boolean") changes.hidden = req.body.hidden;
  if (typeof req.body?.response === "string") changes.response = req.body.response.trim().slice(0, 2000);
  // Approving un-hides; hiding un-approves, so the two never disagree.
  if (changes.approved === true) changes.hidden = false;
  if (changes.hidden === true) changes.approved = false;
  await updateReview(before.id, changes);
  await ReviewService.syncReviewsCache();
  const after = await getReview(before.id);
  await AuditLog.record(currentStaff(res), {
    action: "review.moderate",
    target: { type: "review", id: before.id },
    before: { approved: before.approved, hidden: before.hidden ?? false, response: before.response },
    after: { approved: after?.approved, hidden: after?.hidden ?? false, response: after?.response },
  });
  res.json({ review: after && { ...after, status: reviewStatus(after) } });
}));

contentRouter.delete("/reviews/:id", requirePermission("reviews.moderate"), route(async (req, res) => {
  if ((await contentSource("reviews")) !== "firestore") return fail(res, 409, "Import reviews from Notion first.");
  const before = await getReview(req.params.id);
  if (!before) return fail(res, 404, "No such review.");
  await deleteReview(before.id);
  await ReviewService.syncReviewsCache();
  await AuditLog.record(currentStaff(res), { action: "review.delete", target: { type: "review", id: before.id }, before });
  res.json({ ok: true });
}));

// One-time: copies every Notion review (photos moved to Cloud Storage first,
// since Notion's photo links expire) and switches reviews to the dashboard.
contentRouter.post("/reviews/import-from-notion", requirePermission("settings.edit"), route(async (_req, res) => {
  if ((await contentSource("reviews")) === "notion") await ReviewService.syncReviewsCache();
  const notionReviews = await listNotionReviews();
  let imported = 0;
  let skipped = 0;
  for (const review of notionReviews) {
    if (await getReview(review.id)) {
      skipped += 1;
      continue;
    }
    await putReview({ ...review, photos: review.photos.filter((photo) => !photo.hostedByNotion) });
    imported += 1;
  }
  await setContentSource("reviews", "firestore");
  await ReviewService.syncReviewsCache();
  await AuditLog.record(currentStaff(res), { action: "reviews.import_from_notion", target: { type: "reviews", id: "notion" }, after: { imported, skipped } });
  res.json({ imported, skipped });
}));

// ---- Products ----

const BREW_KEYS = ["singleDripper", "batchDripper", "espresso", "milkDrink"] as const;

const parseProduct = (body: any, sku?: string): Omit<Product, "createdAt" | "updatedAt" | "updatedBy"> => {
  const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");
  const list = (value: unknown) => (Array.isArray(value) ? value.map((entry) => text(entry, 80)).filter(Boolean).slice(0, 30) : []);
  const money = (value: unknown, label: string) => {
    const amount = Number(value);
    if (!(amount >= 0 && amount < 100000)) throw new Error(`Check the price for ${label}.`);
    return Math.round(amount * 100) / 100;
  };
  const grams = (value: unknown) => Math.max(0, Math.round(Number(value) || 0));
  const day = (value: unknown) => {
    const date = text(value, 40);
    if (date && Number.isNaN(Date.parse(date))) throw new Error("Check the limited-time end date.");
    return date || null;
  };
  const productSku = (sku ?? text(body?.sku, 60)).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{1,59}$/.test(productSku)) throw new Error("SKUs are letters, numbers and dashes, like B-KOIN.");
  const name = text(body?.name, 160);
  if (!name) throw new Error("Give the product a name.");
  const seen = new Set<string>([productSku]);
  const variants: ProductVariant[] = (Array.isArray(body?.variants) ? body.variants : []).slice(0, 60).map((variant: any) => {
    const variantSku = text(variant?.sku, 60).toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9_-]{1,59}$/.test(variantSku)) throw new Error("Every variant needs a SKU.");
    if (seen.has(variantSku)) throw new Error(`The SKU ${variantSku} is used twice.`);
    seen.add(variantSku);
    return {
      sku: variantSku,
      size: text(variant?.size, 40),
      color: text(variant?.color, 40),
      weight: text(variant?.weight, 40),
      shippingWeight: grams(variant?.shippingWeight),
      price: money(variant?.price, variantSku),
      active: variant?.active !== false,
      isWholesale: variant?.isWholesale === true || variantSku.endsWith("-WS"),
      ltoEndDate: day(variant?.ltoEndDate),
      ltoUnlimitedPurchases: variant?.ltoUnlimitedPurchases === true,
      trackStock: variant?.trackStock === true,
    };
  });
  const images = (Array.isArray(body?.images) ? body.images : []).slice(0, 20)
    .filter((image: any) => typeof image?.large === "string" && /^(https?:\/\/|\/)/.test(image.large))
    .map((image: any) => ({ original: text(image.original || image.large, 2000), large: text(image.large, 2000), thumb: text(image.thumb || image.large, 2000) }));
  const content = Array.isArray(body?.content) ? body.content.filter((block: any) => BLOCK_TYPES.has(block?.type)).slice(0, 200) : [];
  const brewingMethods = Object.fromEntries(BREW_KEYS.map((key) => {
    const method = body?.brewingMethods?.[key] || {};
    return [key, {
      dose: text(method.dose, 60), yield: text(method.yield, 60), waterTemperature: text(method.waterTemperature, 60),
      ratio: text(method.ratio, 60), time: text(method.time, 60), description: text(method.description, 2000),
      ...(key === "espresso" || key === "milkDrink" ? { maxPressure: text(method.maxPressure, 60) } : {}),
      ...(key === "milkDrink" ? { milkRatio: text(method.milkRatio, 60) } : {}),
    }];
  })) as Product["brewingMethods"];
  return {
    sku: productSku,
    name,
    itemType: ITEM_TYPES.includes(body?.itemType) ? body.itemType : "Accessories",
    active: body?.active !== false,
    isWholesale: body?.isWholesale === true,
    index: Number.isFinite(Number(body?.index)) && body?.index !== null && body?.index !== "" ? Number(body.index) : null,
    price: money(body?.price ?? 0, name),
    shippingWeight: grams(body?.shippingWeight),
    trackStock: body?.trackStock === true,
    images,
    roastLevel: text(body?.roastLevel, 40),
    origins: list(body?.origins),
    tastingNotes: list(body?.tastingNotes),
    process: list(body?.process),
    varietals: list(body?.varietals),
    ltoEndDate: day(body?.ltoEndDate),
    ltoUnlimitedPurchases: body?.ltoUnlimitedPurchases === true,
    variants,
    content,
    summary: text(body?.summary, 20_000),
    itemDetails: text(body?.itemDetails, 5000),
    brewingMethods,
  };
};

const skusOf = (product: Product) => [product.sku, ...product.variants.map((variant) => variant.sku)];

contentRouter.get("/products", requirePermission("products.read"), route(async (_req, res) => {
  const [list, published, pending, source, levels] = await Promise.all([
    ProductStore.list(), ProductStore.published(), ProductStore.pendingChanges(), contentSource("products"), stockLevels(),
  ]);
  res.json({
    source,
    itemTypes: ITEM_TYPES,
    published: published && { publishedAt: published.publishedAt, publishedBy: published.publishedBy },
    pending,
    products: list.map((product) => {
      const tracked = [
        ...(product.trackStock ? [product.sku] : []),
        ...product.variants.filter((variant) => variant.trackStock && variant.active).map((variant) => variant.sku),
      ];
      const prices = product.variants.length ? product.variants.filter((variant) => variant.active).map((variant) => variant.price) : [product.price];
      return {
        sku: product.sku,
        name: product.name,
        itemType: product.itemType,
        active: product.active,
        isWholesale: product.isWholesale,
        image: product.images[0]?.thumb || null,
        priceMin: prices.length ? Math.min(...prices) : product.price,
        priceMax: prices.length ? Math.max(...prices) : product.price,
        variantCount: product.variants.length,
        stock: tracked.length ? tracked.map((sku) => ({ sku, quantity: levels.get(sku) ?? 0 })) : null,
        ltoEndDate: product.ltoEndDate,
        updatedAt: product.updatedAt,
      };
    }),
  });
}));

contentRouter.get("/products/:sku", requirePermission("products.read"), route(async (req, res) => {
  const product = await ProductStore.get(req.params.sku);
  if (!product) return fail(res, 404, "No such product.");
  const levels = await stockLevels();
  const movements = (await Promise.all(skusOf(product).map((sku) => StockStore.movements(sku, 20)))).flat()
    .sort((a, b) => b.at.localeCompare(a.at)).slice(0, 30);
  res.json({
    product,
    itemTypes: ITEM_TYPES,
    stock: Object.fromEntries(skusOf(product).map((sku) => [sku, levels.has(sku) ? levels.get(sku) : null])),
    movements,
  });
}));

contentRouter.post("/products", requirePermission("products.edit"), route(async (req, res) => {
  let input;
  try {
    input = parseProduct(req.body);
  } catch (error) {
    return fail(res, 400, (error as Error).message);
  }
  if (await ProductStore.get(input.sku)) return fail(res, 409, "A product with that SKU already exists.");
  const staff = currentStaff(res);
  const product = await ProductStore.save(input, staff);
  await AuditLog.record(staff, { action: "product.create", target: { type: "product", id: product.sku }, after: { name: product.name, price: product.price } });
  res.status(201).json({ product });
}));

contentRouter.put("/products/:sku", requirePermission("products.edit"), route(async (req, res) => {
  const before = await ProductStore.get(req.params.sku);
  if (!before) return fail(res, 404, "No such product.");
  let input;
  try {
    input = parseProduct(req.body, before.sku);
  } catch (error) {
    return fail(res, 400, (error as Error).message);
  }
  const staff = currentStaff(res);
  const product = await ProductStore.save({ ...input, createdAt: before.createdAt }, staff);
  const summary = (p: Product) => ({
    name: p.name, active: p.active, price: p.price, trackStock: p.trackStock,
    variants: p.variants.map((v) => ({ sku: v.sku, price: v.price, active: v.active, trackStock: v.trackStock })),
  });
  await AuditLog.record(staff, { action: "product.update", target: { type: "product", id: product.sku }, before: summary(before), after: summary(product) });
  res.json({ product });
}));

contentRouter.delete("/products/:sku", requirePermission("products.edit"), route(async (req, res) => {
  const before = await ProductStore.get(req.params.sku);
  if (!before) return fail(res, 404, "No such product.");
  await ProductStore.remove(before.sku);
  await AuditLog.record(currentStaff(res), { action: "product.delete", target: { type: "product", id: before.sku }, before });
  res.json({ ok: true });
}));

contentRouter.post("/products/publish", requirePermission("products.edit"), route(async (_req, res) => {
  if (!(await inventoryJobIsCurrent())) {
    return fail(res, 409, "The website's functions need updating before products can be published " +
      "(run ./deploy.sh functions in the website repo, then wait up to 15 minutes). Otherwise Notion would overwrite them.");
  }
  const staff = currentStaff(res);
  const pending = await ProductStore.pendingChanges();
  const snapshot = await ProductStore.publish(staff);
  // The first publish moves the shop off Notion.
  if ((await contentSource("products")) !== "firestore") await setContentSource("products", "firestore");
  const cache = await rebuildInventoryCache();
  await AuditLog.record(staff, {
    action: "products.publish",
    target: { type: "products", id: "shop" },
    after: { ...pending, products: snapshot.products.length, onShop: cache.items.length },
  });
  res.json({ publishedAt: snapshot.publishedAt, onShop: cache.items.length });
}));

// One-time: every Notion product (active or not) as a draft, with images,
// content, brewing guides and current stock. The shop doesn't change until Publish.
contentRouter.post("/products/import-from-notion", requirePermission("settings.edit"), route(async (_req, res) => {
  const { items } = await NotionService.fetchInventoryFromNotion(false, { includeInactive: true });
  const staff = currentStaff(res);
  let imported = 0;
  let skipped = 0;
  for (const item of items) {
    if (!item.sku || (await ProductStore.get(item.sku))) {
      skipped += 1;
      continue;
    }
    const originals: string[] = item.originalImageUrls || [];
    const images = originals
      .map((original: string, index: number) => ({ original, large: item.firebaseImageUrls?.[index] || original, thumb: item.thumbnailUrls?.[index] || original }))
      .filter((image: { original: string }) => !image.original.includes("shop_placeholder"));
    const variants: ProductVariant[] = (item.variants || []).map((variant: any) => ({
      sku: String(variant.sku || "").toUpperCase(),
      size: variant.size || "",
      color: variant.color || "",
      weight: variant.weight || "",
      shippingWeight: Number(variant.shippingWeight) || 0,
      price: Number(variant.price) || 0,
      active: variant.rawActive !== false,
      isWholesale: !!variant.isWholesale,
      ltoEndDate: variant.ltoEndDate || null,
      ltoUnlimitedPurchases: !!variant.ltoUnlimitedPurchases,
      // Stock comes over as Notion had it; switch to unlimited per variant later.
      trackStock: true,
    })).filter((variant: ProductVariant) => variant.sku);
    const product = await ProductStore.save({
      sku: String(item.sku).toUpperCase(),
      name: item.name || item.sku,
      itemType: ITEM_TYPES.includes(item.itemType) ? item.itemType : "Accessories",
      active: item.active !== false,
      isWholesale: !!item.isWholesale,
      index: item.index ?? null,
      price: Number(item.price) || 0,
      shippingWeight: Number(item.shippingWeight) || 0,
      trackStock: variants.length === 0,
      images,
      roastLevel: item.roastLevel || "",
      origins: item.origins || [],
      tastingNotes: item.tastingNotes || [],
      process: item.process || [],
      varietals: item.varietals || [],
      ltoEndDate: item.ltoEndDate || null,
      ltoUnlimitedPurchases: !!item.ltoUnlimitedPurchases,
      variants,
      content: item.itemContent || [],
      summary: item.itemSummary || "",
      itemDetails: item.itemDetails || "",
      brewingMethods: item.brewingMethods,
      createdAt: item.createdAt,
    }, null);
    // Current stock, for everything that tracks it.
    const counts: Array<[string, number]> = variants.length
      ? (item.variants || []).map((variant: any) => [String(variant.sku).toUpperCase(), Number(variant.quantity) || 0])
      : [[product.sku, Number(item.quantity) || 0]];
    for (const [sku, quantity] of counts) {
      await StockStore.set(sku, quantity, { reason: "import", note: "Qty Available in Notion", actor: { email: staff.email, name: staff.name } });
    }
    imported += 1;
  }
  await AuditLog.record(staff, { action: "products.import_from_notion", target: { type: "products", id: "notion" }, after: { imported, skipped } });
  res.json({ imported, skipped });
}));

// Stock: { mode: "adjust", value: +5 } receives or removes; { mode: "set", value: 12 } records a count.
contentRouter.post("/stock/:sku", requirePermission("inventory.edit"), route(async (req, res) => {
  const sku = String(req.params.sku).toUpperCase();
  const value = Math.round(Number(req.body?.value));
  if (!Number.isFinite(value)) return fail(res, 400, "Enter a number.");
  const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 300) : "";
  const staff = currentStaff(res);
  const actor = { email: staff.email, name: staff.name };
  const quantity = req.body?.mode === "set"
    ? await StockStore.set(sku, value, { reason: "count", actor, ...(note ? { note } : {}) })
    : await StockStore.adjust(sku, value, { reason: "adjustment", actor, ...(note ? { note } : {}) });
  await AuditLog.record(staff, { action: "stock.change", target: { type: "stock", id: sku }, after: { mode: req.body?.mode, value, quantity, note } });
  res.json({ sku, quantity });
}));
