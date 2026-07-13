import "server-only";

import { notFound } from "next/navigation";

import { auth } from "@/lib/auth";

/**
 * Platform-admin gate (Track E). Admins are OPERATORS OF THE PLATFORM — a role
 * above venue owners that no table models — so membership comes from the
 * `PLATFORM_ADMIN_EMAILS` env allowlist (comma-separated, case-insensitive),
 * read lazily per the house env contract. Fail-safe: unset/empty allowlist ⇒
 * nobody is an admin. Layered ON TOP of the normal owner Auth.js session (the
 * identity firewall is untouched — this adds a check, not an identity store).
 *
 * Non-admins get notFound(), not a redirect — the console shouldn't reveal its
 * existence.
 */
export async function requirePlatformAdmin(): Promise<{ email: string }> {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email || !emailIsPlatformAdmin(email)) notFound();

  return { email };
}

/**
 * Non-throwing allowlist check (same rule as requirePlatformAdmin, fail-safe
 * deny). Used where a plain boolean is needed rather than a notFound() — notably
 * the "Open as venue" resolve in lib/tenant.ts, which must fall THROUGH to the
 * normal membership path for a non-admin instead of 404-ing the dashboard. The
 * email is re-checked on every call, so revoking admin access takes effect on
 * the next request even mid-impersonation.
 */
export function emailIsPlatformAdmin(
  email: string | null | undefined,
): boolean {
  const allowlist = (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
  if (allowlist.length === 0) return false;
  const normalized = email?.toLowerCase();
  return Boolean(normalized && allowlist.includes(normalized));
}
