import { NextFunction, Request, Response, Router } from "express";
import { AuditLog } from "./audit_log";
import { currentStaff, requirePermission } from "./admin_auth";
import { isPrintNodeConfigured, listPrinters, PrintNodeError } from "../integrations/printnode/printnode_client";
import {
  combinedPdf, getPrintSettings, orderTargets, PrintError, printOrdersBatch, printTestPage, savePrintSettings, unhandledOrders,
} from "../orders/printing";

type Handler = (req: Request, res: Response) => Promise<void>;
const route = (handler: Handler) => (req: Request, res: Response, next: NextFunction) =>
  handler(req, res).catch(next);

const fail = (res: Response, status: number, error: string) => {
  res.status(status).json({ error });
};

/** Settings → Printing: the PrintNode printer and the auto-print switch. */
export const printingRouter = Router();

// Order pages read this to know whether "Send to Rollo" can work.
printingRouter.get("/", requirePermission("orders.read"), route(async (_req, res) => {
  res.json({ settings: await getPrintSettings(), configured: isPrintNodeConfigured() });
}));

printingRouter.get("/printers", requirePermission("settings.edit"), route(async (_req, res) => {
  try {
    res.json({ printers: await listPrinters() });
  } catch (error) {
    if (error instanceof PrintNodeError) return fail(res, error.status === 503 ? 503 : 502, error.message);
    throw error;
  }
}));

printingRouter.put("/", requirePermission("settings.edit"), route(async (req, res) => {
  const autoPrint = req.body?.autoPrint === true;
  const rawId = req.body?.printerId;
  const printerId = rawId === null || rawId === undefined || rawId === "" ? null : Number(rawId);
  if (printerId !== null && !(Number.isInteger(printerId) && printerId > 0)) return fail(res, 400, "Choose a printer.");
  if (autoPrint && printerId === null) return fail(res, 400, "Choose a printer before turning on auto-print.");
  const printerName = printerId !== null && typeof req.body?.printerName === "string" ? req.body.printerName.slice(0, 200) : null;
  const staff = currentStaff(res);
  const before = await getPrintSettings();
  const settings = await savePrintSettings({ autoPrint, printerId, printerName }, staff);
  await AuditLog.record(staff, {
    action: "settings.printing",
    target: { type: "settings", id: "printing" },
    before: { autoPrint: before.autoPrint, printerId: before.printerId, printerName: before.printerName },
    after: { autoPrint, printerId, printerName },
  });
  res.json({ settings, configured: isPrintNodeConfigured() });
}));

printingRouter.post("/test", requirePermission("settings.edit"), route(async (req, res) => {
  const printerId = Number(req.body?.printerId) || (await getPrintSettings()).printerId;
  if (!printerId) return fail(res, 400, "Choose a printer.");
  try {
    const jobId = await printTestPage(printerId);
    res.json({ jobId });
  } catch (error) {
    if (error instanceof PrintError) return fail(res, error.status, error.message);
    throw error;
  }
}));

// The Orders page's "Print labels": paid orders still marked Pending, with what each would print.
printingRouter.get("/queue", requirePermission("orders.fulfill"), route(async (_req, res) => {
  const orders = await unhandledOrders();
  res.json({
    orders: orders.map((order) => {
      const { targets, missing } = orderTargets(order);
      return {
        id: order.id,
        customerName: order.customerName,
        createdAt: order.createdAt,
        isLocalPickup: order.isLocalPickup,
        documents: targets,
        missing,
        printing: order.printing ?? null,
      };
    }),
  });
}));

// Prints the chosen orders' receipts and labels in the order given. Body: { orderIds: [...] }.
printingRouter.post("/batch", requirePermission("orders.fulfill"), route(async (req, res) => {
  const ids: string[] = Array.isArray(req.body?.orderIds)
    ? req.body.orderIds.filter((id: unknown) => typeof id === "string" && /^[\w-]{1,40}$/.test(id))
    : [];
  const orderIds = [...new Set(ids)];
  if (!orderIds.length) return fail(res, 400, "Choose at least one order.");
  if (orderIds.length > 50) return fail(res, 400, "Print up to 50 orders at a time.");
  const staff = currentStaff(res);
  try {
    const results = await printOrdersBatch(orderIds, staff);
    await AuditLog.record(staff, {
      action: "order.print_batch",
      target: { type: "orders", id: orderIds.join(",").slice(0, 500) },
      after: results,
    });
    res.json({ results });
  } catch (error) {
    if (error instanceof PrintError) return fail(res, error.status, error.message);
    throw error;
  }
}));

// Printing from the browser (no PrintNode): one 4x6 PDF of the chosen orders' receipts and labels,
// in the order given. Body: { orderIds: [...] }. Orders left out are listed in the X-Print-Problems header.
printingRouter.post("/pdf", requirePermission("orders.fulfill"), route(async (req, res) => {
  const ids: string[] = Array.isArray(req.body?.orderIds)
    ? req.body.orderIds.filter((id: unknown) => typeof id === "string" && /^[\w-]{1,40}$/.test(id))
    : [];
  const orderIds = [...new Set(ids)];
  if (!orderIds.length) return fail(res, 400, "Choose at least one order.");
  if (orderIds.length > 30) return fail(res, 400, "Print up to 30 orders at a time.");
  const staff = currentStaff(res);
  const { pdf, results } = await combinedPdf(orderIds, staff);
  await AuditLog.record(staff, {
    action: "order.print_pdf",
    target: { type: "orders", id: orderIds.join(",").slice(0, 500) },
    after: results,
  });
  const problems = results.filter((result) => result.status !== "sent" || result.missing.length > 0);
  if (!results.some((result) => result.status === "sent")) {
    return fail(res, 422, problems.map((p) => `#${p.orderId}: ${p.error}`).join(" ") || "Nothing to print.");
  }
  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": "inline; filename=\"Labels.pdf\"",
    "Cache-Control": "private, no-store",
    "X-Print-Problems": encodeURIComponent(JSON.stringify(problems)).slice(0, 6000),
  });
  res.send(pdf);
}));
