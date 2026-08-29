import { Client } from "@notionhq/client";
import { Request, Response } from "express";
import { createLogger } from "../logger";

import { getShipmentStatus } from "./easypost_service";
import { nextUpcomingRoastSessionDate } from "./account_service";
import { generateReceiptImage, receiptFilename, uploadReceiptToNotion } from "./pictify_service";
const logger = createLogger("notion");

const getNextRoastDateForInventory = async (): Promise<string | null> => {
    try {
        return await nextUpcomingRoastSessionDate();
    } catch (error: unknown) {
        logger.error("Unable to load the roast calendar; inventory will load without a next roast date", {
            error: (error as Error).message,
        });
        return null;
    }
};

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

// Convert Notion blocks to markdown
const notionBlockToMarkdown = (block: any): string => {
    if (!block || !block.type) return "";

    const blockType = block.type;
    const content = block[blockType];

    switch (blockType) {
        case "paragraph":
            return content.rich_text?.map((text: any) => text.plain_text).join("") || "";
        case "heading_1":
            return `# ${content.rich_text?.map((text: any) => text.plain_text).join("") || ""}`;
        case "heading_2":
            return `## ${content.rich_text?.map((text: any) => text.plain_text).join("") || ""}`;
        case "heading_3":
            return `### ${content.rich_text?.map((text: any) => text.plain_text).join("") || ""}`;
        case "heading_4":
            return `#### ${content.rich_text?.map((text: any) => text.plain_text).join("") || ""}`;
        case "bulleted_list_item":
            return `- ${content.rich_text?.map((text: any) => text.plain_text).join("") || ""}`;
        case "numbered_list_item":
            return `1. ${content.rich_text?.map((text: any) => text.plain_text).join("") || ""}`;
        case "to_do":
            return `- [${content.checked ? "x" : " "}] ${content.rich_text?.map((text: any) => text.plain_text).join("") || ""}`;
        case "quote":
            return `> ${content.rich_text?.map((text: any) => text.plain_text).join("") || ""}`;
        case "code":
            return `\`\`\`${content.language || ""}\n${content.rich_text?.map((text: any) => text.plain_text).join("") || ""}\n\`\`\``;
        case "divider":
            return "---";
        case "image":
            const imageUrl = content.external?.url || content.file?.url || "";
            return imageUrl ? `![Image](${imageUrl})` : "";
        case "callout":
            return `> ${content.rich_text?.map((text: any) => text.plain_text).join("") || ""}`;
        default:
            return content.rich_text?.map((text: any) => text.plain_text).join("") || "";
    }
};

// Fetch all blocks from a Notion page and convert to markdown
const fetchPageContentAsMarkdown = async (pageId: string): Promise<string> => {
    try {
        const notion = getNotion();
        const blocks = [];
        let hasMore = true;
        let nextCursor: string | null | undefined = undefined;

        while (hasMore) {
            const response = await notion.blocks.children.list({
                block_id: pageId,
                start_cursor: nextCursor || undefined,
            });

            blocks.push(...response.results);
            hasMore = response.has_more;
            nextCursor = response.next_cursor;
        }

        return blocks.map(notionBlockToMarkdown).join("\n\n\n");
    } catch (error) {
        logger.error(`Error fetching page content for ${pageId}:`, error);
        return "";
    }
};

// Lazy-initialize Notion client
let notionInstance: Client | null = null;
const getNotion = () => {
    if (!notionInstance) {
        const token = process.env.NOTION_TOKEN;
        if (!token) {
            throw new Error("NOTION_TOKEN is not configured");
        }
        notionInstance = new Client({ auth: token, notionVersion: "2022-06-28" });
    }
    return notionInstance;
};


// Helper function to extract text/number from a Notion property object
const propToString = (prop: any): string => {
    if (!prop) return "";

    switch (prop.type) {
        case "formula": {
            const f = prop.formula;
            if (!f) return "";
            if (f.type === "string") return f.string ?? "";
            if (f.type === "number") return f.number != null ? String(f.number) : "";
            if (f.type === "boolean") return f.boolean != null ? String(f.boolean) : "";
            return "";
        }
        case "rich_text":
            return (prop.rich_text ?? []).map((t: any) => t.plain_text).join("");
        case "title":
            return (prop.title ?? []).map((t: any) => t.plain_text).join("");
        case "number":
            return prop.number != null ? String(prop.number) : "";
        case "select":
            return prop.select?.name ?? "";
        default:
            return "";
    }
};

