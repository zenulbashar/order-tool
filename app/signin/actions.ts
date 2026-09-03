"use server";

import { headers } from "next/headers";

import { signIn } from "@/lib/auth";
import { checkRateLimit, clientIpFromHeaders, emailKey } from "@/lib/rate-limit";
import { safeReturnPath } from "@/lib/url";
import { normalizeEmail } from "@/lib/validation";

export type OwnerSignInState = { error: string | null };

/**
 * Owner magic-link sign-in, wrapped with the SAME auth limiters as the customer
 * flow (per-IP + per-email) so the owner inbox and sign-in probing get the same
 * app-level protection.
 *
 * This limiter is the UX gate, not the whole control. A direct POST to the
 * Auth.js /api/auth/signin/resend route skips this action entirely, and an
 * earlier revision of this comment called that "the edge's job by design" — it
 * left inbox-flooding dependent on edge configuration this repo neither owns nor
 * asserts. Audit S2. The send itself is now limited in lib/auth.ts's
 * sendVerificationRequest (see lib/auth-send-limit.ts), on separate, looser
 * buckets so THIS gate still trips first and the owner gets the inline error
 * below rather than an Auth.js error redirect.
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
  // NFKC here too: it is what normalizeEmail returns on the success path, so a
  // rejected address cannot mint a fresh rate-limit bucket per homoglyph spelling.
  let normalized = rawEmail.normalize("NFKC").trim().toLowerCase();
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

  // Land where the visitor was headed (the invite link's callbackUrl), never
  // anywhere off-site: the form value is client-controlled, so it is reduced to
  // a same-origin path first.
  await signIn("resend", {
    email: rawEmail,
    redirectTo: safeReturnPath(formData.get("callbackUrl")),
  });
  // signIn redirects on success, so this is unreachable; it satisfies the type.
  return { error: null };
}
