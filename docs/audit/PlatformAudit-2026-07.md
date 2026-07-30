# Prompt2Eat — Platform Due-Diligence Audit

**Date:** 2026-07-30
**Scope:** Full-stack architecture, security, product, performance, operations
**Commit audited:** `b239743`
**Codebase:** 62,171 LOC (`app/` + `lib/`), 67 pages, 14 API routes, 47 tables, 59 migrations

---

## 1. Verdict

Prompt2Eat is **substantially better engineered than its feature completeness suggests**. The
security-critical paths — pricing, payment confirmation, tenant scoping, order-token issuance —
are built to a standard I would accept at a payments company. The inline documentation is
genuinely exceptional: nearly every non-obvious decision carries a comment explaining the
threat model behind it.

The risk is not code quality. **The risk is that several stated product capabilities do not
exist, and one core piece of infrastructure is mis-configured in a way that silently degrades
order side-effects.**

A due-diligence reader should treat this as a **strong Phase-1 platform with three
production-blocking gaps**, not as a mature multi-tenant SaaS.

### Top risks, ranked

| # | Finding | Severity |
|---|---------|----------|
| F1 | Delivery is sold during onboarding but cannot be fulfilled | **Critical** |
| F2 | Async job engine drains ≤10 jobs/day; retry schedule is 24× mis-tuned | **Critical** |
| F3 | No refund capability anywhere in the product | **Critical** |
| F4 | Staff management and RBAC are entirely unbuilt; venues are single-user | **High** |
| F5 | No observability — no APM, no tracing, zero logging on the money paths | **High** |
| F6 | Storefront is `force-dynamic`: ~8 Postgres queries per diner pageview | **High** |
| F12 | Production migrations auto-apply on merge, ungated, with no backup | **High** |

---

## 2. Two corrections to the audit brief

Before the findings, two premises in the brief do not match the repository:

**2.1 — This does not run on Azure.** The brief asks for Azure cost estimates. `vercel.json`
pins deployment to **Vercel, region `syd1` (Sydney)**, with Neon serverless Postgres, Upstash
Redis, Cloudflare R2, Resend, and Twilio. There is no Azure resource, IaC, or reference in the
repository. Cost modelling in §7 is therefore against the actual stack.

**2.2 — No Zale platform primitive is integrated.** The brief requires integration with Zale
Hosting / DB / AI / Storage / Queue / Functions / Payments. `Zale` appears in the codebase only
as **parent-brand presentation** — the Apps launcher (`app/dashboard/apps/page.tsx:46`), unified
billing copy (`app/dashboard/billing/page.tsx:91`), and the mobile app identifiers
(`au.com.zaleit.prompt2eat.owner`). Every actual platform primitive is a third-party SaaS.

This is not necessarily wrong — but the *portability* question matters, and the answer is
mostly encouraging. See §6.

---

## 3. What is genuinely strong

These are load-bearing and must not be regressed. Credit where due:

**3.1 Server-authoritative pricing.** `app/[slug]/checkout/actions.ts` recomputes every total
from live, venue-scoped DB rows. The client's price is never trusted; every item, variant, and
modifier id is re-validated; variant-priced items *require* a variant and flat-priced items
*reject* one (`:273-293`). Modifier rules are enforced server-side. This closes the single most
exploited vulnerability class in online food ordering.

**3.2 Stripe webhook discipline.** `app/api/stripe/webhook/route.ts` reads the raw body before
any parsing, verifies the signature on every request, **fails closed when the secret is absent**,
resolves orders only by `stripe_payment_intent_id`, and achieves idempotency through a
`status = 'pending_payment'` guard with `.returning()` to fire notifications exactly once. This
is the correct pattern.

**3.3 Tenant scoping as an explicit gate.** `lib/tenant.ts` never queries a venue *by* the
client-supplied cookie id. It loads the user's own membership set and matches the cookie against
it (`:141-146`), so a forged cookie cannot widen access. Admin impersonation is the one path
outside memberships and is re-gated on a live allowlist check on every resolve — revocation takes
effect on the next request, mid-session.

