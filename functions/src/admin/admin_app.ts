import express, { NextFunction, Request, Response, Router } from "express";
import { createLogger } from "../logger";
import { AuditLog } from "./audit_log";
import { currentStaff, requirePermission, requireStaff } from "./admin_auth";
import {
  canAssignRole,
  isRole,
  permissionsFor,
  REFUND_APPROVAL_THRESHOLD_CENTS,
  ROLE_DEFINITIONS,
  ROLES,
} from "./permissions";
import { normalizeEmail, StaffMember, StaffRepository, StaffStatus } from "./staff_repository";
import { catalogRouter, deletedOrdersRouter, ordersRouter, refundsRouter } from "./orders_routes";
import { customersRouter } from "./customers_routes";
import { subscriptionsRouter } from "./subscriptions_routes";
import { contentRouter } from "./content_routes";

/**
 * The admin dashboard's API. Served at dashboard.koinoniacoffeeproject.com/api/**
 * through a Firebase Hosting rewrite, so the dashboard calls it same-origin.
 * Every route needs a signed-in staff member; each checks its own permission.
 */
const logger = createLogger("admin_api");

type Handler = (req: Request, res: Response) => Promise<void>;

/** Express 4 doesn't catch rejected promises; this sends them to the error handler. */
const route = (handler: Handler) => (req: Request, res: Response, next: NextFunction) =>
  handler(req, res).catch(next);

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const router = Router();
router.use((req, res, next) => {
  requireStaff(req, res, next).catch(next);
});

router.get("/me", route(async (_req, res) => {
  const staff = currentStaff(res);
  res.json({
    email: staff.email,
    name: staff.name,
    role: staff.role,
    permissions: permissionsFor(staff.role),
  });
}));

router.get("/roles", route(async (_req, res) => {
  res.json({
    roles: ROLES.map((role) => ({ id: role, ...ROLE_DEFINITIONS[role] })),
    refundApprovalThresholdCents: REFUND_APPROVAL_THRESHOLD_CENTS,
  });
}));

router.get("/staff", requirePermission("staff.read"), route(async (_req, res) => {
  res.json({ staff: await StaffRepository.list() });
}));

router.post("/staff", requirePermission("staff.manage"), route(async (req, res) => {
  const actor = currentStaff(res);
  const email = normalizeEmail(String(req.body?.email || ""));
  const name = String(req.body?.name || "").trim();
  const role = req.body?.role;
  if (!EMAIL_PATTERN.test(email)) throw new HttpError(400, "Enter a valid email.");
  if (!isRole(role)) throw new HttpError(400, "Choose a role.");
  if (!canAssignRole(actor.role, role)) throw new HttpError(403, "Only an Owner can add Owners or Admins.");
  if (await StaffRepository.get(email)) throw new HttpError(409, "That email is already on the staff list.");

  const now = new Date().toISOString();
  const member: StaffMember = {
    email,
    name,
    role,
    status: "invited",
    uid: null,
    invitedBy: actor.email,
    createdAt: now,
    updatedAt: now,
    lastSignInAt: null,
  };
  await StaffRepository.create(member);
  await AuditLog.record(actor, { action: "staff.invite", target: { type: "staff", id: email }, after: member });
  res.status(201).json({ staff: member });
}));

router.patch("/staff/:email", requirePermission("staff.manage"), route(async (req, res) => {
  const actor = currentStaff(res);
  const existing = await StaffRepository.get(req.params.email);
  if (!existing) throw new HttpError(404, "No staff member with that email.");

  const changes: Partial<StaffMember> = {};
  if (req.body?.name !== undefined) changes.name = String(req.body.name).trim();
  if (req.body?.role !== undefined) {
    if (!isRole(req.body.role)) throw new HttpError(400, "Unknown role.");
    changes.role = req.body.role;
  }
  if (req.body?.status !== undefined) {
    const status = req.body.status as StaffStatus;
    if (status !== "active" && status !== "disabled") throw new HttpError(400, "Status must be active or disabled.");
    // Re-enabling someone who never signed in puts them back to invited.
    changes.status = status === "active" && !existing.uid ? "invited" : status;
  }

  const nextRole = changes.role ?? existing.role;
  if ((changes.role || changes.status) && !canAssignRole(actor.role, nextRole, existing.role)) {
    throw new HttpError(403, "Only an Owner can change Owners or Admins.");
  }
  if (existing.email === actor.email && (changes.role || changes.status === "disabled")) {
    throw new HttpError(400, "You can't change your own role or turn off your own access.");
  }
  const losesOwner = existing.role === "owner" && (nextRole !== "owner" || changes.status === "disabled");
  if (losesOwner && (await StaffRepository.countActiveOwners()) <= 1) {
    throw new HttpError(400, "There must always be at least one Owner.");
  }

  // Turning someone off applies on their next request: requireStaff checks status every time.
  const updated = await StaffRepository.update(existing.email, changes);
  await AuditLog.record(actor, {
    action: changes.status === "disabled" ? "staff.disable" : "staff.update",
    target: { type: "staff", id: existing.email },
    before: existing,
    after: updated,
  });
  res.json({ staff: updated });
}));

router.get("/audit-log", requirePermission("audit.read"), route(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const entries = await AuditLog.list({
    limit,
    before: typeof req.query.before === "string" ? req.query.before : undefined,
    targetType: typeof req.query.type === "string" ? req.query.type : undefined,
  });
  res.json({ entries, nextBefore: entries.length === limit ? entries[entries.length - 1].at : null });
}));

router.use("/orders", ordersRouter);
router.use("/refunds", refundsRouter);
router.use("/catalog", catalogRouter);
router.use("/deleted-orders", deletedOrdersRouter);
router.use("/customers", customersRouter);
router.use("/subscriptions", subscriptionsRouter);
router.use("/content", contentRouter);

export const adminApp = express();
adminApp.disable("x-powered-by");
// 12mb: image uploads arrive base64-encoded in JSON.
adminApp.use(express.json({ limit: "12mb" }));
adminApp.use("/api", router);
adminApp.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found." });
});
// eslint-disable-next-line @typescript-eslint/no-unused-vars
adminApp.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  logger.error("Admin API error", error);
  res.status(500).json({ error: "Something went wrong. Try again." });
});
