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
import {
  decideRefund,
  hasStripePayment,
  refundableCents,
  RefundError,
  RefundStore,
  requestRefund,
  STRIPE_REASONS,
} from "../orders/refunds";
import { hasPermission, REFUND_APPROVAL_THRESHOLD_CENTS } from "./permissions";
import { BOXES, buyLabel, getLabelInfo, LabelError, quoteLabel, voidCurrentLabel } from "../orders/labels";
import { fulfillCheckoutOrder, isServerFulfilled } from "../orders/checkout_fulfillment";
import type { AdminOrder } from "../orders/order_model";
import {
  deleteOrder,
  editOrderDetails,
  listDeleted,
  OrderAdminError,
  parseDetailChanges,
  restoreOrder,
} from "../orders/order_admin";
import {
  catalog,
  createManualOrder,
  ManualOrderError,
  parseManualOrder,
  PAYMENT_METHODS,
} from "../orders/manual_orders";

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

// ---- Refunds ----

const refundError = (res: Response, error: unknown): boolean => {
  if (error instanceof RefundError) {
    fail(res, error.status, error.message);
    return true;
  }
  return false;
};

ordersRouter.get("/:id/refunds", requirePermission("orders.read"), route(async (req, res) => {
  const order = await OrderRepository.get(req.params.id);
  if (!order) return fail(res, 404, "No order with that number.");
  const list = await RefundStore.forOrder(order.id);
  let refundable: number | null = null;
  try {
    refundable = await refundableCents(order, list);
  } catch {
    // Stripe unreachable: the page still shows the history.
  }
  res.json({
    refunds: list,
    refundableCents: refundable,
    stripeLinked: hasStripePayment(order),
    approvalThresholdCents: REFUND_APPROVAL_THRESHOLD_CENTS,
  });
}));

ordersRouter.post("/:id/refunds", requirePermission("orders.refund"), route(async (req, res) => {
  const order = await OrderRepository.get(req.params.id);
  if (!order) return fail(res, 404, "No order with that number.");
  const staff = currentStaff(res);
  const reason = (STRIPE_REASONS as readonly string[]).includes(req.body?.reason) ? req.body.reason : "requested_by_customer";
  try {
    const refund = await requestRefund({
      order,
      staff,
      canRefundLarge: hasPermission(staff.role, "orders.refund_large"),
      amountCents: Math.round(Number(req.body?.amountCents)),
      reason,
      note: String(req.body?.note || "").trim().slice(0, 2000),
      manual: req.body?.manual === true,
    });
    await AuditLog.record(staff, {
      action: refund.status === "pending_approval" ? "order.refund_request" : refund.method === "manual" ? "order.refund_record" : "order.refund",
      target: { type: "order", id: order.id },
      after: refund,
    });
    res.status(201).json({ refund });
  } catch (error) {
    if (!refundError(res, error)) throw error;
  }
}));

export const refundsRouter = Router();

refundsRouter.get("/pending", requirePermission("orders.refund_large"), route(async (_req, res) => {
  const pending = await RefundStore.pendingApproval();
  const orders = await Promise.all(pending.map((refund) => OrderRepository.get(refund.orderId)));
  res.json({
    requests: pending.map((refund, index) => ({
      refund,
      order: orders[index] && {
        id: orders[index]!.id,
        customerName: orders[index]!.customerName,
        totalAmount: orders[index]!.totalAmount,
      },
    })),
  });
}));

refundsRouter.post("/:id/decision", requirePermission("orders.refund_large"), route(async (req, res) => {
  const refund = await RefundStore.get(req.params.id);
  if (!refund) return fail(res, 404, "No such refund request.");
  const staff = currentStaff(res);
  try {
    const decided = await decideRefund({ refund, staff, approve: req.body?.approve === true });
    await AuditLog.record(staff, {
      action: req.body?.approve === true ? "order.refund_approve" : "order.refund_decline",
      target: { type: "order", id: refund.orderId },
      before: refund,
      after: decided,
    });
    res.json({ refund: decided });
  } catch (error) {
    if (!refundError(res, error)) throw error;
  }
}));

// ---- Shipping labels ----

