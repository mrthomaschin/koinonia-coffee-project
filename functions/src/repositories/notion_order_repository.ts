import { createLogger } from "../logger";
import { getNotionClient } from "../integrations/notion/notion_client";
import {
  generateReceiptImage,
  receiptFilename,
  uploadReceiptToNotion,
} from "../services/pictify_service";
import { RenewalOrder } from "../domain/subscriptions/renewal_order";

const logger = createLogger("notion-orders");

const normalize = (value: string | undefined | null): string =>
  (value || "").trim().toLowerCase();

/**
 * True when no order placed before `orderCreated` shares the customer's name or
 * email. Matching is trimmed and case-insensitive, and the order itself is
 * excluded so re-syncing an existing page gives the same answer.
 */
export const isFirstTimeCustomer = async ({
  name,
  email,
  orderId,
  orderCreated,
}: {
  name: string;
  email: string;
  orderId: string;
  orderCreated: string | number;
}): Promise<boolean> => {
  const databaseId = process.env.NOTION_ONLINE_ORDERS_DATABASE_ID;
  if (!databaseId)
    throw new Error("NOTION_ONLINE_ORDERS_DATABASE_ID is not configured");
  const targetName = normalize(name);
  const targetEmail = normalize(email);
  if (!targetName && !targetEmail) return true;
  const createdAt = new Date(orderCreated).getTime();

  // "contains" is used rather than "equals" so the exact, case-insensitive
  // comparison below decides the match.
  const filters: any[] = [];
  if (targetName)
    filters.push({ property: "Customer", title: { contains: name.trim() } });
  if (targetEmail)
    filters.push({ property: "Email", email: { contains: email.trim() } });

  const notion = getNotionClient();
  let cursor: string | undefined;
  do {
    const response = await notion.databases.query({
      database_id: databaseId,
      filter: { or: filters },
      start_cursor: cursor,
      page_size: 100,
    });
    const hasEarlierOrder = response.results.some((page: any) => {
      const props = page.properties || {};
      const pageOrderId = (props["Order #"]?.rich_text || [])
        .map((text: any) => text.plain_text)
        .join("");
      if (pageOrderId === orderId) return false;
      const pageName = normalize(
        (props.Customer?.title || []).map((text: any) => text.plain_text).join(""),
      );
      const pageEmail = normalize(props.Email?.email);
      const sameCustomer =
        (!!targetName && pageName === targetName) ||
        (!!targetEmail && pageEmail === targetEmail);
      if (!sameCustomer) return false;
      const pageCreated = new Date(
        props["Order created"]?.date?.start || page.created_time,
      ).getTime();
      return !Number.isFinite(createdAt) || pageCreated < createdAt;
    });
    if (hasEarlierOrder) return false;
    cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
  } while (cursor);
  return true;
};

/**
 * Attaches an invoice receipt image to a renewal order's Notion page. The page
 * itself is written by the shared order mirror (AccountService.syncOrderMirrorById).
 * Returns true once the page has a receipt, including when it already had one.
 */
export const attachRenewalReceipt = async (
  order: RenewalOrder,
): Promise<boolean> => {
  const databaseId = process.env.NOTION_ONLINE_ORDERS_DATABASE_ID;
  if (!databaseId)
    throw new Error("NOTION_ONLINE_ORDERS_DATABASE_ID is not configured");
  const notion = getNotionClient();
  const existing = await notion.databases.query({
    database_id: databaseId,
    filter: { property: "Order #", rich_text: { equals: order.id } },
  });
  const page = existing.results[0] as any;
  if (!page) throw new Error(`Notion order ${order.id} does not exist yet`);
  if (page.properties?.["Invoice Receipt"]?.files?.length) return true;

  try {
    const receiptImage = await generateReceiptImage({
      customerName: order.customerName,
      customerEmail: order.email,
      customerAddress: order.renewal.billingAddress || "N/A",
      orderId: order.id,
      items: order.items.map((line) => ({
        name: line.name,
        sku: line.sku,
        quantity: line.quantity,
        price: line.price,
        variations: line.selections.weight,
      })),
      // Derived from the charged total so add-ons are included and the receipt sums correctly.
      subtotal:
        Math.round((order.totalAmount - order.shippingCharged) * 100) / 100,
      shipping: order.shippingCharged,
      totalAmount: order.totalAmount,
      orderDate: order.createdAt,
      transactionId: order.paymentIntentId,
    });
    const filename = receiptFilename(order.id);
    const receiptUploadId = await uploadReceiptToNotion(filename, receiptImage);
    await notion.pages.update({
      page_id: page.id,
      properties: {
        "Invoice Receipt": {
          files: [
            {
              name: filename,
              type: "file_upload",
              file_upload: { id: receiptUploadId },
            },
          ],
        },
      } as any,
    });
    logger.info("Renewal invoice receipt attached", { orderId: order.id });
    return true;
  } catch (error: unknown) {
    // A missing receipt image should not block the label or customer emails.
    logger.error("Unable to generate renewal invoice receipt", {
      orderId: order.id,
      error: (error as Error).message,
    });
    return false;
  }
};
