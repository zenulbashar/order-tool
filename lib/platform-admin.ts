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
  const allowlist = (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
  if (allowlist.length === 0) notFound();

  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email || !allowlist.includes(email)) notFound();

  return { email };
}
