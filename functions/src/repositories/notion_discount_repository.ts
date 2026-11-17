import { getNotionClient } from "../integrations/notion/notion_client";
import { pacificCalendarDate } from "../domain/dates/calendar_dates";

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