**3.4 Order tokens.** 192 bits of `randomBytes` (`checkout/actions.ts:60`), looked up scoped to
the venue (`order/[token]/page.tsx:249`) — never by sequential id.

**3.5 Outbox pattern.** `lib/integrations/dispatch.ts` uses `UNIQUE (order_id, provider, kind)`
+ `ON CONFLICT DO NOTHING` for idempotent enqueue and a guarded `UPDATE … RETURNING` for atomic
claim, so overlapping processors never double-run a job. The design is right — only its
*scheduling* is broken (F2).

**3.6 Index coverage.** `orders_venue_status_created_idx` covers the dashboard hot path;
`orders_public_token_idx` and `orders_payment_intent_idx` cover the lookup paths. 51 indexes
across 47 tables, with composites where they matter.

**3.7 Admin actions are audited.** Every platform-admin console action, including
`open_as_venue` / `exit_as_venue` impersonation, writes an append-only `platform_audit_log` row
(`app/admin/actions.ts:68`).

---

## 4. Critical findings

### F1 — Delivery is sold during onboarding but cannot be fulfilled

- **Severity:** Critical
- **Category:** Product correctness / merchant trust
- **Evidence:**
  - `lib/db/schema.ts:1021` — `orderType = pgEnum("order_type", ["pickup", "dine_in"])`. There is
    no `delivery` member.
  - `lib/db/schema.ts:314` — `offersDelivery: boolean("offers_delivery")` exists on `venues`.
  - `app/onboarding/service/actions.ts:30,41` — onboarding **collects and persists** the flag.
  - Tracing every read: `offersDelivery` is referenced only in `onboarding/service/*` (the form
    that writes it and reads it back). **It is never read by the storefront, checkout, or order
    placement.**
  - `app/onboarding/service/actions.ts:32` — validation requires only that *one* of dine-in /
    takeaway / delivery is selected.
  - No delivery address, delivery fee, delivery zone, radius, or driver-dispatch column exists in
    any of the 47 tables or 59 migrations.
- **Root cause:** The onboarding wizard was built against the intended product surface; the
  ordering domain was built against the shipped surface. No integration test spans the two, so
  the contradiction is invisible to CI.
- **Business impact:** A merchant who selects **delivery only** completes onboarding, connects
  Stripe, publishes a storefront — and that storefront can accept **zero orders**. This is a
  silent, total activation failure for an entire merchant segment, discovered only after the
  merchant has invested setup effort. Delivery is table stakes for the competitive set named in
  the brief.
- **Technical impact:** Adding delivery is not additive to the enum alone — it requires address
  capture and validation, fee calculation, zone/radius modelling, driver or aggregator dispatch,
  delivery-time estimation, and a fulfilment state machine distinct from
  `new → preparing → ready → completed`.
- **Recommended implementation:**
  1. *Immediately* (hours): remove the delivery checkbox from
     `app/onboarding/service/service-form.tsx` and require ≥1 of the two **shipped** modes. This
     stops the active harm and is backward-compatible — the column stays.
  2. Then build delivery as its own tracked epic: extend `order_type`, add
     `order_delivery_details` (address, lat/lng, fee, quoted window, driver ref), extend the
     fulfilment enum with `out_for_delivery`, and integrate a dispatch provider.
- **Migration strategy:** Step 1 is UI-only, zero migration. Step 2 adds an enum value
  (`ALTER TYPE … ADD VALUE` is non-blocking in PG12+) plus a new nullable-FK table — additive,
  no existing row altered.
- **Dependencies:** Address validation/geocoding; a dispatch partner.
- **Effort:** Step 1 — **0.5 day**. Step 2 — **6–10 engineer-weeks**.
- **Priority:** P0 for step 1 (today). Step 2 is a roadmap epic.
- **Customer impact:** Diners at delivery-expecting venues currently have no path to order.
- **Operational impact:** Removes a support-ticket class that is currently unanswerable.

---

### F2 — The async job engine is scheduled 1,440× slower than it is designed for

