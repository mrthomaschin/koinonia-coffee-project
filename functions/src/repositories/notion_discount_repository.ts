import { getNotionClient } from "../integrations/notion/notion_client";

export interface DiscountCode {
  code: string;
  percentOff: number;
  // "First Order Only" checkbox: only for people with no earlier orders.
  firstOrderOnly: boolean;
  // "No Other Discounts" checkbox: not with subscriptions or partner pricing.
  noOtherDiscounts: boolean;
}

export type DiscountCodeLookup =
  | { valid: true; discount: DiscountCode }
  | { valid: false; message: string };

/** Reads a code from the Notion discount codes database and checks it is active, unexpired, and has a percentage. */
export const findDiscountCode = async (
  code: string,
): Promise<DiscountCodeLookup> => {
  const databaseId = process.env.NOTION_DISCOUNT_CODES_DATABASE_ID;
  if (!databaseId)
    throw new Error("NOTION_DISCOUNT_CODES_DATABASE_ID not configured");

  const response = await getNotionClient().databases.query({
    database_id: databaseId,
    filter: {
      property: "Code",
      rich_text: { equals: code.trim().toUpperCase() },
    },
  });
  const page = response.results[0];
  if (!page || !("properties" in page))
    return { valid: false, message: "Invalid discount code" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const properties = page.properties as any;
  if (!properties["Active"]?.checkbox)
    return { valid: false, message: "This discount code is no longer active" };

  const expirationDate = properties["Expiration Date"]?.date?.start;
  if (expirationDate && new Date() > new Date(expirationDate)) {
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
    },
  };
};

/**
 * True when any of the emails has placed an order. Every order, guest or
 * account, is recorded in the Notion online orders database, whose email
 * filter ignores letter case.
 */
export const hasPreviousOrders = async (emails: string[]): Promise<boolean> => {
  const databaseId = process.env.NOTION_ONLINE_ORDERS_DATABASE_ID;
  if (!databaseId)
    throw new Error("NOTION_ONLINE_ORDERS_DATABASE_ID is not configured");
  const filters = [...new Set(emails.filter(Boolean))].map((email) => ({
    property: "Email",
    email: { equals: email },
  }));
  if (!filters.length) return false;
  const response = await getNotionClient().databases.query({
    database_id: databaseId,
    filter: filters.length === 1 ? filters[0] : { or: filters },
    page_size: 1,
  });
  return response.results.length > 0;
};