const labelError = (res: Response, error: unknown): boolean => {
  if (error instanceof LabelError) {
    fail(res, error.status, error.message);
    return true;
  }
  return false;
};

ordersRouter.get("/:id/label", requirePermission("orders.read"), route(async (req, res) => {
  const order = await OrderRepository.get(req.params.id);
  if (!order) return fail(res, 404, "No order with that number.");
  let info = null;
  try {
    info = await getLabelInfo(order);
  } catch {
    // EasyPost unreachable or the shipment is gone: the form still works.
  }
  // Web checkout orders record their server steps; a stuck one can be retried.
  const extra = order as AdminOrder & { source?: string; fulfillment?: { lastError?: string } };
  const lastError = isServerFulfilled(extra as { source?: string; serverFulfilled?: boolean }) || extra.source === "web-checkout"
    ? extra.fulfillment?.lastError || null
    : null;
  res.json({ info, boxes: BOXES, retryable: !!lastError, lastError });
}));

ordersRouter.post("/:id/label/rates", requirePermission("orders.fulfill"), route(async (req, res) => {
  const order = await OrderRepository.get(req.params.id);
  if (!order) return fail(res, 404, "No order with that number.");
  try {
    res.json(await quoteLabel(order, {
      address: req.body?.address,
      boxId: String(req.body?.boxId || ""),
      weightOunces: Number(req.body?.weightOunces),
    }));
  } catch (error) {
    if (!labelError(res, error)) throw error;
  }
}));

ordersRouter.post("/:id/label", requirePermission("orders.fulfill"), route(async (req, res) => {
  const order = await OrderRepository.get(req.params.id);
  if (!order) return fail(res, 404, "No order with that number.");
  const staff = currentStaff(res);
  try {
    const updated = await buyLabel(order, staff, {
      shipmentId: String(req.body?.shipmentId || ""),
      rateId: String(req.body?.rateId || ""),
      voidPrevious: req.body?.voidPrevious === true,
    });
    await AuditLog.record(staff, {
      action: "order.label_buy",
      target: { type: "order", id: order.id },
      before: { shipmentId: order.shipmentId, trackingNumber: order.trackingNumber },
      after: { shipmentId: updated.shipmentId, trackingNumber: updated.trackingNumber, shippingLabelPrice: updated.shippingLabelPrice },
    });
    res.json({ order: updated, events: await OrderRepository.events(order.id) });
  } catch (error) {
    if (!labelError(res, error)) throw error;
  }
}));

ordersRouter.post("/:id/label/void", requirePermission("orders.fulfill"), route(async (req, res) => {
  const order = await OrderRepository.get(req.params.id);
  if (!order) return fail(res, 404, "No order with that number.");
  const staff = currentStaff(res);
  try {
    const status = await voidCurrentLabel(order, staff);
    await AuditLog.record(staff, {
      action: "order.label_void",
      target: { type: "order", id: order.id },
      after: { shipmentId: order.shipmentId, voidStatus: status },
    });
    res.json({ status });
  } catch (error) {
    if (!labelError(res, error)) throw error;
  }
}));

// Re-runs a web checkout order's server steps (label, Notion, receipt, emails)
// after a failure. Each finished step is skipped, so nothing repeats.
ordersRouter.post("/:id/fulfillment/retry", requirePermission("orders.fulfill"), route(async (req, res) => {
  const order = await OrderRepository.get(req.params.id);
  if (!order) return fail(res, 404, "No order with that number.");
  try {
    await fulfillCheckoutOrder(order.id);
  } catch (error) {
    return fail(res, 502, `Still failing: ${(error as Error).message}`);
  }
  await AuditLog.record(currentStaff(res), { action: "order.fulfillment_retry", target: { type: "order", id: order.id } });
  res.json({ order: await OrderRepository.get(order.id), events: await OrderRepository.events(order.id) });
}));

// ---- Orders created by hand ----

