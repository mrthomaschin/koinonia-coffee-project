import { createLogger } from "../logger";

const logger = createLogger("pictify");
const PICTIFY_API_URL = "https://api.pictify.io";
const RECEIPT_WIDTH = Number(process.env.PICTIFY_RECEIPT_WIDTH || 1624);
const RECEIPT_HEIGHT = Number(process.env.PICTIFY_RECEIPT_HEIGHT || 2436);

export interface ReceiptOrderData {
    customerName: string;
    customerEmail: string;
    customerAddress?: string;
    orderId: string;
    items: Array<{
        name: string;
        sku?: string;
        quantity: number;
        price: number;
        variations?: string;
    }>;
    subtotal?: number;
    shipping?: number;
    tax?: number;
    totalAmount: number;
    orderDate: string;
    transactionId: string;
    discountCode?: string;
    notes?: string;
}

const requiredConfig = (name: string): string => {
    const value = process.env[name];
    if (!value) throw new Error(`${name} is not configured`);
    return value;
};

const responseError = async (response: Response): Promise<string> => {
    const body = await response.text();
    try {
        const parsed = JSON.parse(body) as { message?: string; error?: string };
        return parsed.message || parsed.error || body;
    } catch {
        return body;
    }
};

const escapeHtml = (value: string): string => value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatMoney = (value: number): string => `$${value.toFixed(2)}`;

const formatDate = (value: string): string => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-US");
};

/** Upload a generated receipt image to Notion and return its file-upload id. */
export const uploadReceiptToNotion = async (filename: string, image: Buffer): Promise<string> => {
    const token = requiredConfig("NOTION_TOKEN");
    const headers = {
        Authorization: `Bearer ${token}`,
        "Notion-Version": "2022-06-28",
    };
    const createResponse = await fetch("https://api.notion.com/v1/file_uploads", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "single_part", filename, content_type: "image/png" }),
    });
    if (!createResponse.ok) {
        throw new Error(`Notion file upload initialization failed (${createResponse.status}): ${await createResponse.text()}`);
    }
    const upload = await createResponse.json() as { id?: string; upload_url?: string };
    if (!upload.id || !upload.upload_url) throw new Error("Notion did not return a file upload URL");

    const fileBytes = new Uint8Array(image.length);
    image.copy(fileBytes);
    const form = new FormData();
    form.append("file", new Blob([fileBytes], { type: "image/png" }), filename);
    const sendResponse = await fetch(upload.upload_url, { method: "POST", headers, body: form });
    if (!sendResponse.ok) throw new Error(`Notion receipt upload failed (${sendResponse.status}): ${await sendResponse.text()}`);
    return upload.id;
};

/** Render the Pictify image template and return the PNG bytes. */
export const generateReceiptImage = async (order: ReceiptOrderData): Promise<Buffer> => {
    const apiKey = requiredConfig("PICTIFY_API_KEY");
    const templateUid = requiredConfig("PICTIFY_RECEIPT_TEMPLATE_UID");

    const items = order.items.map((item) => ({
        ...item,
        lineTotal: item.price * item.quantity,
    }));
    const subtotal = order.subtotal ?? items.reduce((sum, item) => sum + item.lineTotal, 0);
    const tax = order.tax ?? 0;
    const shipping = order.shipping ?? 0;
    const lineItemsHtml = items.map((item) => {
        const description = item.variations ? `${item.name} (${item.variations})` : item.name;
        return `<tr style="border-bottom: 1px solid #f3f4f6;">` +
            `<td>${escapeHtml(description)}</td>` +
            `<td style="text-align: center;">${item.quantity}</td>` +
            `<td style="text-align: right;">${formatMoney(item.price)}</td>` +
            `<td style="text-align: right;">${formatMoney(item.lineTotal)}</td>` +
            `</tr>`;
    }).join("");

    // This receipt is a FabricJS/image template, so use Pictify's image API.
    const response = await fetch(`${PICTIFY_API_URL}/image`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": `order-receipt-${order.orderId}`,
        },
        body: JSON.stringify({
            template: templateUid,
            format: "png",
            fileExtension: "png",
            width: RECEIPT_WIDTH,
            height: RECEIPT_HEIGHT,
            selector: "body",
            variables: {
                receipt_number: order.orderId,
                order_date: formatDate(order.orderDate),
                payment_date: formatDate(order.orderDate),
                customer_name: order.customerName,
                customer_address: order.customerAddress || "N/A",
                customer_email: order.customerEmail,
                line_items_html: lineItemsHtml,
                subtotal: formatMoney(subtotal),
                tax: formatMoney(tax),
                shipping: formatMoney(shipping),
                total: formatMoney(order.totalAmount),
                notes: order.notes || (order.discountCode ? `Discount code: ${order.discountCode}` : ""),
            },
        }),
    });

    if (!response.ok) {
        throw new Error(`Pictify PDF generation failed (${response.status}): ${await responseError(response)}`);
    }

    const result = await response.json() as { url?: string; userStorageUrl?: string };
    const imageUrl = result.userStorageUrl || result.url;
    if (!imageUrl) throw new Error("Pictify image response did not contain a download URL");

    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
        throw new Error(`Unable to download generated Pictify image (${imageResponse.status})`);
    }

    const image = Buffer.from(await imageResponse.arrayBuffer());
    const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (image.length < pngSignature.length || !image.subarray(0, pngSignature.length).equals(pngSignature)) {
        const contentType = imageResponse.headers.get("content-type") || "unknown";
        const signature = image.subarray(0, 16).toString("hex");
        throw new Error(`Pictify returned an invalid PNG (content-type: ${contentType}, signature: ${signature})`);
    }

    logger.info("Generated receipt PNG", { orderId: order.orderId, bytes: image.length });
    return image;
};
