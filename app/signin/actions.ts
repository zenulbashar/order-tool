"use server";

import { headers } from "next/headers";

import { signIn } from "@/lib/auth";
import { checkRateLimit, clientIpFromHeaders, emailKey } from "@/lib/rate-limit";
import { normalizeEmail } from "@/lib/validation";

export type OwnerSignInState = { error: string | null };

/**
 * Owner magic-link sign-in, wrapped with the SAME auth limiters as the customer
 * flow (per-IP + per-email) so the owner inbox and sign-in probing get the same
 * app-level protection. This is the wrappable trigger; a direct POST to the
 * Auth.js /api/auth/signin/resend route bypasses it and is the edge's job
 * (Cloudflare / Vercel) by design — lib/auth.ts is intentionally left untouched
 * so the owner-auth / customer-identity firewall stays stable.
 *
 * On limit we return an error for the form's error slot. Otherwise signIn runs
 * exactly as the previous inline action did — it performs the redirect by
 * throwing, which must propagate. The limiter's try/catch lives entirely inside
 * checkRateLimit, so it never interferes with that NEXT_REDIRECT.
 */
export async function requestOwnerSignIn(
  _prevState: OwnerSignInState,
  formData: FormData,
): Promise<OwnerSignInState> {
  const rawEmail = String(formData.get("email") ?? "");

  // Stable email key. normalizeEmail throws on an obviously invalid address; the
  // fallback keeps the rate-limit path from ever throwing (Auth.js still does
  // the real validation + normalization on the value we hand it below).
  let normalized = rawEmail.trim().toLowerCase();
  try {
    normalized = normalizeEmail(rawEmail);
  } catch {
    // keep the fallback
  }

  const ip = clientIpFromHeaders(await headers());
  const [ipLimit, emailLimit] = await Promise.all([
    checkRateLimit("authIp", ip),
    checkRateLimit("authEmail", emailKey(normalized)),
  ]);
  if (!ipLimit.success || !emailLimit.success) {
    return {
      error:
        "Too many sign-in attempts. Please wait a few minutes and try again.",
    };
  }

  // Unchanged from the previous inline action.
  await signIn("resend", { email: rawEmail, redirectTo: "/" });
  // signIn redirects on success, so this is unreachable; it satisfies the type.
  return { error: null };
}
