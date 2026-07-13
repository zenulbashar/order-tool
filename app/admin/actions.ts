"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { platformAuditLog, venues } from "@/lib/db/schema";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import {
  getSquareFeeMode,
  setSquareFeeMode,
  type SquareFeeMode,
} from "@/lib/platform-settings";
import {
  clearImpersonationCookie,
  getImpersonatedVenue,
  setImpersonationCookie,
} from "@/lib/tenant";

const ADMIN_PATH = "/admin";

/**
 * Flip the D1 Square fee-cost mode (Track E). Admin-gated, audited: every
 * change appends a platform_audit_log row with who flipped it and from→to.
 */
export async function updateSquareFeeMode(formData: FormData): Promise<void> {
  const admin = await requirePlatformAdmin();

  const raw = formData.get("mode");
  const mode: SquareFeeMode =
    raw === "passed_through" ? "passed_through" : "absorbed";

  const previous = await getSquareFeeMode();
  if (previous !== mode) {
    await setSquareFeeMode(mode);
    await db.insert(platformAuditLog).values({
      actorEmail: admin.email,
      action: "square_fee_mode",
      detail: `${previous} → ${mode}`,
    });
  }

  revalidatePath(ADMIN_PATH);
}

/**
 * "Open as venue": start an audited admin support session that scopes the owner
 * dashboard to ANY venue (not just the admin's own). Admin-gated; the venue must
 * exist. The impersonation cookie is honoured by getCurrentVenue only while the
 * session stays on the allowlist (re-checked every request), and every entry is
 * appended to platform_audit_log. Redirects into the dashboard.
 */
export async function openVenueAsAdmin(formData: FormData): Promise<void> {
  const admin = await requirePlatformAdmin();

  const venueId = String(formData.get("venueId") ?? "").trim();
  if (!venueId) redirect(ADMIN_PATH);

  const [venue] = await db
    .select({ id: venues.id, name: venues.name, slug: venues.slug })
    .from(venues)
    .where(eq(venues.id, venueId))
    .limit(1);
  if (!venue) redirect(ADMIN_PATH);

  await setImpersonationCookie(venue.id);
  await db.insert(platformAuditLog).values({
    actorEmail: admin.email,
    action: "open_as_venue",
    detail: `${venue.name} (${venue.slug})`,
  });

  redirect("/dashboard");
}

/**
 * Exit an "Open as venue" support session — clears the impersonation cookie so
 * the dashboard reverts to the admin's own venue(s), audited, and returns to the
 * console. Admin-gated; safe to call when not impersonating (a no-op clear).
 */
export async function exitVenueImpersonation(): Promise<void> {
  const admin = await requirePlatformAdmin();

  const venue = await getImpersonatedVenue();
  await clearImpersonationCookie();
  if (venue) {
    await db.insert(platformAuditLog).values({
      actorEmail: admin.email,
      action: "exit_as_venue",
      detail: `${venue.name} (${venue.slug})`,
    });
  }

  redirect(ADMIN_PATH);
}
