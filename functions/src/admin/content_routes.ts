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
import { AuditLog } from "./audit_log";
import { currentStaff, requirePermission } from "./admin_auth";

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
contentRouter.post("/uploads/image", requirePermission("content.edit"), route(async (req, res) => {
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
