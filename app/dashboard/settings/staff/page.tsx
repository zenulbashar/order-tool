import { asc, eq } from "drizzle-orm";

import { PageHeader } from "@/app/_components/page-header";
import { type RoleKey, roleFromLegacyMemberRole } from "@/lib/authz";
import { db } from "@/lib/db";
import { users, venueMemberRoles, venueMembers } from "@/lib/db/schema";
import { listPendingInvitations } from "@/lib/staff/invitations";
import {
  getCurrentVenueRoles,
  requireUser,
  requireVenuePermission,
} from "@/lib/tenant";

import { StaffManager } from "./staff-manager";

export const dynamic = "force-dynamic";

/**
 * Staff & roles (M5 / audit F4). Reachable only with `staff:manage` — the
 * page itself is gated, not merely the buttons on it, and every action
 * re-checks independently because Server Functions accept direct POSTs.
 */
export default async function StaffSettingsPage() {
  const user = await requireUser();
  const venue = await requireVenuePermission("staff:manage");
  const actorRoles = await getCurrentVenueRoles(venue.id);

  const memberRows = await db
    .select({
      userId: venueMembers.userId,
      legacyRole: venueMembers.role,
      name: users.name,
      email: users.email,
      createdAt: venueMembers.createdAt,
    })
    .from(venueMembers)
    .innerJoin(users, eq(users.id, venueMembers.userId))
    .where(eq(venueMembers.venueId, venue.id))
    .orderBy(asc(venueMembers.createdAt));

  const roleRows = await db
    .select({
      userId: venueMemberRoles.userId,
      role: venueMemberRoles.role,
    })
    .from(venueMemberRoles)
    .where(eq(venueMemberRoles.venueId, venue.id));

  const rolesByUser = new Map<string, RoleKey[]>();
  for (const row of roleRows) {
    rolesByUser.set(row.userId, [
      ...(rolesByUser.get(row.userId) ?? []),
      row.role,
    ]);
  }

  const members = memberRows.map((row) => ({
    userId: row.userId,
    name: row.name,
    email: row.email,
    // Same precedence as the server: explicit assignments win; otherwise the
    // legacy column is the fallback, so pre-M5 venues render correctly.
    roles:
      rolesByUser.get(row.userId) ??
      ([roleFromLegacyMemberRole(row.legacyRole)] as RoleKey[]),
    isSelf: row.userId === user.id,
  }));

  const invitations = (await listPendingInvitations(venue.id)).map((row) => ({
    ...row,
    expiresAt: row.expiresAt.toISOString(),
  }));

  return (
    <main className="mx-auto w-full max-w-[1600px]">
      <PageHeader
        title="Staff & roles"
        backHref="/dashboard/settings"
        description="Invite your team and control what each person can do."
      />
      <section className="max-w-[900px] px-5 py-8">
        <StaffManager
          members={members}
          invitations={invitations}
          actorRoles={actorRoles}
        />
      </section>
    </main>
  );
}
