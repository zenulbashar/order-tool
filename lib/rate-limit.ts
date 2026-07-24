import { createHash } from "node:crypto";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Server-only application-level rate limiting — defense-in-depth IN FRONT of the
 * sensitive / cost-bearing / abusable endpoints (auth-email, the AI calls, and
 * order placement). It is the SECOND line behind the edge (Cloudflare / Vercel),
 * catching abuse that is lower-volume, distributed, or passes the edge. It is a
 * GATE only: it allows or rejects a request based on a shared-store counter and
 * NEVER changes any business / money logic.
 *
 * Serverless functions do not share memory (each request may hit a different
 * instance), so an in-memory counter cannot rate-limit — a SHARED store is
 * required. We use Upstash Redis via its purpose-built rate-limit SDK.
 *
 * Two contracts, both deliberate:
 *
 *  1. LAZY INIT — the Redis client is constructed on first use, not at module
 *     load: nothing reads UPSTASH_* at import time, so `next build` / `tsc` /
 *     `eslint` all run with NO env present. Same contract as getStripe()
 *     (lib/stripe.ts), getAnthropic() (lib/anthropic.ts), and the Neon pool
 *     (lib/db/index.ts).
 *
 *  2. FAIL-OPEN — the limiter must never become its own denial-of-service
 *     against legitimate users. If the store is unconfigured (missing env),
 *     unreachable, slow, or errors, the request is ALLOWED. checkRateLimit()
 *     returns `success: true` on the allow path AND on every failure path, so a
 *     Redis blip can never 500 a request or block checkout / sign-in. Callers
 *     reject ONLY when `success === false` (the store actively said over-limit).
 */

/* -------------------------------------------------------------------------- */
/* Lazy Upstash client (fail-open when unconfigured)                          */
/* -------------------------------------------------------------------------- */

let redis: Redis | null = null;
// Distinguishes "not yet resolved" from "resolved, absent" so a missing env is
// only logged-as-absent once and never re-read on every call.
let redisResolved = false;

function getRedis(): Redis | null {
  if (redisResolved) return redis;
  redisResolved = true;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  // No store configured -> null -> every check fails open (no limiting). This is
  // acceptable in dev / preview; the limit matters in prod, where the env is set.
  redis = url && token ? new Redis({ url, token }) : null;
  return redis;
}

/* -------------------------------------------------------------------------- */
/* Limiter registry — one sliding window per concern                          */
/*                                                                            */
/* Sliding window is the sensible default: it is smooth and avoids the         */
/* double-burst a fixed window allows at the boundary. The Redis key namespace  */
/* is the per-limiter `prefix` + the server-derived identifier passed to        */
/* checkRateLimit (e.g. `rl:auth:email:<sha256>`, `rl:ai:import:<venueId>`,     */
/* `rl:checkout:ip:<ip>`).                                                      */
/* -------------------------------------------------------------------------- */

const CONFIG = {
  // AUTH / EMAIL (strictest — abuse = inbox spam / account probing). Keyed two
  // ways per request so one IP cannot spam many inboxes and one inbox cannot be
  // spammed from one IP. Shared by the customer magic-link and owner sign-in.
  authEmail: { limit: 5, window: "15 m", prefix: "rl:auth:email" },
  authIp: { limit: 30, window: "1 h", prefix: "rl:auth:ip" },
  // AI (cost-protection — each call is real Anthropic spend). Keyed on venue.
  aiImport: { limit: 10, window: "1 h", prefix: "rl:ai:import" }, // vision (costliest)
  aiCopy: { limit: 30, window: "1 h", prefix: "rl:ai:copy" }, // descriptions (cheap)
  // SEO/AEO audit (owner-initiated Haiku call with a chunkier input than
  // aiCopy). Over-limit runs still persist a deterministic-only audit.
  aiSeoAudit: { limit: 6, window: "1 h", prefix: "rl:ai:seo" },
  // CONCIERGE (diner-facing "prompt to eat" — real Anthropic spend + abusable
  // from the public storefront). Keyed per venue+IP so one diner can't spam a
  // venue's concierge. Independent of the future fair-use cap (canUseConcierge).
  aiConcierge: { limit: 15, window: "1 h", prefix: "rl:ai:concierge" },
  // SUPPORT CHAT (owner-facing, proxied to the Foundry agents service — each
  // turn is real model spend on the Foundry side). Keyed per venue+user.
  aiSupport: { limit: 30, window: "1 h", prefix: "rl:ai:support" },
  // CHECKOUT (moderate — stop junk-order floods, tolerate payment retries).
  checkoutIp: { limit: 20, window: "1 m", prefix: "rl:checkout:ip" },
} as const;

