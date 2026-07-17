import { Client } from "@notionhq/client";
import { Request, Response } from "express";
import { createLogger } from "../logger";

import { getShipmentStatus } from "./easypost_service";
const logger = createLogger("notion");

// Service name to display name mapping
const SERVICE_DISPLAY_NAMES: Record<string, string> = {
    // USPS
    'GroundAdvantage': 'Ground Advantage',
    'Priority': 'Priority Mail',
    'Express': 'Priority Mail Express',
    // UPS
    'Ground': 'Ground',
    '2ndDayAir': '2nd Day Air',
    'NextDayAir': 'Next Day Air',
    'NextDayAirSaver': 'Next Day Air Saver',
    'NextDayAirEarlyAM': 'Next Day Air Early AM',
    '3DaySelect': '3 Day Select',
    'UPSGroundsaverGreaterThan1lb': 'Ground Saver',
    // FedEx
    'FEDEX_GROUND': 'FedEx Ground',
    'FEDEX_2_DAY': 'FedEx 2 Day',
    'FEDEX_2_DAY_AM': 'FedEx 2 Day AM',
    'FIRST_OVERNIGHT': 'FedEx First Overnight',
    'PRIORITY_OVERNIGHT': 'FedEx Priority Overnight',
    'STANDARD_OVERNIGHT': 'FedEx Standard Overnight',
    'SMART_POST': 'FedEx Smart Post',
    'FEDEX_EXPRESS_SAVER': 'FedEx Express Saver',
};

// Carrier name mapping
const CARRIER_DISPLAY_NAMES: Record<string, string> = {
    'USPS': 'USPS',
    'UPSDAP': 'UPS',
    'FedExDefault': 'FedEx',
};

const getServiceDisplayName = (service: string): string => {
    return SERVICE_DISPLAY_NAMES[service] || "Standard";
};

const getCarrierDisplayName = (carrier: string): string => {
    return CARRIER_DISPLAY_NAMES[carrier] || carrier;
};

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

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface InventoryCache {
    items: any[];
    lastSyncedAt: number;
}

