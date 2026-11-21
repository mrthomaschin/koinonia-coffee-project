import { randomInt } from "crypto";
import express, { NextFunction, Request, Response, Router } from "express";
import { getAdminAuth } from "../integrations/firebase_admin";
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
import { printingRouter } from "./printing_routes";
import { analyticsRouter } from "./analytics_routes";

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

const MIN_PASSWORD_LENGTH = 6; // Firebase's own floor

// No look-alike characters (0/O, 1/l/I) so a temporary password can be read out or typed.
const TEMP_PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const generateTempPassword = (): string =>
  Array.from({ length: 14 }, () => TEMP_PASSWORD_ALPHABET[randomInt(TEMP_PASSWORD_ALPHABET.length)]).join("");

/**
 * Gives an approved email a password login with a temporary password, created
 * already email-verified (nothing is emailed, so the sign-in page can't be used to
 * send mail to strangers). Works for an email that already has a Google login too:
 * it gains a password as well. The caller shows the password once and never stores it.
 */
const issueTempPassword = async (email: string, name: string): Promise<string> => {
  const auth = getAdminAuth();
  const password = generateTempPassword();
  try {
    const existing = await auth.getUserByEmail(email);
    await auth.updateUser(existing.uid, { password, emailVerified: true, disabled: false });
  } catch (error) {
    if ((error as { code?: string }).code !== "auth/user-not-found") throw error;
    await auth.createUser({ email, password, emailVerified: true, displayName: name || undefined });
  }
  return password;
};

const router = Router();
router.use((req, res, next) => {
  requireStaff(req, res, next).catch(next);
});

// Someone on a temporary password can only see their profile and choose a new password.
router.use((req, res, next) => {
  const onlyAllowed = req.path === "/me" || req.path === "/me/password";
  if (currentStaff(res).mustChangePassword && !onlyAllowed) {
    res.status(403).json({ error: "Choose a new password before using the dashboard." });
    return;
  }
  next();
});

const meResponse = (staff: StaffMember) => ({
  email: staff.email,
  name: staff.name,
  phone: staff.phone ?? "",
  title: staff.title ?? "",
  role: staff.role,
  permissions: permissionsFor(staff.role),
  passwordSignIn: Boolean(staff.passwordSignIn),
  mustChangePassword: Boolean(staff.mustChangePassword),
});

router.get("/me", route(async (_req, res) => {
  res.json(meResponse(currentStaff(res)));
}));

// Own profile. Role and status are never editable here.
router.patch("/me", route(async (req, res) => {
  const actor = currentStaff(res);
  const changes: Partial<StaffMember> = {};
  if (req.body?.name !== undefined) {
    const name = String(req.body.name).trim().slice(0, 100);
    if (!name) throw new HttpError(400, "Enter your name.");
    changes.name = name;
  }
  if (req.body?.phone !== undefined) changes.phone = String(req.body.phone).trim().slice(0, 40);
  if (req.body?.title !== undefined) changes.title = String(req.body.title).trim().slice(0, 80);
  const updated = await StaffRepository.update(actor.email, changes);
  await AuditLog.record(actor, {
    action: "staff.profile",
    target: { type: "staff", id: actor.email },
    before: { name: actor.name, phone: actor.phone ?? "", title: actor.title ?? "" },
    after: { name: updated.name, phone: updated.phone ?? "", title: updated.title ?? "" },
  });
  res.json(meResponse(updated));
}));

// Own password. Only for accounts that have a password login (given by an Owner/Admin).
router.put("/me/password", route(async (req, res) => {
  const actor = currentStaff(res);
  const password = String(req.body?.newPassword || "");
  if (
    password.length < MIN_PASSWORD_LENGTH ||
    !/\d/.test(password) ||
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password)
  ) {
    throw new HttpError(400, `Use at least ${MIN_PASSWORD_LENGTH} characters, with a number, a lowercase letter and a capital letter.`);
  }
  const auth = getAdminAuth();
  const user = await auth.getUserByEmail(actor.email);
  await auth.updateUser(user.uid, { password });
  const updated = await StaffRepository.update(actor.email, { passwordSignIn: true, mustChangePassword: false });
  await AuditLog.record(actor, { action: "staff.password_change", target: { type: "staff", id: actor.email } });
  res.json(meResponse(updated));
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
    title: String(req.body?.title || "").trim().slice(0, 80),
  };
  // Optional: also create an email + password login (for people without a Google account).
  const withPassword = req.body?.createPassword === true;
  const tempPassword = withPassword ? await issueTempPassword(email, name) : null;
  if (withPassword) {
    member.passwordSignIn = true;
    member.mustChangePassword = true;
  }
  await StaffRepository.create(member);
  await AuditLog.record(actor, {
    action: "staff.invite",
    target: { type: "staff", id: email },
    after: member,
    note: withPassword ? "Password login created" : undefined,
  });
  res.status(201).json({ staff: member, tempPassword });
}));

router.patch("/staff/:email", requirePermission("staff.manage"), route(async (req, res) => {
  const actor = currentStaff(res);
  const existing = await StaffRepository.get(req.params.email);
  if (!existing) throw new HttpError(404, "No staff member with that email.");

  const changes: Partial<StaffMember> = {};
  if (req.body?.name !== undefined) changes.name = String(req.body.name).trim();
  if (req.body?.title !== undefined) changes.title = String(req.body.title).trim().slice(0, 80);
  if (req.body?.role !== undefined) {
    if (!isRole(req.body.role)) throw new HttpError(400, "Unknown role.");
    if (req.body.role !== existing.role) {
      if (actor.role !== "owner") throw new HttpError(403, "Only an Owner can change roles.");
      changes.role = req.body.role;
    }
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

// Gives someone (or resets them to) a temporary password; they must choose their own at sign-in.
router.post("/staff/:email/password", requirePermission("staff.manage"), route(async (req, res) => {
  const actor = currentStaff(res);
  const existing = await StaffRepository.get(req.params.email);
  if (!existing) throw new HttpError(404, "No staff member with that email.");
  if (existing.email === actor.email) throw new HttpError(400, "Change your own password in your profile.");
  if (!canAssignRole(actor.role, existing.role, existing.role)) {
    throw new HttpError(403, "Only an Owner can reset the password of an Owner or Admin.");
  }
  if (existing.status === "disabled") throw new HttpError(400, "Turn their access on first.");
  const tempPassword = await issueTempPassword(existing.email, existing.name);
  const updated = await StaffRepository.update(existing.email, { passwordSignIn: true, mustChangePassword: true });
  await AuditLog.record(actor, {
    action: "staff.password_reset",
    target: { type: "staff", id: existing.email },
    note: "Temporary password issued",
  });
  res.json({ staff: updated, tempPassword });
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
router.use("/printing", printingRouter);
router.use("/analytics", analyticsRouter);

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
