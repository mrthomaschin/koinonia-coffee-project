import { createLogger } from "../logger";
import { getNotionClient } from "../integrations/notion/notion_client";
import {
  generateReceiptImage,
  receiptFilename,
  uploadReceiptToNotion,
} from "../services/pictify_service";
import { RenewalOrder } from "../domain/subscriptions/renewal_order";

const logger = createLogger("notion-orders");

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
