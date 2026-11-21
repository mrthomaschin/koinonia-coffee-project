import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import sharp from "sharp";
import type { StaffMember } from "../admin/staff_repository";
import { getDatabase } from "../integrations/firebase_admin";
import { PrintNodeError, submitPdf } from "../integrations/printnode/printnode_client";
import { createLogger } from "../logger";
import { DocumentNotFound, readDocument } from "./order_documents";
import type { AdminOrder, OrderPrinting } from "./order_model";
import { OrderRepository } from "./order_repository";

/**
 * Printing receipts and shipping labels on the shop's Rollo through PrintNode.
 *
 * Auto-print (when switched on in Settings → Printing): a paid web order prints
 * its receipt, then its label (pickup orders print the receipt only), and a
 * label bought on the order page prints as soon as it's bought. Staff can also
 * send any stored receipt or label to the printer from the order page.
 *
 * Everything prints as a 4x6 PDF, the Rollo's label size. The receipt and the
 * label are both made at 4x6 (2:3), so they fill the page.
 */
const logger = createLogger("printing");

const SETTINGS_DOC = "admin_settings/printing";

export interface PrintSettings {
  autoPrint: boolean;
  printerId: number | null;
  printerName: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

const DEFAULT_SETTINGS: PrintSettings = { autoPrint: false, printerId: null, printerName: null, updatedAt: null, updatedBy: null };

export const getPrintSettings = async (): Promise<PrintSettings> => {
  const snapshot = await getDatabase().doc(SETTINGS_DOC).get();
  return { ...DEFAULT_SETTINGS, ...(snapshot.exists ? snapshot.data() as Partial<PrintSettings> : {}) };
};

export const savePrintSettings = async (
  input: { autoPrint: boolean; printerId: number | null; printerName: string | null },
  staff: StaffMember,
): Promise<PrintSettings> => {
  const settings: PrintSettings = { ...input, updatedAt: new Date().toISOString(), updatedBy: staff.email };
  await getDatabase().doc(SETTINGS_DOC).set(settings);
  return settings;
};

export class PrintError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

// 4x6 inches in PDF points.
const PAGE_WIDTH = 288;
const PAGE_HEIGHT = 432;

/** One 4x6 portrait page with the image centred and scaled to fit. PDFs pass through. */
export const toLabelPdf = async (bytes: Buffer, contentType: string): Promise<Buffer> => {
  if (contentType === "application/pdf") return bytes;
  const meta = await sharp(bytes).metadata();
  let image = sharp(bytes).flatten({ background: "#ffffff" });
  // A landscape label is turned to fit the portrait roll.
  if ((meta.width || 0) > (meta.height || 0)) image = image.rotate(90);
  // The Rollo prints at 203 dpi, so 4x6 is 812x1218 dots: anything finer is thrown away by the
  // printer anyway. Grey PNG at that size keeps barcodes lossless and a page around 100KB, so a
  // 50-order batch PDF stays well under the API's response limit.
  const png = await image
    .resize({ width: 812, height: 1218, fit: "inside", withoutEnlargement: true })
    .grayscale()
    .png({ compressionLevel: 9 })
    .toBuffer();
  const pdf = await PDFDocument.create();
  const embedded = await pdf.embedPng(png);
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const scale = Math.min(PAGE_WIDTH / embedded.width, PAGE_HEIGHT / embedded.height);
  const width = embedded.width * scale;
  const height = embedded.height * scale;
  page.drawImage(embedded, { x: (PAGE_WIDTH - width) / 2, y: (PAGE_HEIGHT - height) / 2, width, height });
  return Buffer.from(await pdf.save());
};

/** "receipt", or "label:<shipment id>". */
export type PrintTarget = string;

const describe = (target: PrintTarget) => (target === "receipt" ? "receipt" : "shipping label");

const recordResult = async (
  orderId: string,
  result: { targets: PrintTarget[]; jobIds: number[]; error: string | null },
  staff: StaffMember | null,
  via: OrderPrinting["via"] = "printnode",
): Promise<OrderPrinting> => {
  const printing: OrderPrinting = {
    via,
    at: new Date().toISOString(),
    status: result.error ? "failed" : "sent",
    documents: result.targets,
    jobIds: result.jobIds,
    by: staff ? staff.email : "auto",
    error: result.error,
  };
  await getDatabase().collection("orders").doc(orderId).update({ printing });
  const what = result.targets.map(describe).join(" and ");
  await OrderRepository.addEvent(orderId, {
    type: "print",
    actor: staff ? { email: staff.email, name: staff.name } : null,
    message: result.error
      ? `Couldn't print the ${what || "documents"}: ${result.error}`
      : via === "browser"
        ? `Opened the ${what} to print from the browser`
        : `${staff ? "Sent" : "Auto-printed"} the ${what} to the printer`,
    data: { documents: result.targets, jobIds: result.jobIds },
  });
  return printing;
};

/**
 * Sends the documents to the printer in order and records the result on the
 * order. Stops at the first failure. `keyPrefix` makes repeats of the same
 * automatic print do nothing; manual prints leave it out so reprints work.
 */
const printDocuments = async (
  orderId: string,
  targets: PrintTarget[],
  printerId: number,
  staff: StaffMember | null,
  keyPrefix?: string,
): Promise<OrderPrinting> => {
  const jobIds: number[] = [];
  let error: string | null = null;
  for (const target of targets) {
    try {
      const labelId = target.startsWith("label:") ? target.slice("label:".length) : undefined;
      const file = await readDocument(orderId, labelId ? "label" : "receipt", labelId);
      const pdf = await toLabelPdf(file.bytes, file.contentType);
      const jobId = await submitPdf({
        printerId,
        title: file.filename.replace(/\.\w+$/, ""),
        pdf,
        ...(keyPrefix ? { idempotencyKey: `${keyPrefix}-${target}` } : {}),
      });
      if (jobId !== null) jobIds.push(jobId);
    } catch (failure) {
      error = failure instanceof DocumentNotFound
        ? `the ${describe(target)} isn't stored for this order`
        : (failure as Error).message;
      logger.error("Print failed", { orderId, target, error });
      break;
    }
  }
  return recordResult(orderId, { targets, jobIds, error }, staff);
};

/** What an order prints: the receipt, then the current label unless it's a pickup. */
export const orderTargets = (order: AdminOrder): { targets: PrintTarget[]; missing: string[] } => {
  const targets: PrintTarget[] = [];
  const missing: string[] = [];
  if (order.documents?.receipt) targets.push("receipt"); else missing.push("receipt");
  if (!order.isLocalPickup) {
    if (order.shipmentId && order.documents?.labels?.[order.shipmentId]) targets.push(`label:${order.shipmentId}`);
    else missing.push("shipping label");
  }
  return { targets, missing };
};

/**
 * Auto-prints a newly paid order if auto-print is on. Never throws: printing
 * must not hold up the customer's emails. True when the jobs were sent.
 */
export const autoPrintOrder = async (orderId: string): Promise<boolean> => {
  try {
    const settings = await getPrintSettings();
    if (!settings.autoPrint || !settings.printerId) return false;
    const order = await OrderRepository.get(orderId);
    if (!order) return false;
    const { targets, missing } = orderTargets(order);
    if (!targets.length) {
      await recordResult(orderId, { targets, jobIds: [], error: `nothing to print (no ${missing.join(" or ")})` }, null);
      return false;
    }
    const result = await printDocuments(orderId, targets, settings.printerId, null, `auto-${orderId}`);
    if (result.status === "sent" && missing.length) {
      // Printed what there was; say what's missing so someone prints it by hand.
      await OrderRepository.addEvent(orderId, {
        type: "print", actor: null, message: `No ${missing.join(" or ")} was stored, so it didn't print`,
      });
    }
    return result.status === "sent";
  } catch (error) {
    logger.error("Auto-print failed", { orderId, error: (error as Error).message });
    return false;
  }
};

/** Auto-prints a label bought on the order page. Never throws. */
export const autoPrintLabel = async (orderId: string, shipmentId: string): Promise<void> => {
  try {
    const settings = await getPrintSettings();
    if (!settings.autoPrint || !settings.printerId) return;
    await printDocuments(orderId, [`label:${shipmentId}`], settings.printerId, null, `auto-${orderId}`);
  } catch (error) {
    logger.error("Auto-print of a bought label failed", { orderId, shipmentId, error: (error as Error).message });
  }
};

/** A staff member sends stored documents to the printer from the order page. */
export const printOrderManually = async (
  order: AdminOrder,
  targets: PrintTarget[],
  staff: StaffMember,
): Promise<OrderPrinting> => {
  const settings = await getPrintSettings();
  if (!settings.printerId) throw new PrintError(400, "Choose a printer in Settings → Printing first.");
  const clean = targets.filter((target, index) =>
    (target === "receipt" || /^label:shp_\w+$/.test(target)) && targets.indexOf(target) === index);
  if (!clean.length) throw new PrintError(400, "Choose what to print.");
  return printDocuments(order.id, clean, settings.printerId, staff);
};

/** Paid orders still marked Pending: what the Orders page's "Print labels" offers. */
export const unhandledOrders = async (): Promise<AdminOrder[]> => {
  const { orders } = await OrderRepository.list({ fulfillment: "pending", limit: 100 });
  return orders
    .filter((order) => order.paymentStatus === "paid" || order.paymentStatus === "partially_refunded")
    // Oldest first, so the labels come out in the order the orders came in.
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
};

export interface BatchResult {
  orderId: string;
  status: "sent" | "failed" | "skipped";
  printed: PrintTarget[];
  missing: string[];
  error: string | null;
}

/**
 * Prints each order's receipt and label, one order after another, so the
 * pairs come out together. An order with nothing stored is skipped; one
 * failure doesn't stop the rest.
 */
export const printOrdersBatch = async (orderIds: string[], staff: StaffMember): Promise<BatchResult[]> => {
  const settings = await getPrintSettings();
  if (!settings.printerId) throw new PrintError(400, "Choose a printer in Settings → Printing first.");
  const results: BatchResult[] = [];
  for (const orderId of orderIds) {
    const order = await OrderRepository.get(orderId);
    if (!order) {
      results.push({ orderId, status: "skipped", printed: [], missing: [], error: "No order with that number." });
      continue;
    }
    const { targets, missing } = orderTargets(order);
    if (!targets.length) {
      results.push({ orderId, status: "skipped", printed: [], missing, error: `No ${missing.join(" or ")} stored.` });
      continue;
    }
    const printing = await printDocuments(order.id, targets, settings.printerId, staff);
    results.push({ orderId: order.id, status: printing.status, printed: targets, missing, error: printing.error });
  }
  return results;
};

/**
 * One PDF of the chosen orders, for printing from the browser without
 * PrintNode: each order's receipt then label, 4x6 pages, in the order given.
 * An order whose files can't be read is left out and reported. Each included
 * order is marked as printed (the browser can't tell us if the dialog was
 * cancelled, so this means "opened to print").
 */
export const combinedPdf = async (
  orderIds: string[],
  staff: StaffMember,
): Promise<{ pdf: Buffer; results: BatchResult[] }> => {
  const out = await PDFDocument.create();
  const results: BatchResult[] = [];
  for (const orderId of orderIds) {
    const order = await OrderRepository.get(orderId);
    if (!order) {
      results.push({ orderId, status: "skipped", printed: [], missing: [], error: "No order with that number." });
      continue;
    }
    const { targets, missing } = orderTargets(order);
    if (!targets.length) {
      results.push({ orderId, status: "skipped", printed: [], missing, error: `No ${missing.join(" or ")} stored.` });
      continue;
    }
    try {
      // Read the whole order first, so a failure never leaves half an order in the PDF.
      const parts: PDFDocument[] = [];
      for (const target of targets) {
        const labelId = target.startsWith("label:") ? target.slice("label:".length) : undefined;
        const file = await readDocument(order.id, labelId ? "label" : "receipt", labelId);
        parts.push(await PDFDocument.load(await toLabelPdf(file.bytes, file.contentType)));
      }
      for (const part of parts) {
        const pages = await out.copyPages(part, part.getPageIndices());
        pages.forEach((page) => out.addPage(page));
      }
      await recordResult(order.id, { targets, jobIds: [], error: null }, staff, "browser");
      results.push({ orderId: order.id, status: "sent", printed: targets, missing, error: null });
    } catch (error) {
      const message = error instanceof DocumentNotFound ? "A stored file is missing." : (error as Error).message;
      logger.error("Couldn't add an order to the print PDF", { orderId: order.id, error: message });
      results.push({ orderId: order.id, status: "failed", printed: [], missing, error: message });
    }
  }
  return { pdf: Buffer.from(await out.save()), results };
};

/** A 4x6 page with a border, to check the printer is set up and aligned. */
export const printTestPage = async (printerId: number): Promise<number | null> => {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawRectangle({ x: 9, y: 9, width: PAGE_WIDTH - 18, height: PAGE_HEIGHT - 18, borderColor: rgb(0, 0, 0), borderWidth: 2 });
  page.drawText("Koinonia Coffee Project", { x: 24, y: PAGE_HEIGHT - 60, size: 16, font: bold });
  page.drawText("Test print", { x: 24, y: PAGE_HEIGHT - 84, size: 13, font: regular });
  const when = new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles", dateStyle: "medium", timeStyle: "short" });
  page.drawText(when, { x: 24, y: PAGE_HEIGHT - 104, size: 11, font: regular });
  page.drawText("The border should sit just inside", { x: 24, y: 60, size: 10, font: regular });
  page.drawText("all four edges of the label.", { x: 24, y: 46, size: 10, font: regular });
  try {
    return await submitPdf({ printerId, title: "Test print", pdf: Buffer.from(await pdf.save()) });
  } catch (error) {
    if (error instanceof PrintNodeError) throw new PrintError(error.status === 503 ? 503 : 502, error.message);
    throw error;
  }
};
