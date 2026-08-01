import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { and, desc, eq, isNull } from "drizzle-orm";

import {
  type RoleKey,
  assignableRoles,
  parseRoleKey,
} from "@/lib/authz";
import { db } from "@/lib/db";
import {
  venueInvitations,
  venueMemberRoles,
  venueMembers,
} from "@/lib/db/schema";

/**
 * Staff invitations (M5 / audit F4).
 *
 * Security shape, mirroring how the app already treats the order token and
 * OAuth state:
 *  - The raw token is 256 bits of CSPRNG randomness, returned ONCE to build
 *    the invite link and never stored. Only its SHA-256 hash is persisted, so
 *    a database read (or a leaked backup) cannot be replayed into venue
 *    access.
 *  - An invitation is bound to the invited EMAIL. Acceptance requires a
 *    signed-in user whose own email matches, so forwarding the link to a
 *    third party does not grant them access.
 *  - Single use (accepted_at), time limited (expires_at), and revocable.
 *  - The role is validated against what the INVITER may actually grant, so a
 *    manager cannot mint an owner and escalate themselves.
 *
 * A plain SHA-256 (not a password KDF) is right here: the token is
 * high-entropy random, not a human secret, so there is nothing to brute-force
 * and no salt to add.
 */

/** How long an invite stays usable. Long enough for a real staff hire. */
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** URL-safe, 256-bit invite token. */
export function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Emails are compared case-insensitively; store them normalised. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export type CreateInvitationResult =
  | { ok: true; token: string; invitationId: string }
  | { ok: false; error: string };

/**
 * Invite someone to a venue. The caller must already have been checked for
 * `staff:manage`; the extra `actorRoles` check here is what stops a manager
 * granting `owner`.
 */
export async function createInvitation(input: {
  venueId: string;
  email: string;
  role: unknown;
  actorRoles: readonly RoleKey[];
  actorUserId: string | null;
  now?: number;
}): Promise<CreateInvitationResult> {
  const email = normalizeEmail(String(input.email ?? ""));
  // Deliberately permissive shape check — the invite is only usable by a
  // signed-in user whose session email matches, so this guards typos, not
  // security.
  if (!email || !email.includes("@") || email.length > 320) {
    return { ok: false, error: "Enter a valid email address." };
  }

  const role = parseRoleKey(input.role);
  if (!role) return { ok: false, error: "Choose a role." };
  if (!assignableRoles(input.actorRoles).includes(role)) {
    return { ok: false, error: "You can't grant that role." };
  }

  const now = input.now ?? Date.now();
  const token = generateInviteToken();

  const [row] = await db
    .insert(venueInvitations)
    .values({
      venueId: input.venueId,
      email,
      role,
      tokenHash: hashInviteToken(token),
      expiresAt: new Date(now + INVITE_TTL_MS),
      invitedByUserId: input.actorUserId,
    })
    .returning({ id: venueInvitations.id });

  return { ok: true, token, invitationId: row.id };
}

export type AcceptInvitationResult =
  | { ok: true; venueId: string; role: RoleKey }
  | { ok: false; error: string };

/**
 * Redeem an invite for the signed-in user. Every failure returns the SAME
 * generic message: a distinct "expired" vs "wrong email" vs "not found" reply
 * would let someone probe which tokens exist.
 */
export async function acceptInvitation(input: {
  token: string;
  userId: string;
  userEmail: string | null | undefined;
  now?: number;
}): Promise<AcceptInvitationResult> {
  const generic = {
    ok: false,
    error: "This invitation is no longer valid.",
  } as const;

  const raw = String(input.token ?? "");
  if (!raw) return generic;

  const [invitation] = await db
    .select()
    .from(venueInvitations)
    .where(eq(venueInvitations.tokenHash, hashInviteToken(raw)))
    .limit(1);
  if (!invitation) return generic;

  const now = input.now ?? Date.now();
  if (invitation.acceptedAt || invitation.revokedAt) return generic;
  if (invitation.expiresAt.getTime() <= now) return generic;

  const sessionEmail = normalizeEmail(String(input.userEmail ?? ""));
  if (!sessionEmail || !constantTimeEquals(sessionEmail, invitation.email)) {
    return generic;
  }

  // Membership + role in one transaction, so a half-accepted invite can't
  // leave a member with no role (or a role with no membership).
  await db.transaction(async (tx) => {
    await tx
      .insert(venueMembers)
      .values({
        venueId: invitation.venueId,
        userId: input.userId,
        // The legacy column still exists as the fallback for pre-M5 members;
        // keep it consistent rather than leaving it arbitrary.
        role: invitation.role === "owner" ? "owner" : "staff",
      })
      .onConflictDoNothing();

    await tx
      .insert(venueMemberRoles)
      .values({
        venueId: invitation.venueId,
        userId: input.userId,
        role: invitation.role,
        grantedByUserId: invitation.invitedByUserId,
      })
      .onConflictDoNothing();

    await tx
      .update(venueInvitations)
      .set({ acceptedAt: new Date(now), updatedAt: new Date(now) })
      .where(eq(venueInvitations.id, invitation.id));
  });

  return { ok: true, venueId: invitation.venueId, role: invitation.role };
}

/** Pending (unaccepted, unrevoked) invitations for the members page. */
export async function listPendingInvitations(venueId: string) {
  return db
    .select({
      id: venueInvitations.id,
      email: venueInvitations.email,
      role: venueInvitations.role,
      expiresAt: venueInvitations.expiresAt,
      createdAt: venueInvitations.createdAt,
    })
    .from(venueInvitations)
    .where(
      and(
        eq(venueInvitations.venueId, venueId),
        isNull(venueInvitations.acceptedAt),
        isNull(venueInvitations.revokedAt),
      ),
    )
    .orderBy(desc(venueInvitations.createdAt));
}

/** Revoke a pending invitation. Venue-scoped, so a forged id does nothing. */
export async function revokeInvitation(
  venueId: string,
  invitationId: string,
): Promise<void> {
  await db
    .update(venueInvitations)
    .set({ revokedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(venueInvitations.id, invitationId),
        eq(venueInvitations.venueId, venueId),
        isNull(venueInvitations.acceptedAt),
      ),
    );
}

/** Length-safe constant-time compare for the email match. */
function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
