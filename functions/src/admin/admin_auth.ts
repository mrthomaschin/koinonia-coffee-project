import type { NextFunction, Request, Response } from "express";
import { defineString } from "firebase-functions/params";
import { getAdminAuth } from "../integrations/firebase_admin";
import { createLogger } from "../logger";
import { hasPermission, Permission } from "./permissions";
import { normalizeEmail, StaffMember, StaffRepository } from "./staff_repository";

const logger = createLogger("admin_auth");

/**
 * The founder's sign-in email. The first time this address signs in and has no
 * staff record, it becomes an Owner; everyone else must be invited. Set on
 * first deploy (the Firebase CLI asks for it) or in functions/.env.<project>.
 */
const OWNER_EMAIL = defineString("ADMIN_OWNER_EMAIL", {
  description: "Email of the founder, who becomes the first dashboard Owner on first sign-in.",
});

/** The signed-in staff member for this request, set by requireStaff. */
export const currentStaff = (res: Response): StaffMember => res.locals.staff as StaffMember;

const deny = (res: Response, status: 401 | 403, error: string): void => {
  res.status(status).json({ error });
};

const bootstrapOwner = async (email: string, name: string, uid: string): Promise<StaffMember | null> => {
  const ownerEmail = OWNER_EMAIL.value();
  if (!ownerEmail || normalizeEmail(ownerEmail) !== email) return null;
  const now = new Date().toISOString();
  const owner: StaffMember = {
    email,
    name: name || email,
    role: "owner",
    status: "active",
    uid,
    invitedBy: null,
    createdAt: now,
    updatedAt: now,
    lastSignInAt: now,
  };
  await StaffRepository.create(owner);
  logger.info("Created the first Owner from ADMIN_OWNER_EMAIL");
  return owner;
};

/**
 * Verifies the Firebase ID token, then checks the staff list. Staff are looked
 * up by verified email on every request, so a role change or removal applies
 * immediately.
 */
export const requireStaff = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const token = req.header("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return deny(res, 401, "Sign in required.");

  // Signature and expiry only. Revocation isn't checked here (that needs a
  // Firebase Auth admin role); turning a staff member off takes effect through
  // the staff lookup below on their very next request.
  let decoded;
  try {
    decoded = await getAdminAuth().verifyIdToken(token);
  } catch (error) {
    logger.warn("Rejected ID token", { code: (error as { code?: string }).code, message: (error as Error).message });
    return deny(res, 401, "Your session has expired. Sign in again.");
  }
  if (!decoded.email || !decoded.email_verified) {
    return deny(res, 403, "This sign-in has no verified email.");
  }

  const email = normalizeEmail(decoded.email);
  let staff = await StaffRepository.get(email);
  if (!staff) {
    try {
      staff = await bootstrapOwner(email, String(decoded.name || ""), decoded.uid);
    } catch (error) {
      // Two first requests racing: the other one created it.
      staff = await StaffRepository.get(email);
      if (!staff) throw error;
    }
  }
  if (!staff) return deny(res, 403, "This account hasn't been invited to the dashboard.");
  if (staff.status === "disabled") return deny(res, 403, "This account has been turned off.");
  if (staff.uid && staff.uid !== decoded.uid) {
    // Same email, different Firebase user (e.g. Google vs. email link). Both are
    // verified, so accept it, and remember the latest one.
    logger.info("Staff signed in with a different provider", { email });
  }

  const now = new Date();
  const lastSignIn = staff.lastSignInAt ? Date.parse(staff.lastSignInAt) : 0;
  if (staff.status === "invited" || staff.uid !== decoded.uid || now.getTime() - lastSignIn > 15 * 60 * 1000) {
    staff = await StaffRepository.update(email, {
      status: "active",
      uid: decoded.uid,
      lastSignInAt: now.toISOString(),
      ...(staff.name ? {} : { name: String(decoded.name || email) }),
    });
  }

  res.locals.staff = staff;
  next();
};

export const requirePermission = (permission: Permission) =>
  (_req: Request, res: Response, next: NextFunction): void => {
    if (!hasPermission(currentStaff(res).role, permission)) {
      return deny(res, 403, "You don't have access to this.");
    }
    next();
  };

/** Passes when the staff member has any one of these permissions. */
export const requireAnyPermission = (...permissions: Permission[]) =>
  (_req: Request, res: Response, next: NextFunction): void => {
    const role = currentStaff(res).role;
    if (!permissions.some((permission) => hasPermission(role, permission))) {
      return deny(res, 403, "You don't have access to this.");
    }
    next();
  };
