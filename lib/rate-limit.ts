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
  // The SAME two dimensions again, applied at the magic-link send itself
  // (lib/auth-send-limit.ts, called from sendVerificationRequest) so a direct
  // POST to /api/auth/signin/resend cannot walk past the form's gate — audit S2.
  // Deliberately LOOSER than the pair above: the form path consumes a token from
  // both pairs per attempt, so the strict gate trips first and the owner gets the
  // friendly inline error instead of an Auth.js error redirect. These bite only
  // on the bypass path. Separate prefixes keep the two counts from merging.
  authSendEmail: { limit: 8, window: "15 m", prefix: "rl:auth:send:email" },
  authSendIp: { limit: 45, window: "1 h", prefix: "rl:auth:send:ip" },
  // AI (cost-protection — each call is real Anthropic spend). Keyed on venue.
  aiImport: { limit: 10, window: "1 h", prefix: "rl:ai:import" }, // vision (costliest)
  aiCopy: { limit: 30, window: "1 h", prefix: "rl:ai:copy" }, // descriptions (cheap)
  // SEO/AEO audit (owner-initiated Haiku call with a chunkier input than
  // aiCopy). Over-limit runs still persist a deterministic-only audit.
  aiSeoAudit: { limit: 6, window: "1 h", prefix: "rl:ai:seo" },
  // AI-visibility probes: six grounded Gemini calls per run, so a run is the
  // costliest owner-initiated AI action — tight per-venue cap.
  aiVisibility: { limit: 3, window: "1 h", prefix: "rl:ai:visibility" },
  // CONCIERGE (diner-facing "prompt to eat" — real Anthropic spend + abusable
  // from the public storefront). Keyed per venue+IP so one diner can't spam a
  // venue's concierge. Independent of the future fair-use cap (canUseConcierge).
  aiConcierge: { limit: 15, window: "1 h", prefix: "rl:ai:concierge" },
  // SUPPORT CHAT (owner-facing, proxied to the Foundry agents service — each
  // turn is real model spend on the Foundry side). Keyed per venue+user.
  aiSupport: { limit: 30, window: "1 h", prefix: "rl:ai:support" },
  // CHECKOUT (moderate — stop junk-order floods, tolerate payment retries).
  checkoutIp: { limit: 20, window: "1 m", prefix: "rl:checkout:ip" },
  // Agent-commerce MCP endpoint: public read tools for AI agents. Generous —
  // an agent reads a menu in a few calls — but bounded per IP.
  mcpIp: { limit: 120, window: "1 m", prefix: "rl:mcp:ip" },
  // TABLE BOOKINGS (public, unauthenticated, and every accepted one sends TWO
  // emails — the diner's confirmation and the owner's alert). So this is really
  // an inbox-spam gate, not a load gate, and it is tighter than checkout for
  // that reason. An hour window rather than a minute: a person books once, and a
  // burst of bookings from one IP is far more likely to be abuse than a rush.
  bookingIp: { limit: 6, window: "1 h", prefix: "rl:booking:ip" },
  // Phone agent turns per CALLER number: every turn is a model call and the
  // finish is an SMS. A real caller speaks a handful of times per call.
  voiceCaller: { limit: 40, window: "1 h", prefix: "rl:voice:caller" },
  // Anonymous diner push opt-in on the order page: keyed by IP.
  pushIp: { limit: 20, window: "1 h", prefix: "rl:push:ip" },
} as const;

export type RateLimitName = keyof typeof CONFIG;

// Built lazily per name and cached. An in-memory ephemeral cache lets an already
// over-limit (hot) key short-circuit without a Redis round-trip per instance.
//
// ONE CACHE PER LIMITER, never shared. @upstash/ratelimit keys its ephemeral
// cache by the bare identifier (the IP or email), NOT by the limiter's prefix,
// so a single Map shared across limiters meant an identifier blocked by one
// limiter was refused by every other limiter on that instance: a burst of
// sign-in attempts from an IP blocked that IP's checkout, and menu imports
// blocked AI copy. Each limiter now remembers only its own blocks.
const limiters = new Map<RateLimitName, Ratelimit>();
const ephemeralCaches = new Map<RateLimitName, Map<string, number>>();

function ephemeralCacheFor(name: RateLimitName): Map<string, number> {
  const existing = ephemeralCaches.get(name);
  if (existing) return existing;
  const created = new Map<string, number>();
  ephemeralCaches.set(name, created);
  return created;
}

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
    ephemeralCache: ephemeralCacheFor(name),
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
 * trusted hop and its headers are authoritative.
 *
 * Order of trust, MOST-SPECIFIC FIRST (audit S3). This used to read the left-most
 * hop of `x-forwarded-for` first, and that is the one header here a client can
 * influence: XFF is a comma-joined chain that proxies APPEND to, so a request
 * arriving with its own `X-Forwarded-For: 1.2.3.4` can leave an attacker-chosen
 * value sitting left-most. Every per-IP limit — checkout floods, concierge and
 * support (real model spend), and both magic-link gates — is only as good as this
 * function, and rotating a spoofed value defeats all of them at once.
 *
 *  - `x-vercel-forwarded-for`: set by Vercel's edge from the connecting socket
 *    and not derived from anything the client sent. Present on every request in
 *    production, so in practice this is the value used.
 *  - `x-real-ip`: also edge-set, single-valued (no chain to prepend to).
 *  - first (left-most) hop of `x-forwarded-for`: kept for LOCAL DEVELOPMENT and
 *    any non-Vercel host, where the two above do not exist. Reached only when
 *    they are absent, so the spoofable path is no longer the primary one.
 *  - `cf-connecting-ip`: last resort (Cloudflare's proxy is no longer in front,
 *    so this is normally absent; kept in case the proxy is re-enabled).
 *  - "unknown": never crash; collapses unknown-IP traffic into one bucket.
 *
 * Reordering is safe on any host: the Vercel headers simply do not exist
 * elsewhere, so off-platform behaviour is unchanged.
 *
 * Accepts anything header-like (Headers / Next's ReadonlyHeaders) so it can be
 * called with `await headers()` directly from a server action or route handler.
 */
/**
 * Trim, and treat a blank header as absent. A present-but-empty header would
 * otherwise short-circuit the ladder and collapse every caller into one bucket.
 */
function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function clientIpFromHeaders(h: {
  get(name: string): string | null;
}): string {
  return (
    nonEmpty(h.get("x-vercel-forwarded-for")) ??
    nonEmpty(h.get("x-real-ip")) ??
    nonEmpty(h.get("x-forwarded-for")?.split(",")[0]) ??
    nonEmpty(h.get("cf-connecting-ip")) ??
    "unknown"
  );
}