- **Severity:** Critical
- **Category:** Reliability / data integrity
- **Evidence:**
  - `vercel.json` — `{"path": "/api/jobs/integrations", "schedule": "0 3 * * *"}` → **once daily
    at 03:00**.
  - `app/api/jobs/integrations/route.ts:20` — the handler's own contract documents *"Invoked
    **every minute** by Vercel Cron (vercel.json)"*. The code and its configuration disagree.
  - `app/api/jobs/integrations/route.ts:17,38` — `BATCH_SIZE = 10`, and the handler processes
    **one batch per invocation** (`processDueJobs(BATCH_SIZE)`) with no loop.
  - `lib/integrations/dispatch.ts:69` —
    `BACKOFF_SECONDS = [60, 300, 1_800, 7_200, 43_200]`, `MAX_ATTEMPTS = 6`.
  - `lib/integrations/dispatch.ts:73` — `SWEEP_WINDOW_MS = 24h`. Identical constants in
    `lib/stock/depletion.ts:34`, `lib/loyalty/earn.ts:25`, `lib/loyalty/redeem.ts:20`,
    `lib/giftcards/redeem.ts:22`.
- **Root cause:** The engine was designed for a minute-cadence trigger — every constant in it
  assumes one — but `vercel.json` schedules it daily. The most likely explanation is a
  cron-frequency constraint on the deployment plan at the time (Vercel has historically limited
  cron frequency on lower tiers); whatever the reason, the schedule changed and the constants
  that depend on it were not revisited. The mismatch between the handler's own doc comment and
  its configuration is the tell.
- **Consequences, precisely:**
  1. **Throughput ceiling of 10 jobs/day via cron.** Any venue with a Square integration and
     more than 10 orders/day accumulates permanent backlog on the cron path.
  2. **Retry backoff is meaningless.** A job that fails schedules `nextAttemptAt = +60s`, but
     nothing runs for ~24h. The intended ~15-hour exhaustion of 6 attempts becomes **~6 days**.
  3. **Zero margin on the sweep.** `SWEEP_WINDOW_MS` (24h) exactly equals the cron period. The
     backstop that re-derives missed jobs looks back precisely as far as the gap between runs. A
     single missed, failed, timed-out, or 503'd run (`CRON_SECRET` unset returns 503) means the
     orders in that gap are **never swept** — their POS mirror, stock depletion, loyalty accrual,
     and gift-card redemption are permanently lost, silently.
  - Mitigating: the Stripe webhook's `after()` kick (`webhook/route.ts:85`) handles the happy
    path immediately, so this degrades *failure recovery*, not first-attempt delivery. That is
    why it has not been noticed.
- **Business impact:** Silent, unreconcilable divergence between Prompt2Eat and the merchant's
  POS, stock, and loyalty ledgers. Loyalty points not credited and gift-card balances not
  redeemed are direct customer-facing money errors.
- **Technical impact:** The outbox's "guarantee rather than best effort" contract — stated in
  `dispatch.ts:135-138` — does not currently hold.
- **Recommended implementation:**
  1. **Today:** set `SWEEP_WINDOW_MS = 72h` in all five modules. Sweeps are idempotent
     (`ON CONFLICT DO NOTHING`), so widening the window is free and instantly restores margin.
  2. **This week:** raise cron to `* * * * *` (requires Vercel Pro) and correct the doc comment;
     or move to a durable queue (QStash/Inngest) with the webhook as producer.
  3. **This week:** loop `processDueJobs` until the batch returns empty or `maxDuration` nears,
     so a backlog drains within one invocation instead of over days.
- **Migration strategy:** All three are constant/config changes. No schema migration. Fully
  backward-compatible — the jobs table and claim semantics are untouched.
- **Dependencies:** Vercel Pro for minute crons, or a queue provider.
- **Effort:** Step 1 — **1 hour**. Steps 2–3 — **2–3 days**.
- **Priority:** P0.
- **Customer impact:** Loyalty and gift-card balances become correct and timely.
- **Operational impact:** Eliminates a class of silent divergence that is currently invisible —
  there is no alerting on it (see F5).

---

### F3 — There is no refund capability

