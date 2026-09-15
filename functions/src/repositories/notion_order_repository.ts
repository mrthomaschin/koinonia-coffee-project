import { createLogger } from "../logger";
import { getNotionClient } from "../integrations/notion/notion_client";
import { generateReceiptImage, receiptFilename, uploadReceiptToNotion } from "../services/pictify_service";
import { weightInPounds } from "../domain/shipping/weight";

const logger = createLogger("notion-orders");

export interface RenewalOrderProjection {
  orderId: string;
  paymentIntentId: string;
  account: {
    user: { firstName: string; lastName: string; email: string };
    phone?: string;
  };
  subscription: {
    itemName: string;
    itemSku: string;
    bagCount: number;
    weight: string;
    unitAmount: number;
    addOnWeight?: number;
    orderPickupId?: string;
  };
  totalAmount: number;
  shippingAmount: number;
  shippingAddress: string;
  billingAddress: string;
  shippingLabelPrice: number;
  shippingBox: string;
  shipment?: {
    trackingNumber: string;
    shipmentId: string;
    carrier?: string;
    service?: string;
    labelUrl: string;
  };
}

const carrierDisplayName = (carrier?: string): string => {
  if (carrier === "UPSDAP") return "UPS";
  if (carrier === "FedExDefault") return "FedEx";
  return carrier || "Unknown";
};

const serviceDisplayName = (service?: string): string => ({
  GroundAdvantage: "Ground Advantage",
  Priority: "Priority Mail",
  PriorityExpress: "Priority Mail Express",
}[service || ""] || "Standard");

/** Persists a renewal projection and attaches its receipt when possible. */
export const createRenewalOrderProjection = async (params: RenewalOrderProjection): Promise<void> => {
  const databaseId = process.env.NOTION_ONLINE_ORDERS_DATABASE_ID;
  if (!databaseId) throw new Error("NOTION_ONLINE_ORDERS_DATABASE_ID is not configured");
  const notion = getNotionClient();
  const existing = await notion.databases.query({
    database_id: databaseId,
    filter: { property: "Order #", rich_text: { equals: params.orderId } },
  });
  let invoiceReceiptProperties: Record<string, any> = {};
  const existingPage = existing.results[0] as any;
  if (!existingPage?.properties?.["Invoice Receipt"]?.files?.length) {
    try {
      logger.info("Generating renewal invoice receipt", { orderId: params.orderId });
      const receiptImage = await generateReceiptImage({
        customerName: `${params.account.user.firstName} ${params.account.user.lastName}`.trim(),
        customerEmail: params.account.user.email,
        customerAddress: params.billingAddress || "N/A",
        orderId: params.orderId,
        items: [{
          name: params.subscription.itemName,
          sku: params.subscription.itemSku,
          quantity: params.subscription.bagCount,
          price: params.subscription.unitAmount / 100,
          variations: params.subscription.weight,
        }],
        subtotal: (params.subscription.unitAmount * params.subscription.bagCount) / 100,
        shipping: params.shippingAmount,
        totalAmount: params.totalAmount,
        orderDate: new Date().toISOString(),
        transactionId: params.paymentIntentId,
      });
      const filename = receiptFilename(params.orderId);
      const receiptUploadId = await uploadReceiptToNotion(filename, receiptImage);
      invoiceReceiptProperties = {
        "Invoice Receipt": {
          files: [{ name: filename, type: "file_upload", file_upload: { id: receiptUploadId } }],
        },
      };
      logger.info("Renewal invoice receipt attached", { orderId: params.orderId });
    } catch (error: unknown) {
      logger.error("Unable to generate renewal invoice receipt", {
        orderId: params.orderId,
        error: (error as Error).message,
      });
    }
  }

  const shipmentProperties: Record<string, any> = params.shipment ? {
    "Shipping Price": { number: params.shippingLabelPrice },
    "Tracking Info": { rich_text: [{ text: { content: params.shipment.trackingNumber } }] },
    "Shipment ID": { rich_text: [{ text: { content: params.shipment.shipmentId } }] },
    "Tracking Carrier": { select: { name: carrierDisplayName(params.shipment.carrier) } },
    "Carrier Type": { select: { name: serviceDisplayName(params.shipment.service) } },
    "Tracking Label": { url: params.shipment.labelUrl },
    "Shipping Box": { rich_text: [{ text: { content: params.shippingBox } }] },
  } : {
    "Shipping Price": { number: 0 },
    "Local Pickup": { checkbox: true },
    "Order Pickup ID": { rich_text: [{ text: { content: params.subscription.orderPickupId || "" } }] },
  };

  if (existing.results.length) {
    await notion.pages.update({
      page_id: existing.results[0].id,
      properties: { ...shipmentProperties, ...invoiceReceiptProperties },
    });
    return;
  }

  await notion.pages.create({
    parent: { database_id: databaseId },
    properties: {
      "Customer": { title: [{ text: { content: `${params.account.user.firstName} ${params.account.user.lastName}`.trim() } }] },
      "Order #": { rich_text: [{ text: { content: params.orderId } }] },
      "Status": { status: { name: "Paid" } },
      "Fulfillment": { status: { name: "Pending" } },
      "Items ordered": { rich_text: [{ text: { content: `${params.subscription.bagCount}x ${params.subscription.itemName} (${params.subscription.weight})` } }] },
      "Items ordered formatted": { rich_text: [{ text: { content: `${params.subscription.itemName},${params.subscription.itemSku},${weightInPounds(params.subscription.weight) * params.subscription.bagCount + (params.subscription.addOnWeight || 0)}` } }] },
      "Email": { email: params.account.user.email },
      "Phone": { phone_number: params.account.phone || null },
      "Shipping address": { rich_text: [{ text: { content: params.shippingAddress || "N/A" } }] },
      "Transaction ID": { rich_text: [{ text: { content: params.orderId } }] },
      "Receipt": { url: `https://dashboard.stripe.com/payments/${params.paymentIntentId}` },
      ...invoiceReceiptProperties,
      "Total": { number: params.totalAmount },
      ...shipmentProperties,
      "Order created": { date: { start: new Date().toISOString() } },
    },
  });
};
