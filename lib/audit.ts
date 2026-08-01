import "server-only";

import { desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { platformAuditLog } from "@/lib/db/schema";

/**
 * Merchant-side audit log (M8 / audit F9).
 *
 * `platform_audit_log` already covered admin-console actions well, but ONLY
 * those — every writer lived under `app/admin/`. The gap the finding names is
 * specific: you could prove *that* an admin opened a venue, but not *what*
 * anyone changed inside it. This module widens the same table to venue-scoped
 * events so both live on one timeline.
 *
 * Design rules:
 *  - Auditing NEVER fails the action it describes. A logging failure is
 *    logged to the function log and swallowed: refusing a merchant's price
 *    change because an audit insert failed would be worse than the gap.
 *  - `detail` is a short human-readable summary, written for someone reading
 *    it months later in a dispute. Never a payload dump, never anything
 *    secret-shaped — the same discipline as the scrubbed integration errors.
 *  - Entries are append-only. Nothing in the product updates or deletes one.
 */

/**
 * The vocabulary of merchant-side events. A closed union rather than free
 * text so the feed can label and filter them, and so a typo becomes a
 * compile error instead of an entry nobody can find.
 */
export type VenueAuditAction =
  | "menu_item_created"
  | "menu_item_updated"
  | "menu_item_deleted"
  | "menu_item_availability"
  | "menu_category_changed"
  | "hours_updated"
  | "order_status_changed"
  | "order_refunded"
  | "gift_card_issued"
  | "gift_card_topped_up"
  | "gift_card_voided"
  | "staff_invited"
  | "staff_role_changed"
  | "staff_removed"
  | "integration_connected"
  | "integration_disconnected";

export type VenueAuditEntry = {
  venueId: string;
  action: VenueAuditAction;
  /** Short, human-readable. e.g. `Flat White: $4.50 → $5.00`. */
  detail?: string | null;
  actor: { id?: string | null; email?: string | null };
};

/** Keep summaries short and free of anything payload- or secret-shaped. */
function scrubDetail(detail: string | null | undefined): string | null {
  if (!detail) return null;
  return detail.replace(/[A-Za-z0-9_\-.]{40,}/g, "…").slice(0, 500);
}

/**
 * Record one merchant-side event. Never throws — see the module docstring.
 * Callers may `await` it or fire it inside `after()`; it is cheap either way
 * (a single insert).
 */
export async function recordVenueAudit(entry: VenueAuditEntry): Promise<void> {
  try {
    await db.insert(platformAuditLog).values({
      venueId: entry.venueId,
      actorUserId: entry.actor.id ?? null,
      // The column is NOT NULL and predates user ids; fall back to a stable
      // marker rather than inventing an address.
      actorEmail: entry.actor.email ?? "unknown",
      action: entry.action,
      detail: scrubDetail(entry.detail),
    });
  } catch (error) {
    console.error(
      `[audit] failed to record ${entry.action} for venue ${entry.venueId}:`,
      error,
    );
  }
}

/**
 * The venue's own activity feed. Venue-scoped by construction — the caller
 * passes the session-resolved venue id, never a client value — and returns
 * only merchant-side rows, so a venue can never read platform-wide admin
 * entries (which carry a NULL venue_id).
 */
export async function getVenueAuditLog(venueId: string, limit = 100) {
  return db
    .select({
      id: platformAuditLog.id,
      action: platformAuditLog.action,
      detail: platformAuditLog.detail,
      actorEmail: platformAuditLog.actorEmail,
      createdAt: platformAuditLog.createdAt,
    })
    .from(platformAuditLog)
    // Platform-wide admin rows carry a NULL venue_id, so this filter alone
    // keeps them out of a merchant's feed.
    .where(eq(platformAuditLog.venueId, venueId))
    .orderBy(desc(platformAuditLog.createdAt))
    .limit(limit);
}

/** Human labels for the activity feed. */
export const AUDIT_ACTION_LABEL: Record<VenueAuditAction, string> = {
  menu_item_created: "Menu item added",
  menu_item_updated: "Menu item edited",
  menu_item_deleted: "Menu item removed",
  menu_item_availability: "Availability changed",
  menu_category_changed: "Menu category changed",
  hours_updated: "Opening hours updated",
  order_status_changed: "Order status changed",
  order_refunded: "Order refunded",
  gift_card_issued: "Gift card issued",
  gift_card_topped_up: "Gift card topped up",
  gift_card_voided: "Gift card voided",
  staff_invited: "Staff invited",
  staff_role_changed: "Staff role changed",
  staff_removed: "Staff removed",
  integration_connected: "Integration connected",
  integration_disconnected: "Integration disconnected",
};