- **Severity:** Critical
- **Category:** Payments / operations / compliance
- **Evidence:** Searching `lib/` and `app/` for refund logic returns only: a reserved-seam
  comment (`lib/db/schema.ts:1308`, `'refund_mirror'`), Terms copy (`app/terms/page.tsx:52`), and
  **gift cards used as the documented workaround** — `app/dashboard/gift-cards/page.tsx:13`
  describes issuing stored value for "comps, refunds, promos", and the UI placeholder is literally
  `"e.g. refund for order A1B2"` (`gift-cards-client.tsx:58`). No Stripe refund call exists. No
  `refunds` table exists. `order_status` has no refunded state.
- **Root cause:** Refunds were deferred; gift cards shipped first and absorbed the use case.
- **Business impact:** A merchant cannot refund a diner from the product. Their only real option
  is the Stripe Dashboard, which leaves the Prompt2Eat order record, stock depletion, and loyalty
  accrual **inconsistent with the actual money movement**. Consumer law in most jurisdictions
  (including Australian Consumer Law, given the syd1 footprint) requires refunds for undelivered
  or unfit goods; the platform cannot service that obligation. Substituting a gift card for a
  legally-required cash refund is not compliant.
- **Technical impact:** Without a refund record, reconciliation between Stripe balance and
  platform order data cannot be automated — a blocker for the ledger/reconciliation capability
  the brief requires.
- **Recommended implementation:** Add a `refunds` table (order FK, amount, reason, actor,
  `stripe_refund_id`, status); a dashboard action calling `stripe.refunds.create` with an
  idempotency key; handle `charge.refunded` / `charge.refund.updated` webhooks; add `refunded` /
  `partially_refunded` to the order lifecycle; and compensate loyalty accrual and stock depletion
  on refund.
- **Migration strategy:** New table + additive enum values. Existing orders unaffected.
- **Dependencies:** F2 (compensation runs through the job engine).
- **Effort:** **2–3 engineer-weeks** including partial refunds and reconciliation.
- **Priority:** P0.
- **Customer impact:** Diners can be made whole without a manual out-of-band process.
- **Operational impact:** Removes the highest-friction current support workflow.

---

## 5. High-severity findings

### F4 — Staff management and RBAC are entirely unbuilt

- **Severity:** High
- **Category:** Product gap / access control / business continuity
- **Evidence:**
  - `lib/db/schema.ts:346` — `memberRole = pgEnum("venue_role", ["owner", "staff"])` exists.
  - **`venue_members` has exactly one write in the entire codebase:**
    `app/onboarding/details/actions.ts:122`, inserting the creator as `owner`. There is no
    invite, no member list, no role change, no removal.
  - **`role` is never read for an authorization decision anywhere.** The only function named for
    it — `requireOwner()` at `app/dashboard/gift-cards/actions.ts:29` — checks session presence
    and resolves a venue. It never inspects `role`. The name is misleading.
- **Root cause:** The membership table was modelled ahead of the feature; the gate was named
  aspirationally.
- **Business impact:** A venue is **permanently a single-user account**. A restaurant cannot give
  its manager or kitchen staff access — a baseline expectation for every competitor named in the
  brief. Worse, **if the owner loses access to their email, the venue is unrecoverable**: magic
  link is the only auth factor (`lib/auth.ts`), and no second person can ever hold access. That
  is a business-continuity defect, not just a missing feature.
- **Technical impact:** When staff accounts are added, the absence of role checks means any
  member row grants full owner powers, including Stripe and billing surfaces. The gap must be
  closed *before* the first invite ships, not after.
- **Recommended implementation:** Ship invites and enforcement together, never separately.
  Add `venue_invitations` (email, role, token hash, expiry); a members settings page; and a real
  `requireVenueRole(venue, ...roles)` helper. Rename the misleading `requireOwner()`. Expand the
  enum beyond two roles — the competitive baseline is closer to owner / manager / staff /
  kitchen / accountant (see §8 for the researched comparison).
- **Migration strategy:** Additive table. Existing `owner` rows already carry the correct role,
  so enforcement is a no-op for current data — deploy the check first, then the invites.
- **Dependencies:** None blocking.
- **Effort:** **2–3 engineer-weeks** for invites + enforcement + settings UI.
- **Priority:** P1 — and a hard prerequisite for any multi-user launch.
- **Customer impact:** Multi-person restaurants become usable.
- **Operational impact:** Eliminates account-recovery escalations that currently have no remedy.

