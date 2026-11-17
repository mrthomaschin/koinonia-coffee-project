import { createLogger } from "../logger";
import { getShipmentStatus } from "./easypost_service";
import {
  RESEND_TEMPLATES,
  sendResendTemplate,
} from "../integrations/email/resend_client";
import { discountRowHtml, itemRowHtml } from "../integrations/email/email_html";
import { STORE_NOTIFICATION_EMAIL } from "../config/site";
import { ReviewService } from "./review_service";
import { carrierName, itemsFormatted, itemsSummary, OrderStore } from "../orders/order_store";
import { OrderRepository } from "../orders/order_repository";
import type { AdminOrder, FulfillmentStatus, OrderEmailFlags } from "../orders/order_model";

const logger = createLogger("email");

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

  /**
   * Scheduled: sends each order's shipped, out-for-delivery, delivered,
   * ready-for-pickup and picked-up emails, once each. Shipping progress comes
   * from EasyPost tracking, or from the status set in the dashboard. Reads and
   * records everything on the Firestore order; Notion gets a best-effort copy.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static async handleOrderStatusUpdates(_event?: unknown): Promise<void> {
    try {
      if (!process.env.RESEND_API_KEY) {
        logger.error("RESEND_API_KEY not configured");
        return;
      }
      const openOrders = await OrderStore.awaitingStatusEmails();
      logger.info(`Found ${openOrders.length} orders awaiting status emails`);
      for (const order of openOrders) {
        await EmailService.sendDueStatusEmails(order);
      }

      logger.info("Order status check completed");
    } catch (error) {
      logger.error("Error checking order status updates:", error);
    }
  }

  /**
   * Sends whichever status emails one order is due (shipped, out for
   * delivery, delivered, ready for pickup, picked up), each at most once.
   * Called by the hourly job, and right after a dashboard status change.
   */
  static async sendDueStatusEmails(order: AdminOrder): Promise<void> {
    // Partly refunded orders still ship; fully refunded or unpaid ones don't.
    if (order.paymentStatus !== "paid" && order.paymentStatus !== "partially_refunded") return;
    const today = () =>
      new Date().toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "America/Los_Angeles",
      });
    if (!order.email) {
      logger.warn(`Order ${order.id} has no email address, skipping`);
      return;
    }
    const customerName = EmailService.getFirstName(order.customerName);
    const itemsHtml = EmailService.parseItemsToHtml(itemsSummary(order));
    const trackingCarrier = carrierName(order);
    const trackingInfo = order.trackingNumber || "";
    const status = order.fulfillmentStatus;
    const recordSent = async (
      flag: keyof OrderEmailFlags,
      newStatus: FulfillmentStatus,
      label: string,
    ) => {
      await OrderStore.markEmailSent(order, flag, newStatus);
      await OrderRepository.addEvent(order.id, {
        type: "email",
        actor: null,
        message: `${label} email sent to ${order.email}`,
      });
      logger.info(`${label} email sent`, { orderId: order.id });
    };
    const queueReviewRequest = () =>
      ReviewService.queueReviewRequest({
        orderId: order.id,
        email: order.email,
        customerFullName: order.customerName,
        purchaseDate: order.createdAt,
        itemsFormatted: itemsFormatted(order),
        ...(order.notion?.pageId
          ? { notionOrderPageId: order.notion.pageId }
          : {}),
      }).catch((error: Error) =>
        logger.error(`Failed to queue review request for ${order.id}:`, error),
      );

    // Shipping progress from EasyPost tracking, when the order has a shipment.
    let easyPostStatus = "unknown";
    let estimatedDelivery = "";
    if (order.shipmentId && !order.isLocalPickup) {
      const shipmentStatus = await getShipmentStatus(order.shipmentId);
      if (shipmentStatus) {
        easyPostStatus = shipmentStatus.status;
        estimatedDelivery = shipmentStatus.estimatedDelivery || "";
      }
    }

    try {
      if (
        (easyPostStatus === "in_transit" || status === "shipped") &&
        !order.emails.shipped
      ) {
        await EmailService.sendShippedNotification({
          toEmail: order.email,
          customerName,
          orderId: order.id,
          itemsHtml,
          shippingAddress: order.shippingAddress || "N/A",
          trackingCarrier,
          trackingInfo,
          estimatedDelivery,
        });
        await recordSent("shipped", "shipped", "Shipped");
      }

      if (
        (easyPostStatus === "out_for_delivery" ||
          status === "out_for_delivery") &&
        !order.emails.outForDelivery
      ) {
        await EmailService.sendOutForDeliveryNotification({
          toEmail: order.email,
          customerName,
          orderId: order.id,
          itemsHtml,
          trackingCarrier,
          trackingInfo,
          deliveryDate: today(),
        });
        await recordSent("outForDelivery", "out_for_delivery", "Out for delivery");
      }

      if (
        (easyPostStatus === "delivered" || status === "delivered") &&
        !order.emails.delivered
      ) {
        await EmailService.sendDeliveredNotification({
          toEmail: order.email,
          customerName,
          orderId: order.id,
          itemsHtml,
          deliveryDate: today(),
        });
        await recordSent("delivered", "delivered", "Delivered");
        await queueReviewRequest();
      }

      if (status === "ready_for_pickup" && !order.emails.readyForPickup) {
        await EmailService.sendReadyForPickupNotification({
          toEmail: order.email,
          customerName,
          orderId: order.id,
          itemsHtml,
          readyDate: today(),
        });
        await recordSent("readyForPickup", "ready_for_pickup", "Ready for pickup");
      }

      if (status === "picked_up" && !order.emails.pickedUp) {
        await EmailService.sendPickedUpNotification({
          toEmail: order.email,
          customerName,
          orderId: order.id,
          itemsHtml,
          pickupDate: today(),
        });
        await recordSent("pickedUp", "picked_up", "Picked up");
        await queueReviewRequest();
      }
    } catch (error) {
      // The flag isn't set, so the next run tries this order again.
      logger.error(`Failed to send a status email for ${order.id}:`, error);
    }
  }
}
