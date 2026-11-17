import { randomUUID } from "crypto";
import { getDatabase } from "../integrations/firebase_admin";
import type { StaffMember } from "../admin/staff_repository";
import type { ContentBlock } from "../services/notion_content";

/**
 * Calendar events, edited in the dashboard and published to the website.
 *
 * calendar_events/{id} holds the drafts staff edit. Publishing writes a
 * snapshot to site_content/events, which is all the website and the
 * subscription roast calendar read. Nothing staff change is live until
 * someone presses Publish.
 */
export const ROAST_TYPE = "Roast Schedule";
export const EVENT_TYPES = [ROAST_TYPE, "Pop-up", "Market", "Catering", "Church & Ministry", "Community", "Other"];

export interface CalendarEvent {
  id: string;
  name: string;
  type: string;
  // "YYYY-MM-DD" for all-day, or an ISO time with offset, as Notion stored them.
  start: string;
  end: string | null;
  location: string | null;
  // Shown on the website: public events appear on the calendar; internal ones
  // (e.g. roast days) only feed the roast calendar.
  visibility: "public" | "internal";
  // Plain-text fallback the site shows when there are no content blocks.
  body: string;
  content: ContentBlock[];
  createdAt: string;
  updatedAt: string;
  updatedBy: { email: string; name: string } | null;
  // Notion page it was imported from; also its id, so old website links keep working.
  notionPageId: string | null;
}

export interface WebsiteEvent {
  id: string;
  name: string;
  start: string;
  end: string | null;
  location: string | null;
  body: string;
  content: ContentBlock[];
}

export interface PublishedEvents {
  events: WebsiteEvent[];
  // Every roast-type event's date, public or internal: subscription renewals follow these.
  roastDates: string[];
  // id → updatedAt of each event when published, to show what changed since.
  versions: Record<string, string>;
  publishedAt: string;
  publishedBy: { email: string; name: string } | null;
}

const events = () => getDatabase().collection("calendar_events");
const PUBLISHED = "site_content/events";

/** Roast dates as the renewal scheduler expects them (date-only roasts start 9am Pacific). */
export const normalizeRoastDate = (value: string): string | null => {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T09:00:00-07:00`;
  return Number.isNaN(Date.parse(value)) ? null : value;
};

export const EventStore = {
  async list(): Promise<CalendarEvent[]> {
    const snapshot = await events().get();
    return snapshot.docs.map((doc) => doc.data() as CalendarEvent).sort((a, b) => a.start.localeCompare(b.start));
  },

  async get(id: string): Promise<CalendarEvent | null> {
    const snapshot = await events().doc(id).get();
    return snapshot.exists ? (snapshot.data() as CalendarEvent) : null;
  },

  async save(input: Omit<CalendarEvent, "createdAt" | "updatedAt" | "updatedBy" | "id" | "notionPageId"> & { id?: string },
    staff: StaffMember | null, extra: Partial<CalendarEvent> = {}): Promise<CalendarEvent> {
    const now = new Date().toISOString();
    const id = input.id || randomUUID();
    const existing = input.id ? await EventStore.get(input.id) : null;
    const event: CalendarEvent = {
      notionPageId: existing?.notionPageId ?? null,
      createdAt: existing?.createdAt ?? now,
      ...input,
      ...extra,
      id,
      updatedAt: now,
      updatedBy: staff ? { email: staff.email, name: staff.name } : null,
    };
    await events().doc(id).set(JSON.parse(JSON.stringify(event)));
    return event;
  },

  async remove(id: string): Promise<void> {
    await events().doc(id).delete();
  },

  async published(): Promise<PublishedEvents | null> {
    const snapshot = await getDatabase().doc(PUBLISHED).get();
    return snapshot.exists ? (snapshot.data() as PublishedEvents) : null;
  },

  /** What publishing would change, compared with what the website shows now. */
  async pendingChanges(): Promise<{ added: string[]; changed: string[]; removed: string[] }> {
    const [drafts, published] = await Promise.all([EventStore.list(), EventStore.published()]);
    const versions = published?.versions || {};
    const ids = new Set(drafts.map((event) => event.id));
    return {
      added: drafts.filter((event) => !(event.id in versions)).map((event) => event.id),
      changed: drafts.filter((event) => event.id in versions && versions[event.id] !== event.updatedAt).map((event) => event.id),
      removed: Object.keys(versions).filter((id) => !ids.has(id)),
    };
  },

  /** Copies every draft to the snapshot the website reads. */
  async publish(staff: StaffMember | null): Promise<PublishedEvents> {
    const drafts = await EventStore.list();
    const roastDates = drafts
      .filter((event) => event.type === ROAST_TYPE)
      .map((event) => normalizeRoastDate(event.start))
      .filter((date): date is string => !!date)
      .sort((a, b) => Date.parse(a) - Date.parse(b));
    const snapshot: PublishedEvents = {
      events: drafts
        .filter((event) => event.visibility === "public")
        .map(({ id, name, start, end, location, body, content }) => ({ id, name, start, end, location, body, content })),
      roastDates,
      versions: Object.fromEntries(drafts.map((event) => [event.id, event.updatedAt])),
      publishedAt: new Date().toISOString(),
      publishedBy: staff ? { email: staff.email, name: staff.name } : null,
    };
    await getDatabase().doc(PUBLISHED).set(JSON.parse(JSON.stringify(snapshot)));
    return snapshot;
  },
};