### F5 — No observability

- **Severity:** High
- **Category:** Operations
- **Evidence:** No Sentry, OpenTelemetry, Datadog, or equivalent in `package.json`. No
  `instrumentation.ts`. No alerting configuration. Across all 62,171 LOC of `app/` and `lib/`
  there are **four** logging statements — `lib/shop/feed.ts:185,191,205,410` — and all four sit
  in the marketing shop feed. The payment, order, job-dispatch, and authentication paths contain
  **zero** log statements of any kind.
- **Root cause:** Deferred; Vercel's built-in function logs were treated as sufficient.
- **Business impact:** Every failure mode above — a dropped sweep, a dead integration job, a
  failed refund — is **invisible until a merchant complains**. Mean-time-to-detect is effectively
  the merchant's patience. This is the finding that makes the others dangerous: F2 has probably
  already occurred in production and there is no way to know.
- **Technical impact:** No error aggregation, no latency percentiles, no trace across
  webhook → job → provider. Debugging a specific failed order requires reasoning from DB state.
- **Recommended implementation:** Add Sentry (or equivalent) via `instrumentation.ts` for server
  and edge; instrument the money and job paths first — webhook handler, `placeOrder`,
  `processDueJobs`. Emit a structured metric per job outcome and alert on dead-lettered jobs
  (`attempts >= MAX_ATTEMPTS`) and on any sweep that finds a non-zero backlog.
- **Migration strategy:** Purely additive; no schema or behaviour change.
- **Dependencies:** None.
- **Effort:** **3–5 days** for meaningful coverage.
- **Priority:** P0 — arguably do this *first*, since it is how you verify every other fix.
- **Customer impact:** Indirect but large — failures get fixed before diners notice.
- **Operational impact:** Transforms the platform from reactive to proactive.

### F6 — The public storefront is fully dynamic: ~8 Postgres queries per pageview

- **Severity:** High
- **Category:** Performance / cost / scalability
- **Evidence:**
  - `app/[slug]/page.tsx:22` and `app/[slug]/menu/page.tsx:19` — both
    `export const dynamic = "force-dynamic"`.
  - `app/[slug]/queries.ts:133` — `getPublicMenu` issues **six** parallel queries (categories,
    items, modifier groups, options, tags, variants), plus `getPublicVenueBySlug` and
    `getPublicFaqs`.
  - No `generateStaticParams`, no ISR `revalidate`, no `use cache` on either page.
  - The team clearly knows the technique: recommendations *are* wrapped in `unstable_cache` with
    an hourly TTL (`queries.ts:317-330`). It simply was not applied to the menu.
- **Root cause:** Correctness-first default. `force-dynamic` guarantees a menu edit is instantly
  live — a real requirement (86-ing an item must be immediate).
- **Business impact:** This is the primary obstacle to the brief's "hundreds of thousands of
  restaurants" goal. Menu content changes a few times a day but is re-queried on every view.
  Compute and database cost scale linearly with diner traffic instead of with menu *changes*,
  and Neon connection pressure becomes the binding constraint at peak. Lunch and dinner rushes
  are the platform's traffic profile — sharp, synchronized, twice-daily spikes.
- **Technical impact:** No CDN edge caching for the highest-traffic page. Cold starts land on the
  critical diner path. TTFB is bounded below by a Sydney round-trip to Neon.
- **Recommended implementation:** Adopt tag-based ISR rather than time-based. Cache the menu
  payload under a `venue:{id}:menu` tag; call `revalidateTag` from every menu/hours/availability
  mutation. This preserves instant 86-ing (the reason `force-dynamic` was chosen) while making
  the steady state a static edge hit. Keep genuinely per-request concerns (open/closed state,
  cart) in small client or streamed components.
- **Migration strategy:** Page-by-page, behind a per-venue flag. Roll out to one venue, verify
  86-ing propagates within a second, then widen. Fully reversible by restoring `force-dynamic`.
- **Dependencies:** Every menu mutation path must call `revalidateTag` — audit these together or
  stale menus will ship.