export class NotionService {
    static async fetchInventoryFromNotion(): Promise<InventoryCache> {
        const databaseId = process.env.NOTION_INVENTORY_DATABASE_ID;
        if (!databaseId) {
            throw new Error("Notion inventory database ID not configured");
        }

        const notion = getNotion();

        const response = await notion.databases.query({
            database_id: databaseId,
            sorts: [
                {
                    property: "Index",
                    direction: "ascending",
                },
                {
                    property: "Created At",
                    direction: "descending",
                },
            ],
        });

        // Separate parent items and variants
        const parentItems = new Map<string, any>();
        const variants = new Map<string, any[]>();

        response.results.forEach((page: any) => {
            if (!("properties" in page)) return;

            const properties = page.properties;
            const isVariant = properties["Is Variant"]?.checkbox || false;
            const parentSKU =
                properties["Parent SKU"]?.rich_text?.[0]?.plain_text || "";
            const sku = properties["SKU"]?.rich_text?.[0]?.plain_text || "";

            if (isVariant && parentSKU) {
                if (!variants.has(parentSKU)) {
                    variants.set(parentSKU, []);
                }
                variants.get(parentSKU)!.push(properties);
            } else if (!isVariant) {
                // Only include parent items that are active
                const isActive = properties["Active"]?.checkbox !== false;
                if (sku && isActive) {
                    parentItems.set(sku, properties);
                }
            }
        });

        const items = Array.from(parentItems.entries()).map(([sku, properties]) => {
            const name = properties["Name"]?.title?.[0]?.plain_text || "";
            const description = properties["Description"]?.rich_text?.[0]?.plain_text || "";
            const price = properties["Price"]?.number || 0;
            const itemType = properties["Item Type"]?.select?.name || "";
            // Quantity is always a formula that returns a number
            const quantity = properties["Quantity"]?.formula?.number ?? 1;
            const createdAt = properties["Created At"]?.date?.start || new Date().toISOString();

            const firebaseImageUrlsArray = properties["Firebase Image URLs"]?.rich_text || [];
            const firebaseImageUrls = firebaseImageUrlsArray
                .map((text: any) => text.plain_text)
                .join("");
            let images: string[] = [];

            if (firebaseImageUrls) {
                images = firebaseImageUrls
                    .split(/[,\n]/)
                    .map((url: string) => url.trim())
                    .filter((url: string) => url && (url.startsWith("http://") || url.startsWith("https://")));
            }

            if (images.length === 0) {
                images = ["/assets/images/shop_placeholder.png"];
            }

            const weights = properties["Weights"]?.multi_select?.map((w: any) => w.name) || [];
            const roastLevel = properties["Roast Level"]?.select?.name || "";
            const origin = properties["Origin"]?.rich_text?.[0]?.plain_text || "";
            const tastingNotes = properties["Tasting Notes"]?.multi_select?.map((n: any) => n.name) || [];
            const sizes = properties["Sizes"]?.multi_select?.map((s: any) => s.name) || [];
            const colors = properties["Colors"]?.multi_select?.map((c: any) => c.name) || [];
            const ltoEndDate = properties["LTO End Date"]?.date?.start || null;
            const ltoUnlimitedPurchases = properties["LTO Unlimited Purchases"]?.checkbox || false;

            const itemVariants = variants.get(sku);
            let variantInventory = null;

            if (itemVariants && itemVariants.length > 0) {
                logger.info(`📦 Variants for ${name} (${sku})`, {
                    totalVariants: itemVariants.length,
                    variants: itemVariants.map((v: any) => ({
                        sku: v["SKU"]?.rich_text?.[0]?.plain_text,
                        weight: v["Variant Weight"]?.select?.name,
                        active: v["Active"]?.checkbox
                    }))
                });

                variantInventory = itemVariants
                    .filter((variantProps: any) => {
                        const active = variantProps["Active"]?.checkbox !== false;
                        const variantSku = variantProps["SKU"]?.rich_text?.[0]?.plain_text || "";
                        const variantWeight = variantProps["Variant Weight"]?.select?.name || "";
                        logger.info(`🔍 Filtering variant ${variantSku} (${variantWeight}): Active=${variantProps["Active"]?.checkbox}, keep=${active}`);
                        return active;
                    })
                    .map((variantProps: any) => {
                        // Quantity is always a formula that returns a number
                        const quantity = variantProps["Quantity"]?.formula?.number || 0;
                        const variantSku = variantProps["SKU"]?.rich_text?.[0]?.plain_text || "";
                        const ltoEndDate = variantProps["LTO End Date"]?.date?.start || null;
                        const ltoUnlimitedPurchases = variantProps["LTO Unlimited Purchases"]?.checkbox || false;

                        return {
                            sku: variantSku,
                            size: variantProps["Variant Size"]?.select?.name || "",
                            color: variantProps["Variant Color"]?.select?.name || "",
                            weight: variantProps["Variant Weight"]?.select?.name || "",
                            quantity: quantity,
                            price: variantProps["Price"]?.number || 0,
                            isSoldOut: quantity <= 0,
                            active: variantProps["Active"]?.checkbox !== false,
                            ltoEndDate,
                            ltoUnlimitedPurchases,
                        };
                    });

                logger.info(`✅ Filtered variants for ${name}: ${variantInventory?.length || 0} active variants`);
            }

            return {
                sku,
                name,
                description,
                price,
                firebaseImageUrls: images,
                itemType,
                createdAt,
                quantity,
                weights,
                roastLevel,
                origin,
                tastingNotes,
                sizes,
                colors,
                variants: variantInventory,
                ltoEndDate,
                ltoUnlimitedPurchases,
            };
        }).filter((item: any) => item !== null);

        return { items, lastSyncedAt: Date.now() };
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */

    static async createNotionOrder(req: Request, res: Response): Promise<void> {
        try {
            const {
                customerName,
                customerEmail,
                customerPhone,
                orderId,
                items,
                totalAmount,
                orderDate,
                transactionId,
                shippingAddress,
                shipmentData,
                isLocalPickup,
            } = req.body;

            logger.info("Creating Notion order", { orderId, hasShipmentData: !!shipmentData, shippingAddress });


            const databaseId = process.env.NOTION_ONLINE_ORDERS_DATABASE_ID;
            if (!databaseId) {
                logger.error("Notion database ID not configured");
                res.status(500).json({ error: "Notion database ID not configured" });
                return;
            }

            const itemsOrdered = items
                .map((item: any) => {
                    const itemName = item.selections?.variations || item.variations ?
                        `${item.name} (${item.selections?.variations || item.variations})` :
                        item.name;
                    return `${item.quantity}x ${itemName}`;
                })
                .join("\n");


            const itemsOrderedFormatted = items
                .map((item: any) => {
                    const itemName = item.selections?.variations || item.variations ?
                        `${item.name} (${item.selections?.variations || item.variations})` :
                        item.name;
                    return `${itemName},${item.sku},${item.quantity}`;
                })
                .join("\n");


            const notion = getNotion();
            const response = await notion.pages.create({
                parent: {
                    database_id: databaseId,
                },
                properties: {
                    "Customer": {
                        title: [
                            {
                                text: {
                                    content: customerName,
                                },
                            },
                        ],
                    },
                    "Order #": {
                        rich_text: [
                            {
                                text: {
                                    content: orderId,
                                },
                            },
                        ],
                    },
                    "Status": {
                        status: {
                            name: "Paid",
                        },
                    },
                    "Fulfillment": {
                        status: {
                            name: "Pending",
                        },
                    },
                    "Local Pickup": {
                        checkbox: isLocalPickup || false,
                    },
                    "Items ordered": {
                        rich_text: [
                            {
                                text: {
                                    content: itemsOrdered,
                                },
                            },
                        ],
                    },
                    "Items ordered formatted": {
                        rich_text: [
                            {
                                text: {
                                    content: itemsOrderedFormatted,
                                },
                            },
                        ],
                    },
                    "Email": {
                        email: customerEmail,
                    },
                    "Phone": {
                        phone_number: customerPhone || null,
                    },
                    "Shipping address": {
                        rich_text: [
                            {
                                text: {
                                    content: shippingAddress || "N/A",
                                },
                            },
                        ],
                    },
                    "Transaction ID": {
                        rich_text: [
                            {
                                text: {
                                    content: transactionId,
                                },
                            },
                        ],
                    },
                    "Receipt": {
                        url: `https://dashboard.stripe.com/payments/${transactionId}`,
                    },
                    "Total": {
                        number: totalAmount,
                    },
                    "Order created": {
                        date: {
                            start: new Date(orderDate).toISOString(),
                        },
                    },
                },
            });

            // Add shipment tracking data if available
            if (shipmentData && shipmentData.trackingNumber) {
                logger.info("Adding shipment tracking data to Notion order", {
                    orderId,
                    trackingNumber: shipmentData.trackingNumber,
                    shipmentId: shipmentData.shipmentId,
                    carrier: shipmentData.carrier,
                    service: shipmentData.service,
                    mappedCarrier: getCarrierDisplayName(shipmentData.carrier),
                    mappedService: getServiceDisplayName(shipmentData.service)
                });

                await notion.pages.update({
                    page_id: response.id,
                    properties: {
                        "Tracking Info": {
                            rich_text: [
                                {
                                    text: {
                                        content: shipmentData.trackingNumber,
                                    },
                                },
                            ],
                        },
                        "Shipment ID": {
                            rich_text: [
                                {
                                    text: {
                                        content: shipmentData.shipmentId,
                                    },
                                },
                            ],
                        },
                        "Tracking Carrier": {
                            select: {
                                name: getCarrierDisplayName(shipmentData.carrier) || "Unknown",
                            },
                        },
                        "Carrier Type": {
                            select: {
                                name: getServiceDisplayName(shipmentData.service) || "Standard",
                            },
                        },
                        "Tracking Label": {
                            url: shipmentData.labelUrl || null,
                        },
                    },
                });

                logger.info("Shipment tracking data added successfully", {
                    orderId,
                    pageId: response.id,
                });
            }

            logger.info("Notion order created successfully", {
                orderId,
                pageId: response.id,
            });

            res.json({ success: true, pageId: response.id });
        } catch (error: unknown) {
            logger.error("Error creating Notion order", {
                error: (error as Error).message,
            });
            res.status(500).json({ error: (error as Error).message });
        }
    }

    static async handleTestOrderStatus(req: Request, res: Response): Promise<void> {
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
                res.status(500).json({ error: "NOTION_ONLINE_ORDERS_DATABASE_ID not configured" });
                return;
            }

            if (!emailjsServiceId || !emailjsPublicKey || !emailjsPrivateKey) {
                res.status(500).json({ error: "EmailJS configuration missing" });
                return;
            }

            const notion = getNotion();

            // Query all orders (filter in code to catch old deliveries)
            const response = await notion.databases.query({
                database_id: databaseId,
            });

            logger.info(`Found ${response.results.length} recently updated orders`);

            const results = {
                ordersChecked: response.results.length,
                emailsSent: 0,
                errors: [] as string[],
            };

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
                const customerName = getFirstName(customerFullName);
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
                    results.errors.push(`Order ${orderId}: No email address`);
                    continue;
                }

