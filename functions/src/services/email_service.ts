import { Client } from "@notionhq/client";
import { createLogger } from "../logger";
import { getShipmentStatus } from "./easypost_service";

const logger = createLogger("email");

// Lazy-initialize Notion client
let notionInstance: Client | null = null;
const getNotion = () => {
    if (!notionInstance) {
        const token = process.env.NOTION_TOKEN;
        if (!token) {
            throw new Error("NOTION_TOKEN is not configured");
        }
        notionInstance = new Client({ auth: token });
    }
    return notionInstance;
};

export class EmailService {
    static async sendSubscriptionPurchaseNotification(params: { customerEmail: string; customerName: string; orderId: string; itemName: string; quantity: number; unitAmount: number; totalAmount: number }): Promise<void> {
        const serviceId = process.env.EMAILJS_SERVICE_ID;
        const templateId = process.env.EMAILJS_PURCHASE_TEMPLATE_ID;
        const publicKey = process.env.EMAILJS_PUBLIC_KEY;
        const privateKey = process.env.EMAILJS_PRIVATE_KEY;
        if (!serviceId || !templateId || !publicKey || !privateKey) {
            throw new Error("EmailJS service, purchase template, public key, and private key are required for purchase notifications");
        }
        const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                service_id: serviceId,
                template_id: templateId,
                user_id: publicKey,
                accessToken: privateKey,
                template_params: {
                    customer_email: params.customerEmail,
                    customer_name: params.customerName,
                    order_id: params.orderId,
                    session_id: params.orderId,
                    order_date: new Date().toISOString(),
                    order_items: `1. ${params.itemName}\n   Quantity: ${params.quantity}\n   Unit Price: $${params.unitAmount.toFixed(2)}`,
                    subtotal: `$${params.totalAmount.toFixed(2)}`,
                    total_amount: `$${params.totalAmount.toFixed(2)}`,
                    to_name: "Koinonia Coffee Project",
                },
            }),
        });
        if (!response.ok) throw new Error(`EmailJS purchase notification failed: ${response.status} - ${await response.text()}`);
    }

    static async sendSubscriptionOrderConfirmation(params: { toEmail: string; customerName: string; orderId: string; itemName: string; quantity: number; totalAmount: number; shippingAmount: number }): Promise<void> {
        const serviceId = process.env.EMAILJS_SERVICE_ID;
        const templateId = process.env.EMAILJS_CUSTOMER_TEMPLATE_ID;
        const publicKey = process.env.EMAILJS_PUBLIC_KEY;
        const privateKey = process.env.EMAILJS_PRIVATE_KEY;
        if (!serviceId || !templateId || !publicKey || !privateKey) {
            throw new Error("EmailJS service, customer template, public key, and private key are required for subscription confirmations");
        }
        const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                service_id: serviceId,
                template_id: templateId,
                user_id: publicKey,
                accessToken: privateKey,
                template_params: {
                    to_email: params.toEmail,
                    customer_name: params.customerName,
                    customer_first_name: EmailService.getFirstName(params.customerName),
                    order_id: params.orderId,
                    order_date: new Date().toISOString(),
                    items_html: `<p>${params.quantity}x ${params.itemName}</p>`,
                    subtotal: `$${(params.totalAmount - params.shippingAmount).toFixed(2)}`,
                    shipping: `$${params.shippingAmount.toFixed(2)}`,
                    tax: "$0.00",
                    total: `$${params.totalAmount.toFixed(2)}`,
                },
            }),
        });
        if (!response.ok) throw new Error(`EmailJS subscription confirmation failed: ${response.status} - ${await response.text()}`);
    }

    private static getFirstName(fullName: string): string {
        if (!fullName) return "Customer";
        const trimmed = fullName.trim();
        const firstSpace = trimmed.indexOf(" ");
        return firstSpace > 0 ? trimmed.substring(0, firstSpace) : trimmed;
    }

    private static parseItemsToHtml(itemsText: string): string {
        if (!itemsText) return "<p>No items found</p>";

        const lines = itemsText.split("\n").filter((line) => line.trim());

        return lines.map((line) => {
            const trimmed = line.trim();
            return `
      <div style="display: table; width: 100%; margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid #f0f0f0;">
        <div style="display: table-cell; vertical-align: top; padding-left: 16px;">
          <div style="font-size: 14px; font-weight: 500; color: #000000; margin-bottom: 4px;">${trimmed}</div>
        </div>
      </div>
    `;
        }).join("");
    }

    static async sendShippedNotification(params: {
        serviceId: string;
        templateId: string;
        publicKey: string;
        privateKey: string;
        toEmail: string;
        customerName: string;
        orderId: string;
        itemsHtml: string;
        shippingAddress: string;
        trackingCarrier: string;
        trackingInfo: string;
        estimatedDelivery?: string;
    }): Promise<void> {
        const { serviceId, templateId, publicKey, privateKey, toEmail, customerName, orderId, itemsHtml, shippingAddress, trackingCarrier, trackingInfo, estimatedDelivery } = params;

        // Generate tracking URL based on carrier
        let trackingUrl = "https://tools.usps.com/tracking";
        if (trackingCarrier === "UPS") {
            trackingUrl = `https://www.ups.com/track?loc=en_US&requester=ST/trackdetails&tracknums=${trackingInfo}`;
        } else if (trackingCarrier === "Fedex") {
            trackingUrl = `https://www.fedex.com/wtrk/track/?trknbr=${trackingInfo}`;
        } else {
            // USPS tracking URL format
            trackingUrl = `https://tools.usps.com/tracking?tLabels=${trackingInfo}`;
        }

        const emailData = {
            service_id: serviceId,
            template_id: templateId,
            user_id: publicKey,
            accessToken: privateKey,
            template_params: {
                to_email: toEmail,
                customer_name: customerName,
                order_id: orderId,
                items_html: itemsHtml,
                shipping_address: shippingAddress,
                carrier: trackingCarrier || "USPS",
                tracking_info: trackingInfo || "Tracking information will be updated soon",
                tracking_number: trackingInfo || "Available soon",
                estimated_delivery: estimatedDelivery || "3-5 business days",
                tracking_url: trackingUrl,
            },
        };

        const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(emailData),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`EmailJS API error: ${response.status} - ${errorText}`);
        }
    }

    static async sendDeliveredNotification(params: {
        serviceId: string;
        templateId: string;
        publicKey: string;
        privateKey: string;
        toEmail: string;
        customerName: string;
        orderId: string;
        itemsHtml: string;
        deliveryDate: string;
    }): Promise<void> {
        const { serviceId, templateId, publicKey, privateKey, toEmail, customerName, orderId, itemsHtml, deliveryDate } = params;

        const emailData = {
            service_id: serviceId,
            template_id: templateId,
            user_id: publicKey,
            accessToken: privateKey,
            template_params: {
                to_email: toEmail,
                customer_name: customerName,
                order_id: orderId,
                items_html: itemsHtml,
                delivery_date: deliveryDate,
                delivery_location: "Front door",
                review_url: "https://koinoniacoffeeproject.com/reviews",
            },
        };

        const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(emailData),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`EmailJS API error: ${response.status} - ${errorText}`);
        }
    }

    static async sendOutForDeliveryNotification(params: {
        serviceId: string;
        templateId: string;
        publicKey: string;
        privateKey: string;
        toEmail: string;
        customerName: string;
        orderId: string;
        itemsHtml: string;
        trackingCarrier: string;
        trackingInfo: string;
        deliveryDate: string;
    }): Promise<void> {
        const { serviceId, templateId, publicKey, privateKey, toEmail, customerName, orderId, itemsHtml, trackingCarrier, trackingInfo, deliveryDate } = params;

        // Generate tracking URL based on carrier
        let trackingUrl = "https://tools.usps.com/tracking";
        if (trackingCarrier === "UPS") {
            trackingUrl = `https://www.ups.com/track?loc=en_US&requester=ST/trackdetails&tracknums=${trackingInfo}`;
        } else if (trackingCarrier === "Fedex") {
            trackingUrl = `https://www.fedex.com/wtrk/track/?trknbr=${trackingInfo}`;
        } else {
            // USPS tracking URL format
            trackingUrl = `https://tools.usps.com/tracking?tLabels=${trackingInfo}`;
        }

        const emailData = {
            service_id: serviceId,
            template_id: templateId,
            user_id: publicKey,
            accessToken: privateKey,
            template_params: {
                to_email: toEmail,
                customer_name: customerName,
                order_id: orderId,
                items_html: itemsHtml,
                carrier: trackingCarrier || "USPS",
                tracking_number: trackingInfo || "Available soon",
                delivery_date: deliveryDate,
                tracking_url: trackingUrl,
            },
        };

        const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(emailData),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`EmailJS API error: ${response.status} - ${errorText}`);
        }
    }

    static async handleOrderStatusUpdates(event?: any): Promise<void> {
        try {
            logger.info("Starting order status check...");

            const databaseId = process.env.NOTION_ONLINE_ORDERS_DATABASE_ID;
            const emailjsServiceId = process.env.EMAILJS_SERVICE_ID;
            const emailjsPublicKey = process.env.EMAILJS_PUBLIC_KEY;
            const emailjsPrivateKey = process.env.EMAILJS_PRIVATE_KEY;
            const shippedTemplateId = process.env.EMAILJS_SHIPPED_TEMPLATE_ID;
            const outForDeliveryTemplateId = process.env.EMAILJS_OUT_FOR_DELIVERY_TEMPLATE_ID;
            const deliveredTemplateId = process.env.EMAILJS_DELIVERED_TEMPLATE_ID;

            if (!databaseId) {
                logger.error("NOTION_ONLINE_ORDERS_DATABASE_ID not configured");
                return;
            }

            if (!emailjsServiceId || !emailjsPublicKey || !emailjsPrivateKey) {
                logger.error("EmailJS configuration missing");
                return;
            }

            const notion = getNotion();

            // Query all orders (filter in code to catch old deliveries)
            const response = await notion.databases.query({
                database_id: databaseId,
            });

            logger.info(`Found ${response.results.length} recently updated orders`);

            for (const page of response.results) {
                if (!("properties" in page)) continue;

                const properties = page.properties;

                // Extract order data
                const fulfillmentProp = properties["Fulfillment"];
                const shippedEmailSentProp = properties["Shipped Email Sent"];
                const outForDeliveryEmailSentProp = properties["Out For Delivery Email Sent"];
                const deliveredEmailSentProp = properties["Delivered Email Sent"];
                const emailProp = properties["Email"];
                const customerProp = properties["Customer"];
                const orderIdProp = properties["Order #"];
                const itemsOrderedProp = properties["Items ordered"];
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
                const fulfillmentStatus = fulfillmentProp?.type === "status" ? (fulfillmentProp.status as any)?.name : "";
                const customerEmail = emailProp.email as string;
                const customerFullName = (customerProp.title as any)[0]?.plain_text || "Customer";
                const customerName = EmailService.getFirstName(customerFullName);
                const orderId = (orderIdProp.rich_text as any)[0]?.plain_text || "N/A";
                const itemsOrdered = (itemsOrderedProp?.type === "rich_text" ?
                    (itemsOrderedProp.rich_text as any)[0]?.plain_text || "" : "") as string;
                const shippingAddress = shippingAddressProp?.type === "rich_text" ?
                    (shippingAddressProp.rich_text as any)[0]?.plain_text || "N/A" : "N/A";
                const trackingCarrier = trackingCarrierProp?.type === "select" ?
                    (trackingCarrierProp.select as any)?.name || "" : "";
                const trackingInfo = trackingInfoProp?.type === "rich_text" ?
                    (trackingInfoProp.rich_text as any)[0]?.plain_text || "" : "";
                const shipmentId = shipmentIdProp?.type === "rich_text" ?
                    (shipmentIdProp.rich_text as any)[0]?.plain_text || "" : "";

                if (!customerEmail) {
                    logger.warn(`Order ${orderId} has no email address, skipping`);
                    continue;
                }

                // Parse items for HTML rendering
                const itemsHtml: string = EmailService.parseItemsToHtml(itemsOrdered);

                // Check EasyPost shipment status instead of Notion fulfillment status
                let easyPostStatus = 'unknown';
                let estimatedDelivery = '';
                if (shipmentId) {
                    const shipmentStatus = await getShipmentStatus(shipmentId);
                    if (shipmentStatus) {
                        easyPostStatus = shipmentStatus.status;
                        estimatedDelivery = shipmentStatus.estimatedDelivery || '';
                        logger.info(`EasyPost status for order ${orderId}: ${easyPostStatus}, estimated delivery: ${estimatedDelivery}`);
                    }
                }

                // Check if we need to send "Shipped" notification based on EasyPost status or Notion fulfillment status
                if ((easyPostStatus === "in_transit" || fulfillmentStatus === "Shipped") && !shippedEmailSent && shippedTemplateId) {
                    logger.info(`Sending shipped notification for order ${orderId} (EasyPost status: ${easyPostStatus})`);

                    try {
                        await EmailService.sendShippedNotification({
                            serviceId: emailjsServiceId,
                            templateId: shippedTemplateId,
                            publicKey: emailjsPublicKey,
                            privateKey: emailjsPrivateKey,
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
                                "Fulfillment": {
                                    status: {
                                        name: "Shipped",
                                    },
                                },
                            },
                        });

                        logger.info(`✅ Shipped notification sent and Notion updated for order ${orderId}`);
                    } catch (error) {
                        logger.error(`Failed to send shipped notification for ${orderId}:`, error);
                    }
                }

                // Check if we need to send "Out For Delivery" notification based on EasyPost status or Notion fulfillment status
                if ((easyPostStatus === "out_for_delivery" || fulfillmentStatus === "Out for delivery") && !outForDeliveryEmailSent && outForDeliveryTemplateId) {
                    logger.info(`Sending out for delivery notification for order ${orderId} (EasyPost status: ${easyPostStatus})`);

                    try {
                        await EmailService.sendOutForDeliveryNotification({
                            serviceId: emailjsServiceId,
                            templateId: outForDeliveryTemplateId,
                            publicKey: emailjsPublicKey,
                            privateKey: emailjsPrivateKey,
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
                                "Fulfillment": {
                                    status: {
                                        name: "Out for delivery",
                                    },
                                },
                            },
                        });

                        logger.info(`✅ Out for delivery notification sent for order ${orderId}`);
                    } catch (error) {
                        logger.error(`Failed to send out for delivery notification for ${orderId}:`, error);
                    }
                }

                // Check if we need to send "Delivered" notification based on EasyPost status or Notion fulfillment status
                if ((easyPostStatus === "delivered" || fulfillmentStatus === "Delivered") && !deliveredEmailSent && deliveredTemplateId) {
                    logger.info(`Sending delivered notification for order ${orderId} (EasyPost status: ${easyPostStatus})`);

                    try {
                        await EmailService.sendDeliveredNotification({
                            serviceId: emailjsServiceId,
                            templateId: deliveredTemplateId,
                            publicKey: emailjsPublicKey,
                            privateKey: emailjsPrivateKey,
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
                                "Fulfillment": {
                                    status: {
                                        name: "Delivered",
                                    },
                                },
                            },
                        });

                        logger.info(`✅ Delivered notification sent and Notion updated for order ${orderId}`);
                    } catch (error) {
                        logger.error(`Failed to send delivered notification for ${orderId}:`, error);
                    }
                }
            }

            logger.info("Order status check completed");
        } catch (error) {
            logger.error("Error checking order status updates:", error);
        }
    }
}
