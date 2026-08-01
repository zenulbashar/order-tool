"use server";

import { revalidatePath } from "next/cache";

import { and, eq } from "drizzle-orm";

import { assignableRoles, parseRoleKey, type RoleKey } from "@/lib/authz";
import { db } from "@/lib/db";
import { venueMemberRoles, venueMembers } from "@/lib/db/schema";
import { sendStaffInviteEmail } from "@/lib/staff/invite-email";
import {
  createInvitation,
  revokeInvitation,
} from "@/lib/staff/invitations";
import {
  getCurrentVenueRoles,
  requireUser,
  requireVenuePermission,
} from "@/lib/tenant";
import { getBaseUrl } from "@/lib/url";
import { idSchema } from "@/lib/validation";

const STAFF_PATH = "/dashboard/settings/staff";

export type StaffActionResult = { ok?: true; error?: string };

/**
 * Staff management (M5 / audit F4). Every action re-checks `staff:manage` —
 * Server Functions are reachable by direct POST, so hiding the UI is not a
 * control — and additionally checks what the ACTOR may grant, which is what
 * stops a manager minting an owner and escalating themselves into billing.
 */

/** Invite someone by email. Returns the invite link for the owner to share. */
export async function inviteStaffAction(
  formData: FormData,
): Promise<StaffActionResult & { inviteUrl?: string }> {
  const user = await requireUser();
  const venue = await requireVenuePermission("staff:manage");
  const actorRoles = await getCurrentVenueRoles(venue.id);

  const result = await createInvitation({
    venueId: venue.id,
    email: String(formData.get("email") ?? ""),
    role: formData.get("role"),
    actorRoles,
    actorUserId: user.id ?? null,
  });
  if (!result.ok) return { error: result.error };

  const inviteUrl = `${await getBaseUrl()}/invite/${result.token}`;
  // Best-effort email; the link is also returned so the owner can share it
  // directly when email is unconfigured or slow.
  await sendStaffInviteEmail({
    to: String(formData.get("email") ?? ""),
    venueName: venue.name,
    inviteUrl,
  });

  revalidatePath(STAFF_PATH);
  return { ok: true, inviteUrl };
}

/** Withdraw a pending invitation. */
export async function revokeInvitationAction(
  formData: FormData,
): Promise<StaffActionResult> {
  const venue = await requireVenuePermission("staff:manage");
  const id = idSchema.safeParse(formData.get("invitationId"));
  if (!id.success) return { error: "Missing invitation." };

  await revokeInvitation(venue.id, id.data);
  revalidatePath(STAFF_PATH);
  return { ok: true };
}

/**
 * Replace a member's roles with a single chosen role.
 *
 * Two guards beyond the permission check:
 *  - The actor may only assign roles they are allowed to grant.
 *  - The LAST owner cannot be demoted. Without this, a venue can be left with
 *    nobody who can manage billing or staff — the same unrecoverable state
 *    F4 flags, reached from the other direction.
 */
export async function setMemberRoleAction(
  formData: FormData,
): Promise<StaffActionResult> {
  const actor = await requireUser();
  const venue = await requireVenuePermission("staff:manage");
  const actorRoles = await getCurrentVenueRoles(venue.id);

  const userId = idSchema.safeParse(formData.get("userId"));
  if (!userId.success) return { error: "Missing member." };

  const role = parseRoleKey(formData.get("role"));
  if (!role) return { error: "Choose a role." };
  if (!assignableRoles(actorRoles).includes(role)) {
    return { error: "You can't grant that role." };
  }

  if (role !== "owner" && (await isLastOwner(venue.id, userId.data))) {
    return { error: "A venue must keep at least one owner." };
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(venueMemberRoles)
      .where(
        and(
          eq(venueMemberRoles.venueId, venue.id),
          eq(venueMemberRoles.userId, userId.data),
        ),
      );
    await tx.insert(venueMemberRoles).values({
      venueId: venue.id,
      userId: userId.data,
      role,
      grantedByUserId: actor.id ?? null,
    });
    // Keep the legacy fallback column consistent with the new assignment.
    await tx
      .update(venueMembers)
      .set({ role: role === "owner" ? "owner" : "staff" })
      .where(
        and(
          eq(venueMembers.venueId, venue.id),
          eq(venueMembers.userId, userId.data),
        ),
      );
  });

  revalidatePath(STAFF_PATH);
  return { ok: true };
}

/** Remove a member entirely. The last owner is protected, as above. */
export async function removeMemberAction(
  formData: FormData,
): Promise<StaffActionResult> {
  const venue = await requireVenuePermission("staff:manage");

  const userId = idSchema.safeParse(formData.get("userId"));
  if (!userId.success) return { error: "Missing member." };

  if (await isLastOwner(venue.id, userId.data)) {
    return { error: "A venue must keep at least one owner." };
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(venueMemberRoles)
      .where(
        and(
          eq(venueMemberRoles.venueId, venue.id),
          eq(venueMemberRoles.userId, userId.data),
        ),
      );
    await tx
      .delete(venueMembers)
      .where(
        and(
          eq(venueMembers.venueId, venue.id),
          eq(venueMembers.userId, userId.data),
        ),
      );
  });

  revalidatePath(STAFF_PATH);
  return { ok: true };
}

/**
 * Is this user the venue's only owner? Counts BOTH sources, since a pre-M5
 * venue's owner is recorded only in the legacy column.
 */
async function isLastOwner(venueId: string, userId: string): Promise<boolean> {
  const owners = await ownerUserIds(venueId);
  return owners.length === 1 && owners[0] === userId;
}

async function ownerUserIds(venueId: string): Promise<string[]> {
  const assigned = await db
    .select({ userId: venueMemberRoles.userId })
    .from(venueMemberRoles)
    .where(
      and(
        eq(venueMemberRoles.venueId, venueId),
        eq(venueMemberRoles.role, "owner"),
      ),
    );
  const legacy = await db
    .select({ userId: venueMembers.userId })
    .from(venueMembers)
    .where(
      and(eq(venueMembers.venueId, venueId), eq(venueMembers.role, "owner")),
    );
  // A user with explicit role rows is governed by those rows only, so a
  // legacy 'owner' who has since been assigned 'staff' must not still count.
  const assignedUserIds = new Set(
    (
      await db
        .select({ userId: venueMemberRoles.userId })
        .from(venueMemberRoles)
        .where(eq(venueMemberRoles.venueId, venueId))
    ).map((row) => row.userId),
  );
  const effective = new Set(assigned.map((row) => row.userId));
  for (const row of legacy) {
    if (!assignedUserIds.has(row.userId)) effective.add(row.userId);
  }
  return [...effective];
}

export type MemberRow = {
  userId: string;
  name: string | null;
  email: string | null;
  roles: RoleKey[];
};
