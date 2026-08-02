import {
  checkRateLimit,
  emailKey,
  type RateLimitResult,
} from "@/lib/rate-limit";

/**
 * Rate limit at the magic-link SEND choke point (audit S2).
 *
 * `app/signin/actions.ts` already limits the owner sign-in form, but that is the
 * wrappable trigger, not the only one: Auth.js also exposes the Resend provider
 * directly at `POST /api/auth/signin/resend`, and the CSRF token it wants is
 * freely fetchable from `/api/auth/csrf`. So the form limiter could be walked
 * straight past, and the previous comment in that action said as much — it
 * declared the bypass "the edge's job by design". That left inbox-flooding and
 * account probing dependent on edge configuration this repo does not own or
 * assert. This closes it in the app.
 *
 * `sendVerificationRequest` is the right seam because EVERY path that mails a
 * link goes through it — the form action, a direct POST, and anything Auth.js
 * adds later.
 *
 * ## Why its own buckets, and why looser
 *
 * The form path consumes one token from `authEmail`/`authIp` in the action and
 * would then consume another here, halving the effective limit for legitimate
 * owners. So this uses SEPARATE buckets, set deliberately looser: the strict
 * gate in the action always trips first, and the owner gets its friendly inline
 * message rather than an Auth.js error redirect. These only bite on the bypass
 * path — where no friendly message is possible anyway, because the caller is not
 * using the form.
 *
 * Both limiters fail OPEN (unconfigured store, Redis error, or a slow call past
 * the 1s timeout all return success) — same posture as every other limiter here.
 * A limiter outage must not lock owners out of their own dashboard.
 */
export class SignInRateLimitError extends Error {
  constructor() {
    // Surfaced through Auth.js's error redirect, so it says nothing about
    // whether the address exists — only that too many were requested.
    super("Too many sign-in emails requested. Please wait and try again.");
    this.name = "SignInRateLimitError";
  }
}

type Checker = (
  name: "authSendIp" | "authSendEmail",
  identifier: string,
) => Promise<RateLimitResult>;

/**
 * Throw when this send is over either limit. Keyed two ways for the same reason
 * the form gate is: one IP must not be able to spam many inboxes, and one inbox
 * must not be floodable from many IPs.
 *
 * `identifier` is the already-normalised address (the provider's
 * `normalizeIdentifier` runs first), so the hashed key matches across attempts.
 * `check` is injectable purely so this is unit-testable without Redis.
 */
export async function guardSignInSend(
  identifier: string,
  ip: string,
  check: Checker = checkRateLimit,
): Promise<void> {
  const [ipLimit, emailLimit] = await Promise.all([
    check("authSendIp", ip),
    check("authSendEmail", emailKey(identifier)),
  ]);
  if (!ipLimit.success || !emailLimit.success) {
    throw new SignInRateLimitError();
  }
}
