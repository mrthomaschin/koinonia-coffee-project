import { createLogger } from "../logger";
import { getDatabase } from "../integrations/firebase_admin";
import { getNotionClient } from "../integrations/notion/notion_client";
import { pacificCalendarDate } from "../domain/dates/calendar_dates";

const logger = createLogger("monthly-metrics");

/** Pacific-calendar month key, e.g. "2026-10". */
type MonthKey = string;

interface MonthlyMetrics {
  newSubscriptions: number;
  totalAccounts: number;
  verifiedAccounts: number;
  newAccounts: number;
  // Status counts are only known for "now", so they are omitted when backfilling past months.
  status?: { active: number; paused: number; canceled: number };
}

interface AccountRecord {
  createdMonth: MonthKey | null;
  // null = unverified. Legacy accounts without emailVerifiedAt count as verified from creation.
  verifiedMonth: MonthKey | null;
}

interface SubscriptionRecord {
  createdMonth: MonthKey | null;
  status: string;
}

const monthOf = (value: unknown): MonthKey | null => {
  if (value === null || value === undefined) return null;
  // Date-only strings (Notion dates) are already calendar dates; parsing them as UTC would shift a day back.
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value.slice(0, 7);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const date = typeof (value as any)?.toDate === "function" ? (value as any).toDate() : new Date(value as string | number);
  return Number.isNaN(date.getTime()) ? null : pacificCalendarDate(date).slice(0, 7);
};

const monthTitle = (month: MonthKey): string => {
  const [year, monthIndex] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthIndex - 1, 1)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
};

const loadAccounts = async (): Promise<AccountRecord[]> => {
  const snapshot = await getDatabase().collection("accounts").get();
  return snapshot.docs.map((doc) => {
    const data = doc.data();
    const createdMonth = monthOf(data.createdAt);
    const verifiedMonth = data.emailVerifiedAt === null ? null : monthOf(data.emailVerifiedAt) || createdMonth;
    return { createdMonth, verifiedMonth };
  });
};

const loadSubscriptions = async (): Promise<SubscriptionRecord[]> => {
  const snapshot = await getDatabase().collection("account_subscriptions").get();
  return snapshot.docs.map((doc) => ({ createdMonth: monthOf(doc.data().createdAt), status: doc.data().status }));
};

/** Computes a month's metrics; status counts are included only for the current month. */
export const computeMonthlyMetrics = (
  month: MonthKey,
  accounts: AccountRecord[],
  subscriptions: SubscriptionRecord[],
  includeStatus: boolean
): MonthlyMetrics => {
  const byMonthEnd = (created: MonthKey | null) => created !== null && created <= month;
  const metrics: MonthlyMetrics = {
    newSubscriptions: subscriptions.filter((item) => item.createdMonth === month).length,
    totalAccounts: accounts.filter((item) => byMonthEnd(item.createdMonth)).length,
    verifiedAccounts: accounts.filter((item) => byMonthEnd(item.verifiedMonth)).length,
    newAccounts: accounts.filter((item) => item.createdMonth === month).length,
  };
  if (includeStatus) {
    const count = (status: string) => subscriptions.filter((item) => item.status === status).length;
    metrics.status = { active: count("active"), paused: count("paused"), canceled: count("canceled") };
  }
  return metrics;
};

const metricProperties = (month: MonthKey, metrics: MonthlyMetrics, now: Date) => ({
  "Name": { title: [{ text: { content: monthTitle(month) } }] },
  "New Subscriptions": { number: metrics.newSubscriptions },
  "Total Accounts": { number: metrics.totalAccounts },
  "Verified Accounts": { number: metrics.verifiedAccounts },
  "New Accounts": { number: metrics.newAccounts },
  ...(metrics.status ? {
    "Active Subscriptions": { number: metrics.status.active },
    "Paused Subscriptions": { number: metrics.status.paused },
    "Canceled Subscriptions": { number: metrics.status.canceled },
  } : {}),
  "Last Synced": { date: { start: now.toISOString() } },
});

export class MonthlyMetricsService {
  /**
   * Writes metrics to the Notion "Monthly Metrics" database. The current
   * month's row is refreshed on every run, so the last run of a month leaves
   * its final totals. Past rows that were never synced are backfilled from
   * creation timestamps (status counts can't be reconstructed, so stay blank).
   */
  static async syncMonthlyMetrics(now: Date = new Date()): Promise<void> {
    const databaseId = process.env.NOTION_MONTHLY_METRICS_DATABASE_ID;
    if (!databaseId) throw new Error("NOTION_MONTHLY_METRICS_DATABASE_ID is not configured");
    const notion = getNotionClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pages: any[] = [];
    let cursor: string | undefined;
    do {
      const response = await notion.databases.query({ database_id: databaseId, start_cursor: cursor, page_size: 100 });
      pages.push(...response.results);
      cursor = response.has_more ? response.next_cursor || undefined : undefined;
    } while (cursor);

    const [accounts, subscriptions] = await Promise.all([loadAccounts(), loadSubscriptions()]);
    const currentMonth = monthOf(now) as MonthKey;
    const seenMonths = new Set<MonthKey>();

    for (const page of pages) {
      const month = monthOf(page.properties["Date Created"]?.date?.start || page.created_time);
      if (!month || month > currentMonth) continue;
      if (seenMonths.has(month)) {
        logger.warn("Skipping duplicate monthly metrics row", { month, pageId: page.id });
        continue;
      }
      seenMonths.add(month);
      const isCurrent = month === currentMonth;
      if (!isCurrent && typeof page.properties["Total Accounts"]?.number === "number") continue;

      const metrics = computeMonthlyMetrics(month, accounts, subscriptions, isCurrent);
      await notion.pages.update({ page_id: page.id, properties: metricProperties(month, metrics, now) });
      logger.info(isCurrent ? "Updated current month metrics" : "Backfilled month metrics", { month, ...metrics });
    }

    // Normally Notion's recurring template creates the row on the 1st; this covers a missed one.
    if (!seenMonths.has(currentMonth)) {
      const metrics = computeMonthlyMetrics(currentMonth, accounts, subscriptions, true);
      await notion.pages.create({
        parent: { database_id: databaseId },
        icon: { type: "emoji", emoji: "🗓️" },
        properties: {
          ...metricProperties(currentMonth, metrics, now),
          "Date Created": { date: { start: `${currentMonth}-01` } },
        },
      });
      logger.info("Created missing current month metrics row", { month: currentMonth, ...metrics });
    }
  }
}
