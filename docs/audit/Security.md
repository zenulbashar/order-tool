# Security Audit

Scope: authentication, authorization, multi-tenant isolation, IDOR, webhook
verification, input validation, injection/XSS, secrets, rate limiting, session
handling, file uploads. Method: read the auth/tenant helpers, then trace every
server action and route handler that reads/writes venue-owned data.

## Verdict (2026-07 pass): strong. No Critical or High findings.

> **Partly superseded.** A second, adversarial pass in 2026-08 re-tested this
> verdict against the whole repository rather than inheriting it, and found
> **three High** findings this pass missed: S4 (PaymentIntent desync via an
> amount-keyed idempotency key), S5 (all five onboarding server actions gated on
> membership rather than permission), S6 (gift-card bearer codes listed to any
> venue member). All three are fixed — see **SecurityReview-2026-08.md**.
>
> The conclusions below on tenant isolation, webhook verification, platform
> admin and the customer-identity firewall were re-confirmed by that pass and
> still stand. What did not stand was the *scope*: each new finding sits in a
> place where the same control exists correctly a directory away, which is not
> something a per-file read reliably catches.

Tenant isolation is applied uniformly and was verified end-to-end:

- **Tenant gate.** Every owner mutation resolves the venue from the session via
  `requireVenue()` / `getCurrentVenue()` (`lib/tenant.ts`), which selects venues
  **only** from the caller's own `venue_members` rows. Client-supplied venue ids
  are never queried directly; the selected-venue cookie id is only *matched
  against* that set, and the switcher re-checks `isVenueMember` before honoring
  it. Venue-owned reads/writes use `scopedToVenue(...)` **and** the row id, with
  `.returning()` row-count checks on updates.
- **Webhooks.** All four verify signatures on the raw body before processing and
  fail closed when the secret is unset: Stripe order, Stripe billing, Square
  (HMAC + `timingSafeEqual`), and support. Order transitions are idempotent and
  resolved by `stripe_payment_intent_id`, never a sequential id.
- **Platform admin.** Every `app/admin/**` action calls `requirePlatformAdmin()`
  (env allowlist, fail-safe deny, `notFound()` to hide existence, re-checked each
  request — revocation is immediate even mid-impersonation). The job endpoint
  requires `Bearer $CRON_SECRET`.
- **Money path.** `placeOrder` recomputes every total from live venue-scoped DB
  prices, ignores client prices, and creates the PaymentIntent with a
  server-computed amount + fee. The discount path is server-authoritative,
  row-locked, and clamped. Points/gift-card debits are idempotent (`unique(order_id,
  reason)` + `onConflictDoNothing`) and clamped at 0.
- **Customer identity** is firewalled from owner auth, venue-bound, tokens stored
  as SHA-256 hashes; order views use opaque 192-bit tokens.
- **Injection/XSS/secrets.** Queries are parameterized via Drizzle; the few
  `sql` uses bind values/columns only. JSON-LD escapes `<`→`<` before
  `dangerouslySetInnerHTML`; other sinks are machine-generated QR SVGs.
  Integration tokens are AES-256-GCM (versioned); roster SSO uses Ed25519 with a
  60s TTL. Uploads validate content-type + size and use collision-safe keys.

## Findings

### S1 — `setVenueItemPrice` UPDATE not venue-scoped — **Fixed**
Admin-only. The UPDATE matched `itemId` alone (venue checked after the write,
gating only the audit row), contradicting its own comment. A mismatched id could
edit another tenant's price and skip the audit entry. Fix: `venueId` is now part
of the WHERE.

### S2 — Owner magic-link rate-limit bypass — **Fixed**
The sign-in action applied per-IP + per-email limiters, but the NextAuth Resend
provider is reachable directly at `POST /api/auth/signin/resend` (CSRF token is
freely fetchable), bypassing the app limiter — so inbox-flooding and account
probing relied entirely on edge rules this repo neither owns nor asserts. (The
custom *customer* magic-link flow has no equivalent bypass.)

**Fixed (2026-08).** Taken at the send itself rather than at either suggested
seam: `sendVerificationRequest` in `lib/auth.ts` is the ONE point every path that
mails a link goes through — the form action, a direct POST, and anything Auth.js
adds later — so a limit there cannot be walked around. It uses separate, looser
buckets (`authSendEmail` / `authSendIp`) so the form's stricter gate still trips
first and the owner keeps the friendly inline error instead of an Auth.js error
redirect; the new buckets bite only on the bypass path. Fails open like every
other limiter here. See `lib/auth-send-limit.ts`; the guard, its two dimensions,
its hashed key, and the fact that `lib/auth.ts` calls it BEFORE sending are all
pinned by mutation-tested assertions.

### S3 — Left-most `X-Forwarded-For` trust — **Fixed**
`clientIpFromHeaders` (`lib/rate-limit.ts`) takes the left-most XFF entry, which
is attacker-prependable on platforms that append rather than overwrite it →
per-IP limit evasion (checkout floods, concierge/AI cost abuse). Deployment-
dependent and fail-open behind the edge. Fix: derive the client IP from a
proxy-controlled header (e.g. `x-vercel-forwarded-for`) or the right-most hop
after a known trusted-proxy count. **Do not change blindly** — the correct source
depends on the deploy target; verify against the hosting platform first.

**Fixed (2026-08).** The deploy target was established during the 2026-08 review
(Vercel only — `vercel.json`, no Dockerfile, no self-host docs), which is what
made this safe to act on. `clientIpFromHeaders` now reads most-specific-first:
`x-vercel-forwarded-for` → `x-real-ip` → left-most `x-forwarded-for` →
`cf-connecting-ip`. The first two are set by the edge from the connecting socket
and are not derived from anything the client sent; XFF is kept only for local
development and non-Vercel hosts, where neither exists — so the reorder is safe
on any host and changes nothing off-platform. A blank header now counts as absent
rather than short-circuiting the ladder into a single shared bucket. Ordering and
fallbacks are unit-tested and mutation-verified.

## Not covered here
Dependency CVE scan, live pen-test, and secret-scanning of history are out of
static scope — see ReleaseChecklist.md.