ordersRouter.post("/", requirePermission("orders.edit"), route(async (req, res) => {
  const staff = currentStaff(res);
  let order;
  try {
    order = await createManualOrder(parseManualOrder(req.body), staff);
  } catch (error) {
    if (error instanceof ManualOrderError) return fail(res, 400, error.message);
    throw error;
  }
  await AuditLog.record(staff, { action: "order.create", target: { type: "order", id: order.id }, after: order });
  res.status(201).json({ order });
}));

// An unpaid order created by hand (an invoice) gets paid later.
ordersRouter.post("/:id/mark-paid", requirePermission("orders.edit"), route(async (req, res) => {
  const order = await OrderRepository.get(req.params.id);
  if (!order) return fail(res, 404, "No order with that number.");
  if (order.paymentStatus !== "pending") return fail(res, 400, "This order isn't waiting for payment.");
  const method = (PAYMENT_METHODS as readonly string[]).includes(req.body?.method) ? req.body.method : order.paymentMethod || "other";
  const reference = String(req.body?.reference || "").trim().slice(0, 120) || order.paymentReference || null;
  const staff = currentStaff(res);
  await OrderRepository.update(order.id, {
    paymentStatus: "paid",
    status: "completed",
    paymentMethod: method,
    paymentReference: reference,
  } as Partial<AdminOrder>);
  await OrderRepository.addEvent(order.id, {
    type: "note",
    actor: { email: staff.email, name: staff.name },
    message: `Marked paid (${method}${reference ? ` · ${reference}` : ""})`,
  });
  await AuditLog.record(staff, {
    action: "order.mark_paid",
    target: { type: "order", id: order.id },
    before: { paymentStatus: order.paymentStatus },
    after: { paymentStatus: "paid", paymentMethod: method, paymentReference: reference },
  });
  res.json({ order: await OrderRepository.get(order.id), events: await OrderRepository.events(order.id) });
}));

export const catalogRouter = Router();

catalogRouter.get("/", requirePermission("orders.edit"), route(async (_req, res) => {
  res.json({ items: await catalog() });
}));

// ---- Editing details, deleting and restoring ----

const adminError = (res: Response, error: unknown): boolean => {
  if (error instanceof OrderAdminError) {
    fail(res, error.status, error.message);
    return true;
  }
  return false;
};

ordersRouter.patch("/:id/details", requirePermission("orders.edit"), route(async (req, res) => {
  const order = await OrderRepository.get(req.params.id);
  if (!order) return fail(res, 404, "No order with that number.");
  const staff = currentStaff(res);
  try {
    const changes = parseDetailChanges(req.body);
    const updated = await editOrderDetails(order, changes, staff);
    await AuditLog.record(staff, {
      action: "order.edit_details",
      target: { type: "order", id: order.id },
      before: Object.fromEntries(Object.keys(changes).map((key) => [key, (order as any)[key] ?? null])),
      after: changes,
    });
    res.json({ order: updated, events: await OrderRepository.events(order.id) });
  } catch (error) {
    if (!adminError(res, error)) throw error;
  }
}));

ordersRouter.delete("/:id", requirePermission("orders.delete"), route(async (req, res) => {
  const order = await OrderRepository.get(req.params.id);
  if (!order) return fail(res, 404, "No order with that number.");
  const staff = currentStaff(res);
  const reason = String(req.body?.reason || "").trim().slice(0, 500);
  try {
    await deleteOrder(order, staff, reason);
  } catch (error) {
    if (!adminError(res, error)) throw error;
    return;
  }
  await AuditLog.record(staff, { action: "order.delete", target: { type: "order", id: order.id }, before: order, ...(reason ? { note: reason } : {}) });
  res.json({ ok: true });
}));

export const deletedOrdersRouter = Router();

deletedOrdersRouter.get("/", requirePermission("orders.delete"), route(async (_req, res) => {
  res.json({ orders: await listDeleted() });
}));

deletedOrdersRouter.post("/:id/restore", requirePermission("orders.delete"), route(async (req, res) => {
  const staff = currentStaff(res);
  try {
    await restoreOrder(req.params.id, staff);
  } catch (error) {
    if (!adminError(res, error)) throw error;
    return;
  }
  await AuditLog.record(staff, { action: "order.restore", target: { type: "order", id: req.params.id } });
  res.json({ ok: true });
}));