// Cache for Item Summary pages (prevents duplicate fetches)
const ITEM_SUMMARY_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const itemSummaryCache = new Map<string, { data: any; expiresAt: number }>();

async function loadItemSummaryPage(relatedPageId: string) {
    const cached = itemSummaryCache.get(relatedPageId);
    if (cached && Date.now() < cached.expiresAt) {
        return cached.data;
    }

    const notion = getNotion();
    const page = await notion.pages.retrieve({ page_id: relatedPageId });
    itemSummaryCache.set(relatedPageId, {
        data: page,
        expiresAt: Date.now() + ITEM_SUMMARY_CACHE_TTL_MS,
    });
    return page;
}

async function getItemSummaryData(properties: any, itemType: string) {
    const relatedPageId = properties["Item Summary"]?.relation?.[0]?.id;
    if (!relatedPageId) {
        return {
            itemDetails: "",
            brewingMethods: {
                singleDripper: { dose: "", yield: "", waterTemperature: "", ratio: "", time: "", description: "" },
                batchDripper: { dose: "", yield: "", waterTemperature: "", ratio: "", time: "", description: "" },
                espresso: { dose: "", yield: "", waterTemperature: "", ratio: "", maxPressure: "", time: "", description: "" },
                milkDrink: { dose: "", yield: "", waterTemperature: "", ratio: "", milkRatio: "", maxPressure: "", time: "", description: "" },
            }
        };
    }

    const itemSummaryPage = await loadItemSummaryPage(relatedPageId);
    const p = itemSummaryPage.properties;

    return {
        itemDetails: propToString(p["Item Details"]),
        brewingMethods: {
            singleDripper: {
                dose: propToString(p["SD Dose"]),
                yield: propToString(p["SD Yield"]),
                waterTemperature: propToString(p["SD Water Temperature"]),
                ratio: propToString(p["SD Ratio"]),
                time: propToString(p["SD Time"]),
                description: propToString(p["SD Description"]),
            },
            batchDripper: {
                dose: propToString(p["MB Dose"]),
                yield: propToString(p["MB Yield"]),
                waterTemperature: propToString(p["MB Water Temperature"]),
                ratio: propToString(p["MB Ratio"]),
                time: propToString(p["MB Time"]),
                description: propToString(p["MB Description"]),
            },
            espresso: {
                dose: propToString(p["ESP Dose"]),
                yield: propToString(p["ESP Yield"]),
                waterTemperature: propToString(p["ESP Water Temperature"]),
                ratio: propToString(p["ESP Ratio"]),
                maxPressure: propToString(p["ESP Pressure"]),
                time: propToString(p["ESP Time"]),
                description: propToString(p["ESP Description"]),
            },
            milkDrink: {
                dose: propToString(p["MD Dose"]),
                yield: propToString(p["MD Yield"]),
                waterTemperature: propToString(p["MD Water Temperature"]),
                ratio: propToString(p["MD Ratio"]),
                milkRatio: propToString(p["MD Milk Ratio"]),
                maxPressure: propToString(p["MD Pressure"]),
                time: propToString(p["MD Time"]),
                description: propToString(p["MD Description"]),
            },
        }
    };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface InventoryCache {
    items: any[];
    lastSyncedAt: number;
}

export class NotionService {
    static async getOrderPickupOptions(req: Request, res: Response): Promise<void> {
        try {
            const databaseId = process.env.NOTION_ORDER_PICKUP_DATABASE_ID;
            if (!databaseId) {
                res.status(500).json({ error: "NOTION_ORDER_PICKUP_DATABASE_ID not configured" });
                return;
            }

            const containsCoffee = req.query.containsCoffee === "true";
            let targetDate = new Date().toISOString();
            if (containsCoffee) {
                const roastDate = new Date(await nextUpcomingRoastSessionDate());
                roastDate.setUTCDate(roastDate.getUTCDate() + 2);
                targetDate = roastDate.toISOString();
            }

            const notion = getNotion();
            const response = await notion.databases.query({
                database_id: databaseId,
                page_size: 5,
                filter: {
                    property: "Timeframe",
                    date: { on_or_after: targetDate },
                },
                sorts: [{ property: "Timeframe", direction: "ascending" }],
            });

            const options = response.results.flatMap((page: any) => {
                if (!("properties" in page)) return [];

                const properties = page.properties;
                const timeframe = properties["Timeframe"]?.date;
                const start = timeframe?.start;
                if (!start) return [];

                const nameProperty = properties["Name"];
                const name = nameProperty?.title?.[0]?.plain_text
                    || nameProperty?.rich_text?.[0]?.plain_text
                    || "";
                const address = properties["Address"]?.formula?.string || "";
                const pickupUniqueId = properties["Pickup ID"]?.unique_id;
                const pickupId = pickupUniqueId?.number;
                if (pickupId == null) return [];
                const pickupIdPrefix = pickupUniqueId?.prefix;
                const formattedPickupId = pickupIdPrefix
                    ? `${pickupIdPrefix}-${pickupId}`
                    : String(pickupId);

                return [{
                    id: page.id,
                    name,
                    start,
                    end: timeframe.end || null,
                    address,
                    pickupId: formattedPickupId,
                }];
            });

            res.json({ options });
        } catch (error: unknown) {
            logger.error("Error fetching order pickup options", { error: (error as Error).message });
            res.status(500).json({ error: (error as Error).message });
        }
    }

    static async fetchInventoryFromNotion(forceRefresh: boolean = false): Promise<InventoryCache> {
        const databaseId = process.env.NOTION_INVENTORY_DATABASE_ID;
        if (!databaseId) {
            throw new Error("Notion inventory database ID not configured");
        }

        const notion = getNotion();
        const [response, nextRoastDate] = await Promise.all([
            notion.databases.query({
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
            }),
            getNextRoastDateForInventory(),
        ]);

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

        // Fetch markdown content for items with ItemSummary relations
        const itemsWithMarkdown = await Promise.all(
            Array.from(parentItems.entries()).map(async ([sku, properties]) => {
                const name = properties["Name"]?.title?.[0]?.plain_text || "";
                const price = properties["Price"]?.number || 0;

                // Handle ItemSummary as a relation property
                let itemSummary = "";
                const itemSummaryRelation = properties["Item Summary"]?.relation;
                if (itemSummaryRelation && itemSummaryRelation.length > 0) {
                    const relatedPageId = itemSummaryRelation[0].id;
                    if (relatedPageId) {
                        itemSummary = await fetchPageContentAsMarkdown(relatedPageId);
                    }
                }
                const itemType = properties["Item Type"]?.select?.name || "";
                const quantity = properties["Qty Available"]?.formula?.number ?? 0;
                const isWholesale = properties["Wholesale"]?.checkbox || false;
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
                const shippingWeight = properties["Shipping Weight"]?.number || 0;
                const roastLevel = properties["Roast Level"]?.select?.name || "";
                const origin = properties["Origin"]?.rich_text?.[0]?.plain_text || "";
                const tastingNotes = properties["Tasting Notes"]?.multi_select?.map((n: any) => n.name) || [];
                const sizes = properties["Sizes"]?.multi_select?.map((s: any) => s.name) || [];
                const colors = properties["Colors"]?.multi_select?.map((c: any) => c.name) || [];
                const ltoEndDate = properties["LTO End Date"]?.date?.start || null;
                const ltoUnlimitedPurchases = properties["LTO Unlimited Purchases"]?.checkbox || false;

                // Fetch item details and brewing methods from Item Summary page
                const itemSummaryData = await getItemSummaryData(properties, itemType);
                const itemDetails = itemSummaryData.itemDetails;
                const brewingMethods = itemSummaryData.brewingMethods;

                const itemVariants = variants.get(sku);
                let variantInventory = null;

                if (itemVariants && itemVariants.length > 0) {
                    logger.info(`📦 Variants for ${name} (${sku})`, {
                        totalVariants: itemVariants.length,
                        variants: itemVariants.map((v: any) => ({
                            sku: v["SKU"]?.rich_text?.[0]?.plain_text,
                            weight: v["Variant Weight"]?.select?.name,
                            active: v["Active"]?.checkbox,
                            quantity: v["Qty Available"]?.formula?.number
                        }))
                    });

                    variantInventory = itemVariants
                        .filter((variantProps: any) => {
                            const variantSku = variantProps["SKU"]?.rich_text?.[0]?.plain_text || "";
                            const isWholesale = variantProps["Wholesale"]?.checkbox || variantSku.endsWith("-WS");
                            const active = variantProps["Active"]?.checkbox !== false;
                            const variantWeight = variantProps["Variant Weight"]?.select?.name || "";
                            const keep = active || isWholesale;
                            logger.info(`🔍 Filtering variant ${variantSku} (${variantWeight}): Active=${variantProps["Active"]?.checkbox}, Wholesale=${isWholesale}, keep=${keep}`);
                            return keep;
                        })
                        .map((variantProps: any) => {
                            const quantity = variantProps["Qty Available"]?.formula?.number ?? 0;
                            const variantSku = variantProps["SKU"]?.rich_text?.[0]?.plain_text || "";
                            const isWholesale = variantProps["Wholesale"]?.checkbox || variantSku.endsWith("-WS");
                            const ltoEndDate = variantProps["LTO End Date"]?.date?.start || null;
                            const ltoUnlimitedPurchases = variantProps["LTO Unlimited Purchases"]?.checkbox || false;

                            // Use variant shipping weight from Notion, fallback to parent shipping weight
                            const variantShippingWeight = variantProps["Shipping Weight"]?.number || shippingWeight || 200;

                            return {
                                sku: variantSku,
                                size: variantProps["Variant Size"]?.select?.name || "",
                                color: variantProps["Variant Color"]?.select?.name || "",
                                weight: variantProps["Variant Weight"]?.select?.name || "",
                                shippingWeight: variantShippingWeight,
                                quantity: quantity,
                                price: variantProps["Price"]?.number || 0,
                                isSoldOut: quantity <= 0,
                                active: variantProps["Active"]?.checkbox !== false || isWholesale,
                                ltoEndDate,
                                ltoUnlimitedPurchases,
                                isWholesale,
                            };
                        });

                    logger.info(`✅ Filtered variants for ${name}: ${variantInventory?.length || 0} active variants`);
                }

                return {
                    sku,
                    name,
                    itemSummary,
                    itemDetails,
                    nextRoastDate,
                    price,
                    firebaseImageUrls: images,
                    itemType,
                    createdAt,
                    quantity,
                    isWholesale,
                    weights,
                    shippingWeight,
                    roastLevel,
                    origin,
                    tastingNotes,
                    sizes,
                    colors,
                    variants: variantInventory,
                    ltoEndDate,
                    ltoUnlimitedPurchases,
                    brewingMethods,
                };
            })
        );

        return { items: itemsWithMarkdown, lastSyncedAt: Date.now() };
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
                subtotal,
                shipping,
                tax,
                orderDate,
                transactionId,
                shippingAddress,
                billingAddress,
                shipmentData,
                isLocalPickup,
                orderPickupId,
                shippingBox,
                discountCode,
            } = req.body;

            logger.info("Creating Notion order", { orderId, hasShipmentData: !!shipmentData, shippingAddress, shippingBox });


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
                    return `${itemName},${item.sku},${item.internalQuantity ?? item.quantity}`;
                })
                .join("\n");

            // This is the actual EasyPost label cost, which may differ from the
            // shipping amount charged to the customer (for example, free shipping).
            const shippingPrice = Number.isFinite(shipmentData?.shippingPrice)
                ? shipmentData.shippingPrice
                : null;


            const notion = getNotion();
            logger.info("Generating invoice receipt before creating Notion order", { orderId });
            const receiptImage = await generateReceiptImage({
                customerName,
                customerEmail,
                customerAddress: billingAddress || "N/A",
                orderId,
                items,
                subtotal,
                shipping,
                tax,
                totalAmount,
                orderDate,
                transactionId,
                discountCode,
            });
            const filename = receiptFilename(orderId);
            const receiptUploadId = await uploadReceiptToNotion(filename, receiptImage);

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
                    "Order Pickup ID": {
                        rich_text: [
                            {
                                text: {
                                    content: orderPickupId || "",
                                },
                            },
                        ],
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
                    "Invoice Receipt": {
                        files: [
                            {
                                name: filename,
                                type: "file_upload",
                                file_upload: {
                                    id: receiptUploadId,
                                },
                            },
                        ],
                    },
                    "Total": {
                        number: totalAmount,
                    },
                    "Shipping Price": {
                        number: shippingPrice,
                    },
                    "Order created": {
                        date: {
                            start: orderDate,
                        },
                    },
                    "Discount Code": {
                        rich_text: [
                            {
                                text: {
                                    content: discountCode || "",
                                },
                            },
                        ],
                    },
                } as any,
            });

            // Add shipping box if provided
            if (shippingBox) {
                logger.info("Adding shipping box to Notion order", { orderId, shippingBox });
                await notion.pages.update({
                    page_id: response.id,
                    properties: {
                        "Shipping Box": {
                            rich_text: [
                                {
                                    text: {
                                        content: shippingBox,
                                    },
                                },
                            ],
                        },
                    },
                });
                logger.info("Shipping box added successfully", { orderId });
            } else {
                logger.info("No shipping box provided, skipping", { orderId });
            }

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

    static async handleCheckOrderConfirmedEmailSent(req: Request, res: Response): Promise<void> {
        try {
            const { orderId } = req.query;
            if (!orderId || typeof orderId !== 'string') {
                res.status(400).json({ error: "Order ID is required" });
                return;
            }

            const databaseId = process.env.NOTION_ONLINE_ORDERS_DATABASE_ID;
            if (!databaseId) {
                res.status(500).json({ error: "NOTION_ONLINE_ORDERS_DATABASE_ID not configured" });
                return;
            }

            const notion = getNotion();

            // Query for the order by Order #
            const response = await notion.databases.query({
                database_id: databaseId,
                filter: {
                    property: "Order #",
                    rich_text: {
                        equals: orderId,
                    },
                },
            });

            if (response.results.length === 0) {
                // Order doesn't exist yet, so email hasn't been sent
                res.json({ emailSent: false, orderExists: false });
                return;
            }

            const page = response.results[0];
            if (!("properties" in page)) {
                res.json({ emailSent: false, orderExists: true });
                return;
            }

            const orderConfirmedEmailSentProp = page.properties["Order Confirmed Email Sent"];
            if (orderConfirmedEmailSentProp?.type === "checkbox") {
                res.json({ emailSent: orderConfirmedEmailSentProp.checkbox, orderExists: true });
            } else {
                res.json({ emailSent: false, orderExists: true });
            }
        } catch (error: unknown) {
            logger.error("Error checking order confirmed email status", {
                error: (error as Error).message,
            });
            res.status(500).json({ error: (error as Error).message });
        }
    }

    static async handleMarkOrderConfirmedEmailSent(req: Request, res: Response): Promise<void> {
        try {
            const { orderId } = req.body;
            if (!orderId) {
                res.status(400).json({ error: "Order ID is required" });
                return;
            }

            const databaseId = process.env.NOTION_ONLINE_ORDERS_DATABASE_ID;
            if (!databaseId) {
                res.status(500).json({ error: "NOTION_ONLINE_ORDERS_DATABASE_ID not configured" });
                return;
            }

            const notion = getNotion();

            // Query for the order by Order #
            const response = await notion.databases.query({
                database_id: databaseId,
                filter: {
                    property: "Order #",
                    rich_text: {
                        equals: orderId,
                    },
                },
            });

            if (response.results.length === 0) {
                res.status(404).json({ error: "Order not found" });
                return;
            }

            const page = response.results[0];
            if (!("properties" in page)) {
                res.status(400).json({ error: "Invalid page structure" });
                return;
            }

            // Update the Order Confirmed Email Sent checkbox
            await notion.pages.update({
                page_id: page.id,
                properties: {
                    "Order Confirmed Email Sent": {
                        checkbox: true,
                    },
                },
            });

            logger.info("Order confirmed email marked as sent", { orderId });
            res.json({ success: true });
        } catch (error: unknown) {
            logger.error("Error marking order confirmed email as sent", {
                error: (error as Error).message,
            });
            res.status(500).json({ error: (error as Error).message });
        }
    }

    static async handleUncheckOrderConfirmedEmailSent(req: Request, res: Response): Promise<void> {
        try {
            const { orderId } = req.body;
            if (!orderId) {
                res.status(400).json({ error: "Order ID is required" });
                return;
            }

            const databaseId = process.env.NOTION_ONLINE_ORDERS_DATABASE_ID;
            if (!databaseId) {
                res.status(500).json({ error: "NOTION_ONLINE_ORDERS_DATABASE_ID not configured" });
                return;
            }

            const notion = getNotion();

            // Query for the order by Order #
            const response = await notion.databases.query({
                database_id: databaseId,
                filter: {
                    property: "Order #",
                    rich_text: {
                        equals: orderId,
                    },
                },
            });

            if (response.results.length === 0) {
                res.status(404).json({ error: "Order not found" });
                return;
            }

            const page = response.results[0];
            if (!("properties" in page)) {
                res.status(400).json({ error: "Invalid page structure" });
                return;
            }

            // Update the Order Confirmed Email Sent checkbox to false
            await notion.pages.update({
                page_id: page.id,
                properties: {
                    "Order Confirmed Email Sent": {
                        checkbox: false,
                    },
                },
            });

            logger.info("Order confirmed email unchecked", { orderId });
            res.json({ success: true });
        } catch (error: unknown) {
            logger.error("Error unchecking order confirmed email", {
                error: (error as Error).message,
            });
            res.status(500).json({ error: (error as Error).message });
        }
    }

    static async validateDiscountCode(req: Request, res: Response): Promise<void> {
        try {
            const { code } = req.body;
            if (!code || typeof code !== 'string') {
                res.status(400).json({ error: "Discount code is required" });
                return;
            }

            const databaseId = process.env.NOTION_DISCOUNT_CODES_DATABASE_ID;
            if (!databaseId) {
                res.status(500).json({ error: "NOTION_DISCOUNT_CODES_DATABASE_ID not configured" });
                return;
            }

            const notion = getNotion();

            // Query for the discount code by name (case-insensitive)
            const response = await notion.databases.query({
                database_id: databaseId,
                filter: {
                    property: "Code",
                    rich_text: {
                        equals: code.toUpperCase(),
                    },
                },
            });

            if (response.results.length === 0) {
                res.json({ valid: false, message: "Invalid discount code" });
                return;
            }

            const page = response.results[0];
            if (!("properties" in page)) {
                res.json({ valid: false, message: "Invalid discount code" });
                return;
            }

            const properties = page.properties as any;

            // Check if active
            const isActive = properties["Active"]?.checkbox;
            if (!isActive) {
                res.json({ valid: false, message: "This discount code is no longer active" });
                return;
            }

            // Check expiration date
            const expirationDate = properties["Expiration Date"]?.date?.start;
            if (expirationDate) {
                const expDate = new Date(expirationDate);
                const now = new Date();
                if (now > expDate) {
                    res.json({ valid: false, message: "This discount code has expired" });
                    return;
                }
            }

            // Get percentage off
            const percentOff = properties["% Off"]?.number;
            logger.info("Checking discount percentage", {
                percentOff,
                hasProperty: !!properties["% Off"],
                propertyType: properties["% Off"]?.type
            });

            if (!percentOff || percentOff <= 0) {
                logger.error("Invalid discount percentage", { percentOff, properties: Object.keys(properties) });
                res.json({ valid: false, message: "Invalid discount percentage" });
                return;
            }

            const codeName = properties["Code"]?.rich_text?.[0]?.plain_text || code;

            logger.info("Discount code validated successfully", { code: codeName, percentOff });
            res.json({
                valid: true,
                code: codeName,
                percentOff: percentOff,
                message: `${percentOff}% discount applied!`
            });
        } catch (error: unknown) {
            const errorMessage = (error as Error).message;
            logger.error("Error validating discount code", {
                error: errorMessage,
                stack: (error as Error).stack,
            });

            // Provide user-friendly error message
            let userMessage = "Unable to validate discount code. Please try again later.";
            if (errorMessage.includes("database_id")) {
                userMessage = "Discount code database not found. Please contact support.";
            } else if (errorMessage.includes("unauthorized") || errorMessage.includes("authentication")) {
                userMessage = "Discount code system authentication failed. Please contact support.";
            } else if (errorMessage.includes("property")) {
                userMessage = "Discount code database structure error. Please contact support.";
            }

            res.status(500).json({ valid: false, message: userMessage });
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
                const orderConfirmedEmailSentProp = properties["Order Confirmed Email Sent"];
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
                    orderConfirmedEmailSentProp?.type !== "checkbox" ||
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
