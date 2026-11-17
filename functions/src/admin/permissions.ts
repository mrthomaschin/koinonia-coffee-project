/**
 * Staff roles and what each can do in the admin dashboard.
 *
 * The API checks permissions, never role names, so a role can change what it
 * grants without touching any route. Roles are listed most to least powerful.
 */

export const PERMISSIONS = [
  "orders.read",
  "orders.edit",
  "orders.fulfill",
  "orders.refund",
  // Refunds above REFUND_APPROVAL_THRESHOLD_CENTS.
  "orders.refund_large",
  // Moves an order to Deleted orders (restorable). Owner only.
  "orders.delete",
  "products.read",
  "products.edit",
  "inventory.edit",
  "customers.read",
  "customers.edit",
  "subscriptions.read",
  "subscriptions.edit",
  "discounts.read",
  "discounts.edit",
  "content.read",
  "content.edit",
  "reviews.read",
  "reviews.moderate",
  "analytics.read",
  "staff.read",
  "staff.manage",
  "audit.read",
  "settings.edit",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLES = ["owner", "admin", "operations", "support", "content", "viewer"] as const;

export type Role = (typeof ROLES)[number];

/** Refunds above this need an Owner ($50, per _context/decisions.md 2026-11-17). */
export const REFUND_APPROVAL_THRESHOLD_CENTS = 5000;

const READ_ALL: Permission[] = PERMISSIONS.filter((permission) => permission.endsWith(".read"));

interface RoleDefinition {
  label: string;
  description: string;
  permissions: readonly Permission[];
}

export const ROLE_DEFINITIONS: Record<Role, RoleDefinition> = {
  owner: {
    label: "Owner",
    description: "Everything, including large refunds, deleting orders, and managing other owners and admins.",
    permissions: PERMISSIONS,
  },
  admin: {
    label: "Admin",
    description: "Everything except refunds over $50, deleting orders, and managing owners or admins.",
    permissions: PERMISSIONS.filter((permission) => permission !== "orders.refund_large" && permission !== "orders.delete"),
  },
  operations: {
    label: "Operations",
    description: "Orders, fulfillment, shipping labels, products and stock.",
    permissions: [
      "orders.read", "orders.edit", "orders.fulfill",
      "products.read", "products.edit", "inventory.edit",
      "customers.read", "subscriptions.read", "content.read", "analytics.read",
    ],
  },
  support: {
    label: "Support",
    description: "Customers, orders and subscriptions, with refunds up to $50.",
    permissions: [
      "orders.read", "orders.edit", "orders.refund",
      "customers.read", "customers.edit",
      "subscriptions.read", "subscriptions.edit",
      "products.read", "discounts.read", "reviews.read",
    ],
  },
  content: {
    label: "Content & Marketing",
    description: "Products, events, page content, discounts and reviews.",
    permissions: [
      "products.read", "products.edit",
      "content.read", "content.edit",
      "discounts.read", "discounts.edit",
      "reviews.read", "reviews.moderate",
      "analytics.read",
    ],
  },
  viewer: {
    label: "Viewer",
    description: "Read-only access to everything except staff and the audit log.",
    permissions: READ_ALL.filter((permission) => permission !== "staff.read" && permission !== "audit.read"),
  },
};

export const isRole = (value: unknown): value is Role =>
  typeof value === "string" && (ROLES as readonly string[]).includes(value);

export const permissionsFor = (role: Role): readonly Permission[] => ROLE_DEFINITIONS[role].permissions;

export const hasPermission = (role: Role, permission: Permission): boolean =>
  permissionsFor(role).includes(permission);

/** Owners and admins can only be appointed, changed or removed by an owner. */
export const isPrivilegedRole = (role: Role): boolean => role === "owner" || role === "admin";

/** Whether `actor` may give `target` this role, or change a staff member who holds `currentRole`. */
export const canAssignRole = (actor: Role, nextRole: Role, currentRole?: Role): boolean => {
  if (actor === "owner") return true;
  if (actor !== "admin") return false;
  return !isPrivilegedRole(nextRole) && (currentRole === undefined || !isPrivilegedRole(currentRole));
};
