import { NextFunction, Request, Response, Router } from "express";
import { AuditLog } from "./audit_log";
import { currentStaff, requirePermission } from "./admin_auth";
import {
  FULFILLMENT_STATUSES,
  isFulfillmentStatus,
  NOTION_FULFILLMENT,
  PAYMENT_STATUSES,
  PaymentStatus,
} from "../orders/order_model";
import { OrderRepository } from "../orders/order_repository";
import { syncNotionOrders } from "../orders/notion_order_sync";
import { OrderStore } from "../orders/order_store";
import { EmailService } from "../services/email_service";

type Handler = (req: Request, res: Response) => Promise<void>;
const route = (handler: Handler) => (req: Request, res: Response, next: NextFunction) =>
  handler(req, res).catch(next);

const fail = (res: Response, status: number, error: string) => {
  res.status(status).json({ error });
};

export const ordersRouter = Router();

ordersRouter.get("/", requirePermission("orders.read"), route(async (req, res) => {
  const fulfillment = req.query.fulfillment;
  const payment = req.query.payment;
  const result = await OrderRepository.list({
    fulfillment: isFulfillmentStatus(fulfillment) ? fulfillment : undefined,
    payment: (PAYMENT_STATUSES as readonly unknown[]).includes(payment) ? payment as PaymentStatus : undefined,
    query: typeof req.query.q === "string" ? req.query.q.slice(0, 120) : undefined,
    limit: Math.min(Math.max(Number(req.query.limit) || 50, 1), 100),
    after: typeof req.query.after === "string" ? req.query.after : undefined,
  });
  res.json(result);
}));

ordersRouter.get("/counts", requirePermission("orders.read"), route(async (_req, res) => {
  res.json({ counts: await OrderRepository.countsByFulfillment() });
}));

ordersRouter.get("/statuses", requirePermission("orders.read"), route(async (_req, res) => {
  res.json({
    fulfillment: FULFILLMENT_STATUSES.map((id) => ({ id, label: NOTION_FULFILLMENT[id] })),
  });
}));

// Imports Notion-only orders now instead of waiting for the scheduled sync.
// `full: true` re-reads every Notion order (the first import uses this).
// `reconcile: true` (Owner, once, at cutover) also copies Notion's latest
// status, tracking and email flags onto existing orders.
ordersRouter.post("/sync", requirePermission("settings.edit"), route(async (req, res) => {
  const full = req.body?.full === true;
  const reconcile = req.body?.reconcile === true;
  if (reconcile && currentStaff(res).role !== "owner") return fail(res, 403, "Only an Owner can reconcile from Notion.");
  const result = await syncNotionOrders({ full, reconcile });
  if (full || reconcile) {
    await AuditLog.record(currentStaff(res), {
      action: reconcile ? "orders.reconcile_from_notion" : "orders.import_from_notion",
      target: { type: "orders", id: "notion" },
      after: result,
    });
  }
  res.json(result);
}));

ordersRouter.get("/:id", requirePermission("orders.read"), route(async (req, res) => {
  const order = await OrderRepository.get(req.params.id);
  if (!order) return fail(res, 404, "No order with that number.");
  res.json({ order, events: await OrderRepository.events(order.id) });
}));

ordersRouter.patch("/:id/fulfillment", requirePermission("orders.fulfill"), route(async (req, res) => {
  const status = req.body?.status;
  if (!isFulfillmentStatus(status)) return fail(res, 400, "Choose a fulfillment status.");
  const order = await OrderRepository.get(req.params.id);
  if (!order) return fail(res, 404, "No order with that number.");
  if (order.fulfillmentStatus === status) {
    res.json({ order, events: await OrderRepository.events(order.id) });
    return;
  }

  // Firestore is the record; the status-email job reads it and emails the
  // customer within a few minutes. Notion gets a best-effort copy.
  const staff = currentStaff(res);
  await OrderRepository.update(order.id, { fulfillmentStatus: status });
  await OrderStore.copyToNotion(order, { Fulfillment: { status: { name: NOTION_FULFILLMENT[status] } } });
  await OrderRepository.addEvent(order.id, {
    type: "fulfillment",
    actor: { email: staff.email, name: staff.name },
    message: `Marked ${NOTION_FULFILLMENT[status]}`,
    data: { from: order.fulfillmentStatus, to: status },
  });
  // Send the customer's email for the new status now rather than at the next
  // hourly run. A failure here is retried by that run.
  const changed = await OrderRepository.get(order.id);
  if (changed) {
    await EmailService.sendDueStatusEmails(changed).catch(() => undefined);
  }
  await AuditLog.record(staff, {
    action: "order.fulfillment",
    target: { type: "order", id: order.id },
    before: { fulfillmentStatus: order.fulfillmentStatus },
    after: { fulfillmentStatus: status },
  });
  const updated = await OrderRepository.get(order.id);
  res.json({ order: updated, events: await OrderRepository.events(order.id) });
}));

ordersRouter.post("/:id/notes", requirePermission("orders.edit"), route(async (req, res) => {
  const message = String(req.body?.message || "").trim();
  if (!message) return fail(res, 400, "Write a note first.");
  if (message.length > 4000) return fail(res, 400, "Keep notes under 4,000 characters.");
  const order = await OrderRepository.get(req.params.id);
  if (!order) return fail(res, 404, "No order with that number.");
  const staff = currentStaff(res);
  const event = await OrderRepository.addEvent(order.id, {
    type: "note",
    actor: { email: staff.email, name: staff.name },
    message,
  });
  await AuditLog.record(staff, { action: "order.note", target: { type: "order", id: order.id }, after: { message } });
  res.status(201).json({ event });
}));