- **Effort:** **1–2 engineer-weeks**.
- **Priority:** P1 — before any significant merchant growth.
- **Customer impact:** Materially faster menu loads; menu speed is on the conversion path.
- **Operational impact:** Decouples infrastructure cost from diner traffic.

---

## 6. Medium findings

### F7 — Tenant isolation is application-level only

`lib/tenant.ts:249` provides `scopedToVenue()` and the codebase applies it with real discipline.
But enforcement is **by convention**: a single query that forgets `.where(scopedToVenue(...))`
silently returns cross-tenant data, and nothing — not the type system, not a test, not the
database — will catch it. With 47 tables and growing, the surface only expands. Postgres RLS
would make isolation a property the database enforces rather than one each developer must
remember. **Effort:** 2–3 weeks. **Priority:** P2, rising with team size. See §8 for the
researched industry position.

### F8 — Test coverage is thin on exactly the wrong paths

15 unit test files, correctly concentrated on money math (`tax`, `order-discount`,
`bank-discount`, `station`, `schedule`, `crypto`, `validation`). But the single E2E spec
(`e2e/smoke.spec.ts`) covers **marketing/SEO pages only**. There is **no end-to-end test of
checkout, payment confirmation, or order placement** — the paths where a defect costs money.
CI (`.github/workflows/ci.yml`) runs typecheck, unit tests, and build; it never exercises a
transaction. **Recommendation:** add a Playwright spec driving cart → checkout → Stripe test
card → webhook → confirmed order, plus a webhook-replay test asserting idempotency.
**Effort:** 1 week. **Priority:** P1.

### F9 — No merchant-side audit log

`platform_audit_log` covers admin-console actions well (§3.7), but **only** those — every writer
is under `app/admin/`. Merchant-side actions are unlogged: price changes, menu edits, hours
changes, order status transitions, gift-card issuance. Combined with impersonation, the gap is
specific: you can prove *that* an admin opened a venue, but not *what they changed inside it*.
For SOC 2 and merchant trust, extend the audit table with a nullable `venue_id` and log
mutations. **Effort:** 1 week. **Priority:** P2.

### F10 — Accessibility gaps with legal exposure

The baseline is better than typical (94 `aria-label`, 109 `role`, 32 `focus-visible`, one raw
`<img>`), but:
- **Zero skip links** across all 67 pages — a clean **WCAG 2.2 Level A** failure (2.4.1 Bypass
  Blocks). Level A is the floor, not the target.
- Only 7 `aria-live` regions in a real-time ordering product. Cart updates, order-status
  transitions, and validation errors must be announced.

**Effort:** 3–5 days for both. **Priority:** P1 — Level A failures carry disproportionate legal
risk relative to fix cost. See §8 for jurisdiction detail.

### F12 — Production migrations auto-apply with no gate and no backup

- **Severity:** High
- **Category:** Deployment / disaster recovery
- **Evidence:** `.github/workflows/ci.yml:54-58` — the `migrate-prod` job runs
  `npm run db:migrate` against `PROD_DATABASE_URL` automatically on every push to `main`.
  - It is gated on **`needs: build` only** — the E2E job is *not* a dependency, so a failing E2E
    suite does **not** block a production schema change.
  - The "additive only" rule is enforced by a **code comment** (`:66-67`), not by tooling.
    `drizzle-kit generate` emits `DROP COLUMN` when a field is removed from the schema, so a
    routine refactor can produce a destructive migration that auto-applies.
  - There is no pre-migration backup step, no GitHub Environment approval rule, and no
    rollback path.
- **Root cause:** Convenience of continuous deployment, with the safety rule documented rather
  than automated.
- **Business impact:** A single merged PR can irreversibly drop production data across 47 tables
  serving live merchants. Combined with F5 (no observability), detection would be delayed.
- **Recommended implementation:** (1) Add a guard step that greps generated SQL for
  `DROP|TRUNCATE|ALTER COLUMN .* TYPE|SET NOT NULL` and fails the job. (2) Put `migrate-prod`
  behind a GitHub Environment with a required reviewer. (3) Add `needs: [build, e2e]`.
  (4) Trigger a Neon branch/snapshot immediately before migrating — Neon branching makes this
  near-instant and is the natural rollback point.