                // Parse items for HTML rendering
                const itemsHtml: string = parseItemsToHtml(itemsOrdered);

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
                        await sendShippedNotification({
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
                        results.emailsSent++;
                    } catch (error) {
                        const errorMsg = `Failed to send shipped notification for ${orderId}: ${(error as Error).message}`;
                        logger.error(errorMsg);
                        results.errors.push(errorMsg);
                    }
                }

                // Check if we need to send "Out For Delivery" notification based on EasyPost status or Notion fulfillment status
                if ((easyPostStatus === "out_for_delivery" || fulfillmentStatus === "Out for delivery") && !outForDeliveryEmailSent && outForDeliveryTemplateId) {
                    logger.info(`Sending out for delivery notification for order ${orderId} (EasyPost status: ${easyPostStatus})`);

                    try {
                        await sendOutForDeliveryNotification({
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
                        results.emailsSent++;
                    } catch (error) {
                        const errorMsg = `Failed to send out for delivery notification for ${orderId}: ${(error as Error).message}`;
                        logger.error(errorMsg);
                        results.errors.push(errorMsg);
                    }
                }

                // Check if we need to send "Delivered" notification based on EasyPost status or Notion fulfillment status
                if ((easyPostStatus === "delivered" || fulfillmentStatus === "Delivered") && !deliveredEmailSent && deliveredTemplateId) {
                    logger.info(`Sending delivered notification for order ${orderId} (EasyPost status: ${easyPostStatus})`);

                    try {
                        await sendDeliveredNotification({
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
                        results.emailsSent++;
                    } catch (error) {
                        const errorMsg = `Failed to send delivered notification for ${orderId}: ${(error as Error).message}`;
                        logger.error(errorMsg);
                        results.errors.push(errorMsg);
                    }
                }
            }

            logger.info("Order status check completed");
            res.json({
                success: true,
                message: "Order status check completed",
                results,
            });
        } catch (error) {
            logger.error("Error in manual test trigger:", error);
            res.status(500).json({
                success: false,
                error: (error as Error).message,
            });
        }
    }

    static async handleScheduledOrderStatus(event?: any): Promise<void> {
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
                const customerName = getFirstName(customerFullName);
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
                const itemsHtml: string = parseItemsToHtml(itemsOrdered);

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
                        await sendShippedNotification({
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
                        await sendOutForDeliveryNotification({
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
                        await sendDeliveredNotification({
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

// Helper function to extract first name from full name
function getFirstName(fullName: string): string {
    if (!fullName) return "Customer";
    const trimmed = fullName.trim();
    const firstSpace = trimmed.indexOf(" ");
    return firstSpace > 0 ? trimmed.substring(0, firstSpace) : trimmed;
}

// Helper function to parse items text into HTML for email templates
function parseItemsToHtml(itemsText: string): string {
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

// Helper function to send shipped notification
async function sendShippedNotification(params: {
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
    let trackingUrl = "https://tools.usps.com/go/TrackConfirmAction";
    if (trackingCarrier === "UPS") {
        trackingUrl = "https://www.ups.com/track";
    } else if (trackingCarrier === "Fedex") {
        trackingUrl = "https://www.fedex.com/fedextrack/";
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

// Helper function to send delivered notification
async function sendDeliveredNotification(params: {
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

async function sendOutForDeliveryNotification(params: {
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
    let trackingUrl = "https://tools.usps.com/go/TrackConfirmAction";
    if (trackingCarrier === "UPS") {
        trackingUrl = "https://www.ups.com/track";
    } else if (trackingCarrier === "Fedex") {
        trackingUrl = "https://www.fedex.com/fedextrack/";
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
