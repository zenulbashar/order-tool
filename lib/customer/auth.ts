import { and, eq, gt, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { cache } from "react";

import { db } from "@/lib/db";
import {
  customerLoginTokens,
  customerSessions,
  customers,
  type Customer,
} from "@/lib/db/schema";

import { generateOpaqueToken, hashToken } from "./tokens";

/**
 * Customer identity core (#7) — the customer analog of lib/tenant.ts, and
 * DELIBERATELY firewalled from owner Auth.js (lib/auth.ts):
 *  - reads its OWN cookie (ot_customer_session), never the Auth.js cookie;
 *  - queries ONLY the customer tables, never users / sessions / accounts /
 *    verification_tokens;
 *  - never imports lib/auth.ts and never calls signIn / auth / signOut.
 * A customer authenticating here can never create or touch an owner record, and
 * a customer session can never widen into owner/dashboard access (those gate on
 * requireUser(), which is blind to this cookie).
 */

const CUSTOMER_SESSION_COOKIE = "ot_customer_session";
const SESSION_TTL_MS = 60 * 24 * 60 * 60 * 1000; // 60 days
const LOGIN_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

/**
 * Resolve the signed-in customer FOR THIS VENUE, or null. The session row is
 * venue-bound, so a session minted at venue A returns null at venue B — the
 * per-venue isolation gate, enforced server-side even though the cookie is
 * path "/". Looks the session up by the SHA-256 hash of the cookie token (never
 * the raw value) and requires an unexpired row whose venue matches. Wrapped in
 * cache() so a page and its actions share one lookup per request.
 */
export const getCustomer = cache(
  async (venueId: string): Promise<Customer | null> => {
    const raw = (await cookies()).get(CUSTOMER_SESSION_COOKIE)?.value;
    if (!raw) return null;

    const [row] = await db
      .select({ customer: customers })
      .from(customerSessions)
      .innerJoin(customers, eq(customers.id, customerSessions.customerId))
      .where(
        and(
          eq(customerSessions.sessionTokenHash, hashToken(raw)),
          // Session must belong to THIS venue, and so must the customer it
          // points to (defense in depth against a cross-venue session row).
          eq(customerSessions.venueId, venueId),
          eq(customers.venueId, venueId),
          gt(customerSessions.expiresAt, new Date()),
        ),
      )
      .limit(1);

    return row?.customer ?? null;
  },
);

/**
 * Find-or-create the customer for (venue, email). Case-insensitive within the
 * venue; the unique index on (venue_id, lower(email)) is the backstop and the
 * race is handled by re-reading on a unique violation. `email` must already be
 * normalized (lowercased + validated) by the caller's schema.
 */
export async function upsertCustomerByEmail(
  venueId: string,
  email: string,
): Promise<Customer> {
  const find = () =>
    db
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.venueId, venueId),
          sql`lower(${customers.email}) = ${email}`,
        ),
      )
      .limit(1);

  const existing = await find();
  if (existing[0]) return existing[0];

  try {
    const [created] = await db
      .insert(customers)
      .values({ venueId, email })
      .returning();
    return created;
  } catch (error) {
    if (isUniqueViolation(error)) {
      const [row] = await find();
      if (row) return row;
    }
    throw error;
  }
}

/**
 * Mint a single-use magic-link token for (venue, email) and return the RAW
 * token (the caller embeds it in the emailed URL; only its hash is stored).
 * `email` must already be normalized by the caller's schema.
 */
export async function createLoginToken(
  venueId: string,
  email: string,
): Promise<string> {
  const raw = generateOpaqueToken();
  await db.insert(customerLoginTokens).values({
    venueId,
    email,
    tokenHash: hashToken(raw),
    expiresAt: new Date(Date.now() + LOGIN_TOKEN_TTL_MS),
  });
  return raw;
}

/**
 * Atomically consume a magic-link token: DELETE … RETURNING makes it single-use
 * even under a concurrent double-click (only one caller gets the row). Returns
 * the (venue, email) it was minted for, or null if unknown/expired.
 */
export async function consumeLoginToken(
  rawToken: string,
): Promise<{ venueId: string; email: string } | null> {
  const trimmed = rawToken.trim();
  if (trimmed.length === 0) return null;

  const [row] = await db
    .delete(customerLoginTokens)
    .where(eq(customerLoginTokens.tokenHash, hashToken(trimmed)))
    .returning({
      venueId: customerLoginTokens.venueId,
      email: customerLoginTokens.email,
      expiresAt: customerLoginTokens.expiresAt,
    });

  if (!row) return null;
  if (row.expiresAt.getTime() < Date.now()) return null; // expired (already deleted)
  return { venueId: row.venueId, email: row.email };
}

/**
 * Create a session for a customer at a venue and set the httpOnly cookie. MUST
 * run in a Route Handler or Server Action (Next 16 forbids cookie writes during
 * RSC render). The raw token lives only in the cookie; its hash is stored.
 */
export async function createCustomerSession(
  customerId: string,
  venueId: string,
): Promise<void> {
  const raw = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.insert(customerSessions).values({
    customerId,
    venueId,
    sessionTokenHash: hashToken(raw),
    expiresAt,
  });

  (await cookies()).set(CUSTOMER_SESSION_COOKIE, raw, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

/**
 * Sign the customer out: delete the current session row (by hashed token) and
 * clear the cookie. Safe no-op when signed out. MUST run in a Server Action or
 * Route Handler.
 */
export async function destroyCustomerSession(): Promise<void> {
  const store = await cookies();
  const raw = store.get(CUSTOMER_SESSION_COOKIE)?.value;
  if (raw) {
    await db
      .delete(customerSessions)
      .where(eq(customerSessions.sessionTokenHash, hashToken(raw)));
  }
  store.delete(CUSTOMER_SESSION_COOKIE);
}
