import { createLogger } from "../logger";
import { getShipmentStatus } from "./easypost_service";
import { getNotionClient } from "../integrations/notion/notion_client";
import {
  RESEND_TEMPLATES,
  sendResendTemplate,
} from "../integrations/email/resend_client";
import { discountRowHtml, itemRowHtml } from "../integrations/email/email_html";
import { STORE_NOTIFICATION_EMAIL } from "../config/site";
import { orderPurchaseDate, ReviewService } from "./review_service";

const logger = createLogger("email");

const getNotion = () => {
  return getNotionClient();
};

const STORE_NAME = "Koinonia Coffee Project";

export interface ContactFormData {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  subject: string;
  message: string;
}

export interface PurchaseItem {
  name: string;
  sku: string;
  quantity: number;
  price: number;
  variations?: string;
  image?: string;
}

export interface PurchaseNotificationData {
  customerEmail: string;
  customerName?: string;
  customerPhone?: string;
  items: PurchaseItem[];
  subtotal?: number;
  discountCode?: string;
  discountPercent?: number;
  discountAmount?: number;
  totalAmount: number;
  orderDate: string;
  sessionId: string;
  shippingAddress?: string;
  billingAddress?: string;
  shippingMethod?: string;
  isLocalPickup?: boolean;
}

export interface CustomerConfirmationData {
  customerEmail: string;
  customerName: string;
  customerPhone?: string;
  items: PurchaseItem[];
  subtotal: number;
  discountCode?: string;
  discountPercent?: number;
  discountAmount?: number;
  shipping: number;
  tax: number;
  totalAmount: number;
  orderDate: string;
  orderId: string;
}

const money = (amount: number): string => `$${amount.toFixed(2)}`;

export class EmailService {
  /** Forwards a website contact form message to the store inbox; replies go to the sender. */
  static async sendContactForm(formData: ContactFormData): Promise<void> {
    await sendResendTemplate(
      {
        to: STORE_NOTIFICATION_EMAIL,
        template: RESEND_TEMPLATES.contactForm,
        replyTo: formData.email,
        subject: `New Contact Form Message: ${formData.subject}`,
        variables: {
          from_name: `${formData.firstName} ${formData.lastName}`,
          from_email: formData.email,
          subject: formData.subject,
          phone: formData.phone,
          message: formData.message,
          to_name: STORE_NAME,
        },
      },
      "Resend contact form failed",
    );
  }

  /** Alerts the store inbox about a new web checkout order. */
  static async sendPurchaseNotification(
    purchaseData: PurchaseNotificationData,
  ): Promise<void> {
    const itemsHtml = purchaseData.items
      .map((item) =>
        itemRowHtml({
          name: item.name,
          details: [
            item.variations || "",
            `SKU ${item.sku}`,
            `Qty ${item.quantity} × ${money(item.price)}`,
          ],
          price: money(item.price * item.quantity),
        }),
      )
      .join("");

    const subtotal =
      purchaseData.subtotal ||
      purchaseData.items.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0,
      );

