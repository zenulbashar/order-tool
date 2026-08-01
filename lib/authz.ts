/**
 * Venue role → permission model (M5 / audit F4). Pure and dependency-free, so
 * every access decision is unit-testable without a database or a session.
 *
 * SHAPE, and why this one:
 *  - Roles are assigned MANY-TO-MANY and permissions are the UNION of the
 *    user's roles. The audit's §8.3 verification refuted "exactly one role
 *    per user" outright — the one competitor data point that survived says
 *    the opposite ("one or multiple roles… cumulative permissions"). Union is
 *    also strictly more general: collapsing many-to-many to one role later is
 *    far cheaper than the reverse migration.
 *  - Permissions are NOT individually assignable. Roles are the unit of
 *    assignment; this catalogue is code, not data. That matches the only
 *    verified evidence ("you can't assign individual permissions… you need to
 *    assign a role") and avoids inventing the editable-permissions UI whose
 *    supporting claims were refuted.
 *  - The role SET is deliberately small (owner / manager / staff) and the
 *    catalogue is derived from surfaces this product actually has. No
 *    competitor baseline is invented here — §8.3 is explicit that none is
 *    verified.
 *
 * Adding a permission is a compile-time exercise: extend `Permission`, then
 * TypeScript forces every role to declare its stance in ROLE_PERMISSIONS.
 */

export const ROLE_KEYS = ["owner", "manager", "staff"] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

/**
 * What a member may do. Named `subject:verb` and grouped by the dashboard
 * surface it guards, so a reviewer can map a permission to a screen.
 */
export type Permission =
  // Kitchen — the day-to-day surface every member needs.
  | "orders:view"
  | "orders:manage"
  // Money that leaves the venue's balance.
  | "refunds:issue"
  // Catalogue and inventory.
  | "menu:manage"
  | "stock:manage"
  | "promotions:manage"
  | "giftcards:manage"
  // Venue configuration and reporting.
  | "settings:manage"
  | "reports:view"
  | "integrations:manage"
  // Ownership-grade surfaces.
  | "billing:manage"
  | "staff:manage";

/**
 * Role → permissions. `owner` is the full set by construction (see
 * ALL_PERMISSIONS) so a new permission can never silently exclude the owner
 * and lock a venue out of its own feature.
 */
const MANAGER_PERMISSIONS: Permission[] = [
  "orders:view",
  "orders:manage",
  "refunds:issue",
  "menu:manage",
  "stock:manage",
  "promotions:manage",
  "giftcards:manage",
  "settings:manage",
  "reports:view",
  "integrations:manage",
];

/**
 * Kitchen staff: run the pass, nothing else. Deliberately no refunds — that
 * is money leaving the venue, and the audit is explicit that enforcement must
 * exist BEFORE the first invite ships rather than after.
 */
const STAFF_PERMISSIONS: Permission[] = ["orders:view", "orders:manage"];

export const ALL_PERMISSIONS: Permission[] = [
  "orders:view",
  "orders:manage",
  "refunds:issue",
  "menu:manage",
  "stock:manage",
  "promotions:manage",
  "giftcards:manage",
  "settings:manage",
  "reports:view",
  "integrations:manage",
  "billing:manage",
  "staff:manage",
];

export const ROLE_PERMISSIONS: Record<RoleKey, readonly Permission[]> = {
  owner: ALL_PERMISSIONS,
  manager: MANAGER_PERMISSIONS,
  staff: STAFF_PERMISSIONS,
};

/** Human labels for the members UI. */
export const ROLE_LABEL: Record<RoleKey, string> = {
  owner: "Owner",
  manager: "Manager",
  staff: "Staff",
};

export const ROLE_DESCRIPTION: Record<RoleKey, string> = {
  owner: "Full access, including billing and staff.",
  manager: "Everything except billing and staff management.",
  staff: "The orders board only.",
};

/** The cumulative permission set for a member's roles. */
export function permissionsFor(roles: readonly RoleKey[]): Set<Permission> {
  const granted = new Set<Permission>();
  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role] ?? []) granted.add(permission);
  }
  return granted;
}

/** Does this set of roles grant the permission? */
export function can(
  roles: readonly RoleKey[],
  permission: Permission,
): boolean {
  for (const role of roles) {
    if (ROLE_PERMISSIONS[role]?.includes(permission)) return true;
  }
  return false;
}

/** Narrow an unknown value (form field, DB string) to a role key. */
export function parseRoleKey(value: unknown): RoleKey | null {
  return ROLE_KEYS.includes(value as RoleKey) ? (value as RoleKey) : null;
}

/**
 * Roles an actor may GRANT: exactly those whose permissions are a SUBSET of
 * the actor's own.
 *
 * Stated as a rule rather than a hardcoded list, because the property that
 * matters is "you cannot grant what you do not hold" — that makes privilege
 * escalation impossible BY CONSTRUCTION rather than by remembering to update
 * a list. An owner can grant anything; a manager can grant manager and staff
 * but never owner (owner has billing/staff permissions the manager lacks);
 * staff can grant only staff.
 *
 * The caller must still check `staff:manage` before offering any of this —
 * this answers "which roles", not "may they manage staff at all".
 */
export function assignableRoles(actorRoles: readonly RoleKey[]): RoleKey[] {
  const held = permissionsFor(actorRoles);
  return ROLE_KEYS.filter((role) =>
    ROLE_PERMISSIONS[role].every((permission) => held.has(permission)),
  );
}

/**
 * Legacy bridge: `venue_members.role` is the pre-M5 two-value column
 * ('owner' | 'staff'). Every existing member keeps exactly the access they
 * had, with no data migration — the new assignment table simply takes
 * precedence once a row exists for them. See lib/tenant.ts.
 */
export function roleFromLegacyMemberRole(role: string): RoleKey {
  return role === "owner" ? "owner" : "staff";
}
