import { getNotionClient } from "../integrations/notion/notion_client";
import { pacificCalendarDate } from "../domain/dates/calendar_dates";
import { contentSource } from "../content/content_source";
import { DiscountStore, StoredDiscount } from "../content/discount_store";

export interface DiscountCode {
  code: string;
  percentOff: number;
  // "First Order Only" checkbox: only for people with no earlier orders.
  firstOrderOnly: boolean;
  // "No Other Discounts" checkbox: not with subscriptions or partner pricing.
  noOtherDiscounts: boolean;
  // "Subscriptions Only" checkbox: needs a subscription in the cart, and only
  // takes the percentage off the subscription lines.
  subscriptionsOnly: boolean;
  // Set on a subscriber's own welcome code: it only works for this email.
  ownerEmail?: string;
}

export type DiscountCodeLookup =
  | { valid: true; discount: DiscountCode }
  | { valid: false; message: string };

const discountCodesDatabaseId = (): string => {
  const databaseId = process.env.NOTION_DISCOUNT_CODES_DATABASE_ID;
  if (!databaseId)
    throw new Error("NOTION_DISCOUNT_CODES_DATABASE_ID not configured");
  return databaseId;
};

/** Checks a discount codes row is active, started, unexpired, and has a percentage. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const discountFromPage = (page: any, code: string): DiscountCodeLookup => {
  if (!page || !("properties" in page))
    return { valid: false, message: "Invalid discount code" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const properties = page.properties as any;
  if (!properties["Active"]?.checkbox)
    return { valid: false, message: "This discount code is no longer active" };

  // Optional. A date without a time starts at the beginning of that day in
  // Pacific time.
  const startDate: string | undefined = properties["Start Date"]?.date?.start;
  const notStarted = !startDate
    ? false
    : startDate.length === 10
      ? pacificCalendarDate() < startDate
      : new Date() < new Date(startDate);
  if (notStarted) {
    return { valid: false, message: "This discount code isn't active yet" };
  }

  // A date without a time lasts through the end of that day in Pacific time.
  const expirationDate: string | undefined =
    properties["Expiration Date"]?.date?.start;
  const expired = !expirationDate
    ? false
    : expirationDate.length === 10
      ? pacificCalendarDate() > expirationDate
      : new Date() > new Date(expirationDate);
  if (expired) {
    return { valid: false, message: "This discount code has expired" };
  }

  const percentOff = properties["% Off"]?.number;
  if (!percentOff || percentOff <= 0)
    return { valid: false, message: "Invalid discount percentage" };

  const title =
    properties["Code"]?.title || properties["Code"]?.rich_text || [];
  return {
    valid: true,
    discount: {
      code: title[0]?.plain_text || code.trim().toUpperCase(),
      percentOff,
      firstOrderOnly: properties["First Order Only"]?.checkbox === true,
      noOtherDiscounts: properties["No Other Discounts"]?.checkbox === true,
      subscriptionsOnly: properties["Subscriptions Only"]?.checkbox === true,
    },
  };
};

/** Reads a code from the Notion discount codes database and checks it is active, started, unexpired, and has a percentage. */
export const findDiscountCode = async (
  code: string,
): Promise<DiscountCodeLookup> => {
  // Codes edited in the dashboard, once they've been imported from Notion.
  if ((await contentSource("discounts")) === "firestore") return DiscountStore.find(code);
  const response = await getNotionClient().databases.query({
    database_id: discountCodesDatabaseId(),
    filter: {
      property: "Code",
      rich_text: { equals: code.trim().toUpperCase() },
    },
  });
  return discountFromPage(response.results[0], code);
};

/**
 * The codes marked "Automatically Applied" that are active, started, and
 * unexpired, largest percentage first. Checkout applies them without the
 * customer typing a code.
 */
export const findAutomaticDiscountCodes = async (): Promise<DiscountCode[]> => {
  if ((await contentSource("discounts")) === "firestore") return DiscountStore.automatic();
  const response = await getNotionClient().databases.query({
    database_id: discountCodesDatabaseId(),
    filter: {
      and: [
        { property: "Active", checkbox: { equals: true } },
        { property: "Automatically Applied", checkbox: { equals: true } },
      ],
    },
  });
  return response.results
    .map((page) => discountFromPage(page, ""))
    .flatMap((lookup) => (lookup.valid ? [lookup.discount] : []))
    .sort((a, b) => b.percentOff - a.percentOff);
};

/** Every code in the Notion database, for the one-time import to the dashboard. */
export const listNotionDiscountCodes = async (): Promise<Array<Omit<StoredDiscount, "createdAt" | "updatedAt" | "updatedBy">>> => {
  const rows: Array<Omit<StoredDiscount, "createdAt" | "updatedAt" | "updatedBy">> = [];
  let cursor: string | undefined;
  do {
    const response: any = await getNotionClient().databases.query({
      database_id: discountCodesDatabaseId(),
      start_cursor: cursor,
      page_size: 100,
    });
    for (const page of response.results) {
      const p = page.properties || {};
      const title = (p["Code"]?.title || p["Code"]?.rich_text || []).map((t: any) => t.plain_text).join("").trim();
      if (!title) continue;
      rows.push({
        code: title.toUpperCase(),
        percentOff: Number(p["% Off"]?.number) || 0,
        active: p["Active"]?.checkbox === true,
        startDate: p["Start Date"]?.date?.start || null,
        expirationDate: p["Expiration Date"]?.date?.start || null,
        firstOrderOnly: p["First Order Only"]?.checkbox === true,
        noOtherDiscounts: p["No Other Discounts"]?.checkbox === true,
        subscriptionsOnly: p["Subscriptions Only"]?.checkbox === true,
        automatic: p["Automatically Applied"]?.checkbox === true,
        note: "",
      });
    }
    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);
  return rows;
};