    await sendResendTemplate(
      {
        to: STORE_NOTIFICATION_EMAIL,
        template: RESEND_TEMPLATES.newOrderNotification,
        variables: {
          customer_email: purchaseData.customerEmail,
          customer_name: purchaseData.customerName || "Customer",
          items_html: itemsHtml,
          subtotal: money(subtotal),
          discount_row_html: discountRowHtml(
            purchaseData.discountCode,
            purchaseData.discountPercent,
            purchaseData.discountAmount,
          ),
          total_amount: money(purchaseData.totalAmount),
          order_date: purchaseData.orderDate,
          // Shorter order ID from the session ID (last 8 characters)
          order_id: purchaseData.sessionId.slice(-8).toUpperCase(),
          session_id: purchaseData.sessionId,
          shipping_address: purchaseData.isLocalPickup
            ? "Not applicable - Local pickup"
            : purchaseData.shippingAddress || "N/A",
          billing_address: purchaseData.billingAddress || "N/A",
          delivery_method: purchaseData.isLocalPickup
            ? "Local Pickup"
            : purchaseData.shippingMethod || "Shipping",
          to_name: STORE_NAME,
        },
      },
      "Resend purchase notification failed",
    );
  }

  /** Sends the customer their web checkout order confirmation. */
  static async sendCustomerConfirmation(
    confirmationData: CustomerConfirmationData,
  ): Promise<void> {
    const itemsHtml = confirmationData.items
      .map((item) => {
        // Convert relative URLs to absolute URLs
        let imageUrl = item.image || "";
        if (imageUrl && !imageUrl.startsWith("http")) {
          imageUrl = `https://koinoniacoffeeproject.com${imageUrl}`;
        }
        return itemRowHtml({
          name: item.name,
          details: [
            item.variations || "",
            item.quantity > 1
              ? `Qty ${item.quantity} · ${money(item.price)} each`
              : `Qty ${item.quantity}`,
          ],
          price: money(item.price * item.quantity),
          imageUrl:
            imageUrl ||
            "https://koinoniacoffeeproject.com/assets/logos/logo_circle.png",
        });
      })
      .join("");

    await sendResendTemplate(
      {
        to: confirmationData.customerEmail,
        template: RESEND_TEMPLATES.orderConfirmation,
        variables: {
          customer_first_name: EmailService.getFirstName(
            confirmationData.customerName,
          ),
          order_id: confirmationData.orderId,
          order_date: confirmationData.orderDate,
          items_html: itemsHtml,
          subtotal: money(confirmationData.subtotal),
          discount_row_html: discountRowHtml(
            confirmationData.discountCode,
            confirmationData.discountPercent,
            confirmationData.discountAmount,
          ),
          shipping: money(confirmationData.shipping),
          tax: money(confirmationData.tax),
          total: money(confirmationData.totalAmount),
        },
      },
      "Resend customer confirmation failed",
    );
  }

  /** Sends a single-use link that confirms the recipient owns this email address. */
  static async sendEmailVerification(params: {
    toEmail: string;
    customerName: string;
    verificationUrl: string;
    purpose: "signup" | "change";
  }): Promise<void> {
    await sendResendTemplate(
      {
        to: params.toEmail,
        template: RESEND_TEMPLATES.verifyEmail,
        variables: {
          customer_name: params.customerName,
          verification_url: params.verificationUrl,
          email_purpose:
            params.purpose === "signup"
              ? "please confirm your email address to finish setting up your Koinonia Coffee Project account."
              : "please confirm your new email address. Your account keeps using your current email until you do.",
          expires_in: "24 hours",
        },
      },
      "Resend email verification failed",
    );
  }

  static async sendSubscriptionRenewalReminder(params: {
    toEmail: string;
    customerName: string;
    renewalDate: string;
    deliveryMethod: string;
    totalAmount: number;
    itemsHtml: string;
    manageSubscriptionUrl: string;
  }): Promise<void> {
    await sendResendTemplate(
      {
        to: params.toEmail,
        template: RESEND_TEMPLATES.subscriptionRenewalReminder,
        variables: {
          customer_name: params.customerName,
          renewal_date: params.renewalDate,
          delivery_method: params.deliveryMethod,
          total_amount: money(params.totalAmount),
          items_html: params.itemsHtml,
          manage_subscription_url: params.manageSubscriptionUrl,
        },
      },
      "Resend subscription reminder failed",
    );
  }

  static async sendSubscriptionPurchaseNotification(params: {
    customerEmail: string;
    customerName: string;
    orderId: string;
    itemName: string;
    quantity: number;
    unitAmount: number;
    totalAmount: number;
    shippingAddress: string;
    billingAddress: string;
    deliveryMethod: string;
  }): Promise<void> {
    await sendResendTemplate(
      {
        to: STORE_NOTIFICATION_EMAIL,
        template: RESEND_TEMPLATES.newOrderNotification,
        variables: {
          customer_email: params.customerEmail,
          customer_name: params.customerName,
          order_id: params.orderId,
          session_id: params.orderId,
          order_date: new Date().toISOString(),
          order_items: `1. ${params.itemName}\n   Quantity: ${params.quantity}\n   Unit Price: ${money(params.unitAmount)}`,
          subtotal: money(params.totalAmount),
          discount_row_html: "",
          total_amount: money(params.totalAmount),
          shipping_address: params.shippingAddress || "N/A",
          billing_address: params.billingAddress || "N/A",
          delivery_method: params.deliveryMethod || "Shipping",
          to_name: STORE_NAME,
        },
      },
      "Resend purchase notification failed",
    );
  }

  static async sendSubscriptionOrderConfirmation(params: {
    toEmail: string;
    customerName: string;
    orderId: string;
    itemName: string;
    quantity: number;
    totalAmount: number;
    shippingAmount: number;
  }): Promise<void> {
    await sendResendTemplate(
      {
        to: params.toEmail,
        template: RESEND_TEMPLATES.orderConfirmation,
        variables: {
          customer_first_name: EmailService.getFirstName(params.customerName),
          order_id: params.orderId,
          order_date: new Date().toISOString(),
          items_html: itemRowHtml({
            name: `${params.quantity}x ${params.itemName}`,
          }),
          subtotal: money(params.totalAmount - params.shippingAmount),
          discount_row_html: "",
          shipping: money(params.shippingAmount),
          tax: "$0.00",
          total: money(params.totalAmount),
        },
      },
      "Resend subscription confirmation failed",
    );
  }

  static getFirstName(fullName: string): string {
    if (!fullName) return "Customer";
    const trimmed = fullName.trim();
    const firstSpace = trimmed.indexOf(" ");
    return firstSpace > 0 ? trimmed.substring(0, firstSpace) : trimmed;
  }

  static parseItemsToHtml(itemsText: string): string {
    if (!itemsText) return "<p>No items found</p>";

    const lines = itemsText.split("\n").filter((line) => line.trim());

    return lines.map((line) => itemRowHtml({ name: line.trim() })).join("");
  }

  static trackingUrlFor(trackingCarrier: string, trackingInfo: string): string {
    if (trackingCarrier === "UPS") {
      return `https://www.ups.com/track?loc=en_US&requester=ST/trackdetails&tracknums=${trackingInfo}`;
    } else if (trackingCarrier === "Fedex") {
      return `https://www.fedex.com/wtrk/track/?trknbr=${trackingInfo}`;
    }
    // USPS tracking URL format
    return `https://tools.usps.com/tracking?tLabels=${trackingInfo}`;
  }

  static async sendShippedNotification(params: {
    toEmail: string;
    customerName: string;
    orderId: string;
    itemsHtml: string;
    shippingAddress: string;
    trackingCarrier: string;
    trackingInfo: string;
    estimatedDelivery?: string;
  }): Promise<void> {
    const {
      toEmail,
      customerName,
      orderId,
      itemsHtml,
      shippingAddress,
      trackingCarrier,
      trackingInfo,
      estimatedDelivery,
    } = params;
    await sendResendTemplate({
      to: toEmail,
      template: RESEND_TEMPLATES.orderShipped,
      variables: {
        customer_name: customerName,
        order_id: orderId,
        items_html: itemsHtml,
        shipping_address: shippingAddress,
        carrier: trackingCarrier || "USPS",
        tracking_number: trackingInfo || "Available soon",
        estimated_delivery: estimatedDelivery || "3-5 business days",
        tracking_url: EmailService.trackingUrlFor(
          trackingCarrier,
          trackingInfo,
        ),
      },
    });
  }

  static async sendDeliveredNotification(params: {
    toEmail: string;
    customerName: string;
    orderId: string;
    itemsHtml: string;
    deliveryDate: string;
  }): Promise<void> {
    const { toEmail, customerName, orderId, itemsHtml, deliveryDate } = params;
    await sendResendTemplate({
      to: toEmail,
      template: RESEND_TEMPLATES.orderDelivered,
      variables: {
        customer_name: customerName,
        order_id: orderId,
        items_html: itemsHtml,
        delivery_date: deliveryDate,
        delivery_location: "Front door",
        review_url: "https://koinoniacoffeeproject.com/reviews",
      },
    });
  }

  static async sendPickedUpNotification(params: {
    toEmail: string;
    customerName: string;
    orderId: string;
    itemsHtml: string;
    pickupDate: string;
  }): Promise<void> {
    const { toEmail, customerName, orderId, itemsHtml, pickupDate } = params;
    await sendResendTemplate({
      to: toEmail,
      template: RESEND_TEMPLATES.orderPickedUp,
      variables: {
        customer_name: customerName,
        order_id: orderId,
        items_html: itemsHtml,
        pickup_date: pickupDate,
      },
    });
  }

  static async sendReadyForPickupNotification(params: {
    toEmail: string;
    customerName: string;
    orderId: string;
    itemsHtml: string;
    readyDate: string;
  }): Promise<void> {
    const { toEmail, customerName, orderId, itemsHtml, readyDate } = params;
    await sendResendTemplate({
      to: toEmail,
      template: RESEND_TEMPLATES.orderReadyForPickup,
      variables: {
        customer_name: customerName,
        order_id: orderId,
        items_html: itemsHtml,
        ready_date: readyDate,
      },
    });
  }

  static async sendOutForDeliveryNotification(params: {
    toEmail: string;
    customerName: string;
    orderId: string;
    itemsHtml: string;
    trackingCarrier: string;
    trackingInfo: string;
    deliveryDate: string;
  }): Promise<void> {
    const {
      toEmail,
      customerName,
      orderId,
      itemsHtml,
      trackingCarrier,
      trackingInfo,
      deliveryDate,
    } = params;
    await sendResendTemplate({
      to: toEmail,
      template: RESEND_TEMPLATES.orderOutForDelivery,
      variables: {
        customer_name: customerName,
        order_id: orderId,
        items_html: itemsHtml,
        carrier: trackingCarrier || "USPS",
        tracking_number: trackingInfo || "Available soon",
        delivery_date: deliveryDate,
        tracking_url: EmailService.trackingUrlFor(
          trackingCarrier,
          trackingInfo,
        ),
      },
    });
  }

  static async handleOrderStatusUpdates(event?: any): Promise<void> {
    try {
      logger.info("Starting order status check...");

      const databaseId = process.env.NOTION_ONLINE_ORDERS_DATABASE_ID;

      if (!databaseId) {
        logger.error("NOTION_ONLINE_ORDERS_DATABASE_ID not configured");
        return;
      }

      if (!process.env.RESEND_API_KEY) {
        logger.error("RESEND_API_KEY not configured");
        return;
      }

      const notion = getNotion();

      // Every order still waiting on its final (delivered or picked up) email,
      // read page by page so none are missed once there are more than 100.
      const openOrders: any[] = [];
      let cursor: string | undefined;
      do {
        const response = await notion.databases.query({
          database_id: databaseId,
          start_cursor: cursor,
          page_size: 100,
          filter: {
            and: [
              { property: "Delivered Email Sent", checkbox: { equals: false } },
              { property: "Picked Up Email Sent", checkbox: { equals: false } },
            ],
          },
        });
        openOrders.push(...response.results);
        cursor = response.has_more
          ? response.next_cursor || undefined
          : undefined;
      } while (cursor);

      logger.info(`Found ${openOrders.length} orders awaiting status emails`);

      for (const page of openOrders) {
        if (!("properties" in page)) continue;

        const properties = page.properties;

        // Extract order data
        const fulfillmentProp = properties["Fulfillment"];
        const shippedEmailSentProp = properties["Shipped Email Sent"];
        const outForDeliveryEmailSentProp =
          properties["Out For Delivery Email Sent"];
        const deliveredEmailSentProp = properties["Delivered Email Sent"];
        const pickedUpEmailSentProp = properties["Picked Up Email Sent"];
        const readyForPickupEmailSentProp =
          properties["Ready For Pickup Email Sent"];
        const emailProp = properties["Email"];
        const customerProp = properties["Customer"];
        const orderIdProp = properties["Order #"];
        const itemsOrderedProp = properties["Items ordered"];
        const itemsOrderedFormattedProp = properties["Items ordered formatted"];
        const shippingAddressProp = properties["Shipping address"];
        const trackingCarrierProp = properties["Tracking Carrier"];
        const trackingInfoProp = properties["Tracking Info"];
        const shipmentIdProp = properties["Shipment ID"];

        if (
          fulfillmentProp?.type !== "status" ||
          shippedEmailSentProp?.type !== "checkbox" ||
          outForDeliveryEmailSentProp?.type !== "checkbox" ||
          deliveredEmailSentProp?.type !== "checkbox" ||
          emailProp?.type !== "email" ||
          customerProp?.type !== "title" ||
          orderIdProp?.type !== "rich_text"
        ) {
          continue;
        }

        const shippedEmailSent = shippedEmailSentProp.checkbox;
        const outForDeliveryEmailSent = outForDeliveryEmailSentProp.checkbox;
        const deliveredEmailSent = deliveredEmailSentProp.checkbox;
        const pickedUpEmailSent =
          pickedUpEmailSentProp?.type === "checkbox" &&
          pickedUpEmailSentProp.checkbox;
        const readyForPickupEmailSent =
          readyForPickupEmailSentProp?.type === "checkbox" &&
          readyForPickupEmailSentProp.checkbox;
        const fulfillmentStatus =
          fulfillmentProp?.type === "status"
            ? (fulfillmentProp.status as any)?.name
            : "";
        const customerEmail = emailProp.email as string;
        const customerFullName =
          (customerProp.title as any)[0]?.plain_text || "Customer";
        const customerName = EmailService.getFirstName(customerFullName);
        const orderId = (orderIdProp.rich_text as any)[0]?.plain_text || "N/A";
        const itemsOrdered = (
          itemsOrderedProp?.type === "rich_text"
            ? (itemsOrderedProp.rich_text as any)[0]?.plain_text || ""
            : ""
        ) as string;
        const shippingAddress =
          shippingAddressProp?.type === "rich_text"
            ? (shippingAddressProp.rich_text as any)[0]?.plain_text || "N/A"
            : "N/A";
        const trackingCarrier =
          trackingCarrierProp?.type === "select"
            ? (trackingCarrierProp.select as any)?.name || ""
            : "";
        const trackingInfo =
          trackingInfoProp?.type === "rich_text"
            ? (trackingInfoProp.rich_text as any)[0]?.plain_text || ""
            : "";
        const shipmentId =
          shipmentIdProp?.type === "rich_text"
            ? (shipmentIdProp.rich_text as any)[0]?.plain_text || ""
            : "";

        if (!customerEmail) {
          logger.warn(`Order ${orderId} has no email address, skipping`);
          continue;
        }

        const queueReviewRequest = () =>
          ReviewService.queueReviewRequest({
            orderId,
            email: customerEmail,
            customerFullName,
            purchaseDate: orderPurchaseDate(page),
            itemsFormatted:
              itemsOrderedFormattedProp?.type === "rich_text"
                ? (itemsOrderedFormattedProp.rich_text as any)
                    .map((part: any) => part.plain_text)
                    .join("")
                : "",
            notionOrderPageId: page.id,
          }).catch((error: Error) =>
            logger.error(
              `Failed to queue review request for ${orderId}:`,
              error,
            ),
          );

        // Parse items for HTML rendering
        const itemsHtml: string = EmailService.parseItemsToHtml(itemsOrdered);

        // Check EasyPost shipment status instead of Notion fulfillment status
        let easyPostStatus = "unknown";
        let estimatedDelivery = "";
        if (shipmentId) {
          const shipmentStatus = await getShipmentStatus(shipmentId);
          if (shipmentStatus) {
            easyPostStatus = shipmentStatus.status;
            estimatedDelivery = shipmentStatus.estimatedDelivery || "";
            logger.info(
              `EasyPost status for order ${orderId}: ${easyPostStatus}, estimated delivery: ${estimatedDelivery}`,
            );
          }
        }

        // Check if we need to send "Shipped" notification based on EasyPost status or Notion fulfillment status
        if (
          (easyPostStatus === "in_transit" ||
            fulfillmentStatus === "Shipped") &&
          !shippedEmailSent
        ) {
          logger.info(
            `Sending shipped notification for order ${orderId} (EasyPost status: ${easyPostStatus})`,
          );

          try {
            await EmailService.sendShippedNotification({
              toEmail: customerEmail,
              customerName,
              orderId,
              itemsHtml,
              shippingAddress,
              trackingCarrier,
              trackingInfo,
              estimatedDelivery,
            });

            // Mark shipped email as sent and update fulfillment status in Notion
            await notion.pages.update({
              page_id: page.id,
              properties: {
                "Shipped Email Sent": {
                  checkbox: true,
                },
                Fulfillment: {
                  status: {
                    name: "Shipped",
                  },
                },
              },
            });

            logger.info(
              `✅ Shipped notification sent and Notion updated for order ${orderId}`,
            );
          } catch (error) {
            logger.error(
              `Failed to send shipped notification for ${orderId}:`,
              error,
            );
          }
        }

        // Check if we need to send "Out For Delivery" notification based on EasyPost status or Notion fulfillment status
        if (
          (easyPostStatus === "out_for_delivery" ||
            fulfillmentStatus === "Out for delivery") &&
          !outForDeliveryEmailSent
        ) {
          logger.info(
            `Sending out for delivery notification for order ${orderId} (EasyPost status: ${easyPostStatus})`,
          );

          try {
            await EmailService.sendOutForDeliveryNotification({
              toEmail: customerEmail,
              customerName,
              orderId,
              itemsHtml,
              trackingCarrier,
              trackingInfo,
              deliveryDate: new Date().toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              }),
            });

            // Mark out for delivery email as sent in Notion
            await notion.pages.update({
              page_id: page.id,
              properties: {
                "Out For Delivery Email Sent": {
                  checkbox: true,
                },
                Fulfillment: {
                  status: {
                    name: "Out for delivery",
                  },
                },
              },
            });

            logger.info(
              `✅ Out for delivery notification sent for order ${orderId}`,
            );
          } catch (error) {
            logger.error(
              `Failed to send out for delivery notification for ${orderId}:`,
              error,
            );
          }
        }

        // Check if we need to send "Delivered" notification based on EasyPost status or Notion fulfillment status
        if (
          (easyPostStatus === "delivered" ||
            fulfillmentStatus === "Delivered") &&
          !deliveredEmailSent
        ) {
          logger.info(
            `Sending delivered notification for order ${orderId} (EasyPost status: ${easyPostStatus})`,
          );

          try {
            await EmailService.sendDeliveredNotification({
              toEmail: customerEmail,
              customerName,
              orderId,
              itemsHtml,
              deliveryDate: new Date().toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              }),
            });

            // Mark delivered email as sent and update fulfillment status in Notion
            await notion.pages.update({
              page_id: page.id,
              properties: {
                "Delivered Email Sent": {
                  checkbox: true,
                },
                Fulfillment: {
                  status: {
                    name: "Delivered",
                  },
                },
              },
            });

            logger.info(
              `✅ Delivered notification sent and Notion updated for order ${orderId}`,
            );
            await queueReviewRequest();
          } catch (error) {
            logger.error(
              `Failed to send delivered notification for ${orderId}:`,
              error,
            );
          }
        }

        // Check if we need to send "Picked up" notification based on the Notion fulfillment status
        if (
          fulfillmentStatus === "Picked up" &&
          pickedUpEmailSentProp?.type === "checkbox" &&
          !pickedUpEmailSent
        ) {
          logger.info(`Sending picked up notification for order ${orderId}`);

          try {
            await EmailService.sendPickedUpNotification({
              toEmail: customerEmail,
              customerName,
              orderId,
              itemsHtml,
              pickupDate: new Date().toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              }),
            });

            await notion.pages.update({
              page_id: page.id,
              properties: {
                "Picked Up Email Sent": {
                  checkbox: true,
                },
                Fulfillment: {
                  status: {
                    name: "Picked up",
                  },
                },
              },
            });

            logger.info(
              `✅ Picked up notification sent and Notion updated for order ${orderId}`,
            );
            await queueReviewRequest();
          } catch (error) {
            logger.error(
              `Failed to send picked up notification for ${orderId}:`,
              error,
            );
          }
        }

        // Check if we need to send "Ready for pickup" notification based on the Notion fulfillment status
        if (
          fulfillmentStatus === "Ready for pickup" &&
          readyForPickupEmailSentProp?.type === "checkbox" &&
          !readyForPickupEmailSent
        ) {
          logger.info(
            `Sending ready for pickup notification for order ${orderId}`,
          );

          try {
            await EmailService.sendReadyForPickupNotification({
              toEmail: customerEmail,
              customerName,
              orderId,
              itemsHtml,
              readyDate: new Date().toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              }),
            });

            await notion.pages.update({
              page_id: page.id,
              properties: {
                "Ready For Pickup Email Sent": {
                  checkbox: true,
                },
                Fulfillment: {
                  status: {
                    name: "Ready for pickup",
                  },
                },
              },
            });

            logger.info(
              `✅ Ready for pickup notification sent and Notion updated for order ${orderId}`,
            );
          } catch (error) {
            logger.error(
              `Failed to send ready for pickup notification for ${orderId}:`,
              error,
            );
          }
        }
      }

      logger.info("Order status check completed");
    } catch (error) {
      logger.error("Error checking order status updates:", error);
    }
  }
}