export type RateLimitName = keyof typeof CONFIG;

// Built lazily per name and cached. An in-memory ephemeral cache lets an already
// over-limit (hot) key short-circuit without a Redis round-trip per instance.
const limiters = new Map<RateLimitName, Ratelimit>();
const ephemeralCache = new Map<string, number>();

function getLimiter(name: RateLimitName): Ratelimit | null {
  const cached = limiters.get(name);
  if (cached) return cached;

  const client = getRedis();
  if (!client) return null; // unconfigured -> fail open

  const config = CONFIG[name];
  const limiter = new Ratelimit({
    redis: client,
    limiter: Ratelimit.slidingWindow(config.limit, config.window),
    prefix: config.prefix,
    // If Redis is slow, .limit() resolves to success:true after `timeout` ms —
    // a built-in fail-open that also bounds the latency the gate can ever add.
    timeout: 1000,
    ephemeralCache,
    // Keep it lean: no analytics writes back to Redis.
    analytics: false,
  });
  limiters.set(name, limiter);
  return limiter;
}

/* -------------------------------------------------------------------------- */
/* The helper                                                                  */
/* -------------------------------------------------------------------------- */

export type RateLimitResult = {
  /** true on allow AND on every fail-open path; false ONLY when over-limit. */
  success: boolean;
  remaining: number;
  /** Unix ms when the window resets (0 on the fail-open paths). */
  reset: number;
};

/**
 * Check `identifier` against the named limiter. Wrapped so a limiter / store
 * error never propagates: any throw (and an unconfigured store) returns
 * `success: true` (FAIL-OPEN). The caller rejects only when `success === false`.
 */
export async function checkRateLimit(
  name: RateLimitName,
  identifier: string,
): Promise<RateLimitResult> {
  try {
    const limiter = getLimiter(name);
    if (!limiter) return { success: true, remaining: 0, reset: 0 };
    const { success, remaining, reset } = await limiter.limit(identifier);
    return { success, remaining, reset };
  } catch {
    // Store unreachable / SDK error — allow rather than block legitimate use.
    return { success: true, remaining: 0, reset: 0 };
  }
}

/* -------------------------------------------------------------------------- */
/* Server-derived key helpers                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Stable key for an email-keyed limit. Hashes the (already validated +
 * normalized) email so raw inboxes are never written as Redis keys and a key can
 * never disclose an address. Pass the normalized (lower-cased) email.
 */
export function emailKey(normalizedEmail: string): string {
  return createHash("sha256").update(normalizedEmail).digest("hex");
}

/**
 * Best real client IP. The app is served DIRECTLY by Vercel (prompt2eat.com is
 * DNS-only at Cloudflare — no Cloudflare proxy in front), so Vercel's edge is the
 * trusted hop and its headers are authoritative. Read ONLY proxy-set headers, in
 * order of trust:
 *  - first (left-most) hop of `x-forwarded-for`: Vercel sets this on its edge and
 *    the left-most entry is the real client IP — the primary, trusted source for
 *    this deployment.
 *  - `x-real-ip` / `x-vercel-forwarded-for`: Vercel-set fallbacks if x-forwarded-for
 *    is absent.
 *  - `cf-connecting-ip`: last resort only (Cloudflare's proxy is no longer in front,
 *    so this header is normally absent; kept solely in case the proxy is re-enabled).
 *  - "unknown": never crash; collapses unknown-IP traffic into one bucket.
 *
 * Accepts anything header-like (Headers / Next's ReadonlyHeaders) so it can be
 * called with `await headers()` directly from a server action or route handler.
 */
export function clientIpFromHeaders(h: {
  get(name: string): string | null;
}): string {
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    h.get("x-vercel-forwarded-for") ??
    h.get("cf-connecting-ip") ??
    "unknown"
  );
}