- **Migration strategy:** Workflow-file change only; no application or schema impact.
- **Dependencies:** None.
- **Effort:** **1 day.**
- **Priority:** P1.
- **Customer impact:** None directly — this is pure downside protection.
- **Operational impact:** Converts an unbounded data-loss risk into a reviewed, reversible step.

### F11 — No OpenAPI specification

The brief asks for OpenAPI quality and versioning. Neither exists. The 14 routes are webhooks and
cron endpoints — internal, so this is not yet urgent. But the Zale Marketplace ambition implies
third-party integrators, and that requires a versioned, documented, contract-tested public API.
**Effort:** 1 week for a spec over existing routes. **Priority:** P3 until a public API is
committed to.

---

## 7. Cost and scale (actual stack)

*Populated with researched benchmarks in §8.*

The dominant cost driver is F6: with `force-dynamic`, every diner pageview is a serverless
invocation plus ~8 Neon queries. Fixing F6 converts the majority of storefront traffic into CDN
hits, which is the single highest-leverage cost and scalability action available.

The second constraint is Neon connection pressure under synchronized lunch/dinner spikes. The
`syd1` single-region pin also means every non-Australian diner pays a cross-Pacific round trip on
an uncacheable page — F6 and multi-region are the same fix from the diner's perspective.

---

## 8. Industry comparison

*This section is populated from the cited research pass — see companion research output.*

---

## 9. Roadmap

Each milestone is independently deployable, ≤2 weeks, and backward-compatible.

### M0 — Stop the bleeding (2 days)
- Remove the delivery option from onboarding (F1 step 1).
- Widen `SWEEP_WINDOW_MS` to 72h in all five modules (F2 step 1).
- Correct the false "every minute" comment in the jobs route.
- Add `needs: [build, e2e]` and a destructive-SQL guard to `migrate-prod` (F12 — the two
  cheapest parts; the approval gate and snapshot follow in M1).
- **Tests:** unit test asserting sweep window > cron period; CI test that a `DROP COLUMN`
  migration fails the guard. **Docs:** note the cron/window coupling in the jobs route.

### M1 — See what is happening (1 week)
- Sentry via `instrumentation.ts`; instrument webhook, `placeOrder`, `processDueJobs` (F5).
- Alert on dead-lettered jobs and non-empty sweep backlogs.
- **Tests:** verify a forced job failure produces an alert. **Docs:** runbook.

### M2 — Make the job engine real (1 week)
- Minute cron or durable queue; loop `processDueJobs` until drained (F2 steps 2–3).
- **Tests:** backlog of 100 jobs drains within one invocation.

### M3 — Checkout safety net (1 week)
- Playwright E2E: cart → checkout → test card → webhook → confirmed (F8).
- Webhook replay test asserting idempotency.

### M4 — Refunds (2 weeks)
- `refunds` table, dashboard action, webhook handling, loyalty/stock compensation (F3).

### M5 — Staff and roles (2 weeks)
- `requireVenueRole` enforcement first, then invitations and the members page (F4).
- Rename the misleading `requireOwner()`.

### M6 — Storefront caching (2 weeks)
- Tag-based ISR for menu payloads; `revalidateTag` on every mutation (F6).
- Per-venue rollout flag.
- **Tests:** menu edit propagates in <1s.

### M7 — Accessibility (1 week)
- Skip links; `aria-live` on cart, order status, validation (F10).
- Add `@axe-core/playwright` to CI.

### M8 — Merchant audit log (1 week)
- Extend audit table with `venue_id`; log merchant mutations (F9).

### M9+ — Delivery epic (6–10 weeks)
- Full delivery domain (F1 step 2). Sequenced last because it is the largest, and because M0
  removes the active harm immediately.

---

## 10. Stop condition

Reviewed to exhaustion at the architectural level: all 47 tables, 59 migrations, 14 routes, 67
pages, the auth and tenancy model, the payment and pricing paths, the job engine, caching,
testing, CI, accessibility, and the Zale portability question. Remaining work is depth within the
epics above rather than undiscovered breadth.
