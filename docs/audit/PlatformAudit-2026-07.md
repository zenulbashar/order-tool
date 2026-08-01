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

### Remediation status (updated 2026-08-01)

The first remediation pass shipped alongside this report; a second pass
(M1 — observability) and a third (M2 — job engine) followed the same day.
What changed, per finding:

| Finding | Status | What shipped |
|---|---|---|
| F1 | **Mitigated** (step 1) | Delivery is no longer selectable at onboarding — shown as a disabled "Coming soon" tile; the action ignores the field entirely and pins `offers_delivery = false`; validation requires a shipped mode. The delivery *epic* (M9+) remains open. |
| F2 | **Mitigated** (M2 shipped) | First pass: all five `SWEEP_WINDOW_MS` widened 24h → 72h; cron drains until empty/budget; retry jitter; comment corrected. M2 (third pass): every sweep now anchors to a persisted **`last_swept_at` watermark** (72h stays the floor; an outage longer than it widens the lookback instead of orphaning orders — Vercel's "since the last successful run" contract, §8.4); claims carry a **5-minute lease** with `attempts`-fenced completion writes, so a crashed invocation no longer strands jobs in `processing` forever; the webhook kick and owner retries **drain opportunistically** (~8s budget), making retries run at order cadence; an **opt-in hourly GitHub Actions tick** (`job-tick.yml`) caps worst-case retry latency at ~1h on the Hobby plan. Still open: minute cron (paid Vercel tier) or a durable queue as the mechanism of record. |
| F3 | Open | Refunds epic (M4). |
| F4 | **Partial** | Misleading `requireOwner()` renamed to `requireVenueMemberSession()` with the role-check seam documented. Invites + enforcement remain open (M5). |
| F5 | **Mitigated** (M1 shipped) | Sentry error tracking behind `SENTRY_DSN`, initialised via `instrumentation.ts` (`register` + `onRequestError`, so every server error Next captures is visible). The webhook handler and all its swallowed side effects, `placeOrder`'s previously-silent PaymentIntent failure, and every job-engine failure now report; dead-lettered jobs and non-empty sweep backlogs emit tagged alert events (`alert:integration_job_dead_letter`, `alert:sweep_backlog`). Runbook: `docs/ops/Observability.md`. Open (console-side ops, not code): create the Sentry project/DSN and the two alert rules. Tracing/latency percentiles remain future work. |
| F6 | Open | Tag-based ISR (M6). |
| F10 | **Mitigated** | Global `SkipLink` (first Tab stop on every page; anchors on the shared shells, JS fallback elsewhere); stale "7/8 dialogs" note in `Accessibility.md` corrected — all 8 use `useDialog`. Brand-contrast validation and screen-reader pass remain open (M7). |
| F12 | **Mitigated** | `migrate-prod` now needs `[build, e2e]` and fails on destructive SQL (`DROP`/`TRUNCATE`/type-narrowing guard, verified against all 59 existing migrations). Environment approval + pre-migration Neon snapshot remain open. |
| F7, F8, F9, F11 | Open | Roadmap items M3, M8, and the RLS decision pending §8.1's counter-evidence. |

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
  assumes one — but `vercel.json` schedules it daily. Vercel's cron documentation caps the Hobby
  plan at **once per day**, which almost certainly forced the schedule down; the constants that
  depend on it were then not revisited. The mismatch between the handler's own doc comment and
  its configuration is the tell. *(Plan cap per Vercel docs — see §8.4; evidentiary status noted
  there.)*
- **The platform contract makes this a violation, not merely a mis-tuning.** Vercel's cron
  documentation (§8.4, verified 2-1) states the delivery contract explicitly:

  > *"Cron delivery can also occasionally invoke the same scheduled run more than once. Because of
  > this, cron jobs should be resilient to both missed runs and duplicate runs. Design your
  > operations to be idempotent and reconciliation-based so each run can safely reprocess
  > **outstanding work since the last successful run**."*

  Vercel is explicit that runs get dropped and that a failed invocation is **not retried**. The
  required mitigation is reconciliation with a lookback anchored to the last *successful* run.

  **Prompt2Eat implements the pattern but breaks the property that makes it work.** The sweep is
  genuinely reconciliation-based — that part is right — but `SWEEP_WINDOW_MS` is a fixed 24h,
  which reconciles only since the last *scheduled* run. It has no way to reach back past a run
  that never happened. One dropped invocation and the orders in that gap fall permanently outside
  every subsequent sweep's window.

  Two aggravating details, both corrected during verification (see §8.4):
  - **Hobby crons fire anywhere within the full specified hour**, so consecutive runs can be
    ~23–25h apart against a 24h window — the margin can be negative even when no run is dropped.
  - A dropped run **writes no runtime log for that invocation**. Vercel does not claim the miss is
    undetectable in general — but with no APM and no job-outcome metric (F5), this platform has no
    other means of noticing. *The silence is Prompt2Eat's gap, not Vercel's.*
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
     *Better still, anchor the lookback to the last **successful** sweep — persist a
     `last_swept_at` watermark and reconcile from it — which is what Vercel's contract actually
     asks for. A fixed window is a cheap approximation; a watermark is the correct fix and is
     roughly a day's work.*
  2. **This week:** raise cron to `* * * * *` (requires a paid Vercel tier) and correct the doc
     comment. But treat this as a stopgap: per §8.4 cron has no retry and no delivery guarantee at
     *any* tier, so it should not remain the mechanism of record for money-affecting side effects.
     The durable fix is a queue (QStash, Inngest) with the Stripe webhook as producer.
     **Caveat if adopting QStash:** its *default* retry backoff is `min(86400, e^(2.5n))` seconds
     — 12s, 2m28s, 30m8s, 6h7m, 24h — so the defaults are themselves far outside a kitchen-
     notification SLA. Configure `Upstash-Retries` and a tightened backoff explicitly; do not
     inherit the defaults for order-path work.
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
  `requireVenueRole(venue, ...roles)` helper. Rename the misleading `requireOwner()`.
- **On the target role model — deliberately unspecified, and here is why.** An earlier revision of
  this report recommended a specific shape (editable roles + action-level permissions, one role per
  user) on the strength of Shopify POS documentation. **All three of those claims were refuted in
  verification (§8.3)**, and one was materially wrong: Shopify supports *multiple* roles per user
  with **cumulative** permissions, not one. Toast, Square, Lightspeed and Flipdish were never
  researched. **There is currently no verified competitor baseline in this report, so I am not
  going to invent one.**
  What the evidence *does* support:
  - The product gap is real and rests entirely on repository evidence — it does not depend on any
    competitor claim.
  - If a role model is designed before that research lands, prefer a **many-to-many
    `user ↔ role` join with permission union** over a single-role column. It is strictly more
    general, it is what the one competitor data point we have actually does, and collapsing
    many-to-many to one-role later is far cheaper than the reverse migration.
  - Do **not** simply widen `memberRole` from two values to five. Widening an enum twice is the
    expensive path; a `roles` + `role_permissions` pair costs little more now and avoids it.
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
database — will catch it. With 47 tables and growing, the surface only expands.

The industry position is that convention is not isolation (§8.1). AWS's SaaS Lens states verbatim
that *"getting beyond the entry points of a login screen or an API does not mean you have achieved
isolation"* (**verified 3-0**), and OWASP prescribes database-level isolation as defence in depth
**in addition to** application filtering, explicitly forbidding queries without a tenant filter
(**verified 3-0**). OWASP ranks shared-table row-level tenancy as only *Medium* isolation
(**verified 2-1**).

**But do not read that as "just turn on RLS."** The researched benchmarks (§8.1) show the naive
implementation of *exactly this codebase's pattern* fails outright. Four constraints must hold
together, or the rollout will be worse than the status quo:

1. **Wrap the predicate in a SELECT.** Supabase's benchmark of a tenant-membership lookup — the
   direct analogue of `venue_members` — shows `team_id = ANY(user_teams())` **timing out at over
   two minutes, even with an index present**. Only `team_id = ANY(ARRAY(select user_teams()))`
   reaches 2–3ms. The SELECT wrapper forces an initPlan so the function evaluates once per query
   rather than once per row.
2. **Index the predicate column — but only together with (1).** Supabase's own wording:
   *"Adding an index to team_id is the big win, but only with the second case. Without, the index
   case still times out."* Index and SELECT-wrap are jointly necessary; neither alone is
   sufficient. **(verified 3-0)**
   *An earlier draft of this report cited "171ms → under 0.1ms, over 100×" for indexing alone.
   That claim was **refuted 0-3** in verification and has been removed — do not reinstate it.*
3. **Consider `FORCE ROW LEVEL SECURITY`, not just `ENABLE`.** Plain `ENABLE` leaves the table
   owner exempt, and an app connecting as the owner would get no enforcement while appearing to.
   **Evidentiary status: this was drafted citing OWASP and that attribution was refuted 0-3 — the
   cheat sheet does not say it.** The underlying Postgres behaviour is believed correct but is
   **unverified here**; confirm against the PostgreSQL `CREATE POLICY` / `ALTER TABLE` docs before
   putting it in acceptance criteria. Flagged rather than dropped because, if true, an RLS rollout
   that omits it is silently inert — a high-cost failure worth five minutes of confirmation.
4. **Keep `scopedToVenue()` in every query.** RLS is the backstop, not the filter — Supabase's
   guidance is explicit: *"Do not rely on RLS for filtering but only for security."* **(verified
   3-0)**

**Revised effort:** 4–6 weeks, not 2–3 — the benchmark work and the per-policy correctness review
dominate. **Priority:** P2, rising with team size. Ship it table-by-table behind a verification
harness that asserts cross-tenant reads return zero rows.

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

**Revised after reconciling with the existing in-repo audit** (`docs/audit/Accessibility.md`),
which is substantial and largely superseded my initial read.

**What is already done — more than the raw greps suggested.** A shared `use-dialog.ts` hook gives
every dialog the full ARIA contract (focus into panel on open, Tab trap, Escape, focus restoration
to trigger, scroll lock). `Segmented` implements the WAI-ARIA radiogroup pattern with roving
tabindex. `Field` wires `aria-describedby`/`aria-invalid` to the control. Icon-only buttons require
`aria-label` **at the type level**, so it cannot be forgotten. `StatusBadge` never conveys status
by colour alone. 44px touch targets.

**The prior audit's own open item is stale — it is fixed.** `Accessibility.md:52` records
`dashboard/integrations/detail-drawer.tsx` as the unremediated 8th dialog. It is not: the file now
imports `useDialog` with a router-based close (`:9,:50-52`) — exactly the fix that doc proposed.
Eight files use the hook. **Correct the doc; the work is done.**

**What genuinely remains:**
- **Zero skip links** across all 67 pages — a clean **WCAG 2.2 Level A** failure (2.4.1 Bypass
  Blocks). The prior audit never covered this; its scope was primitives, dialogs, toggles and
  fields. This is a real uncovered gap, not a duplicate.
- **No screen-reader pass** (VoiceOver/NVDA/TalkBack), no real contrast sampling across tenant
  brand colours, no reduced-motion verification. `Accessibility.md:89-93` correctly marks these
  "not statically verifiable" and defers them to `ReleaseChecklist.md` — they are still
  outstanding. **Tenant-brand contrast is the sharpest of these**: venues supply their own
  `--brand`, so a single light brand colour can push an entire storefront below 4.5:1. That is a
  per-tenant failure mode no static audit can catch, and it needs an automated contrast check at
  brand-save time, not a manual pass.

**Effort:** skip links ~1 day; automated brand-contrast validation ~2 days; screen-reader pass ~2
days. **Priority:** P1 for skip links and brand contrast. Jurisdiction detail (WCAG 2.2 AA, EU
EAA, ADA Title III, Australian DDA) was **never researched** — see §8.6.

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

**Incomplete.** The cost and Core-Web-Vitals research (Vercel Active CPU pricing, Neon connection
pooling limits, food-ordering conversion benchmarks) was located but not read before the API limit
was hit — see §8.0 and §8.6. **No costed model is presented here rather than an invented one.**
The reasoning below is architectural and follows from the code alone; the numbers it would need
are the open queue.

The dominant cost driver is F6: with `force-dynamic`, every diner pageview is a serverless
invocation plus ~8 Neon queries. Fixing F6 converts the majority of storefront traffic into CDN
hits, which is the single highest-leverage cost and scalability action available.

The second constraint is Neon connection pressure under synchronized lunch/dinner spikes. The
`syd1` single-region pin also means every non-Australian diner pays a cross-Pacific round trip on
an uncacheable page — F6 and multi-region are the same fix from the diner's perspective.

---

## 8. Industry comparison

### 8.0 Evidentiary status — read this before citing anything below

Verification is now **complete for the claims that were extracted**, across four runs. Final tally
over 25 claims:

| Status | Count |
|---|---|
| **Verified** (survived 3 adversarial refuters) | **10** |
| **Refuted** (majority refuted — corrected or removed below) | **15** |

**The refutation rate is 60%. That is the single most important number in this section.** Every
refuted claim had already been drafted into an earlier revision of this report. None would have
been caught without the adversarial pass.

**Read the refutations correctly.** Most were *not* "the fact is false". They fall into four
groups, and the distinction changes what you do about each:

1. **Attribution wrong, fact right.** e.g. the "foreign state mutations" phase model is from
   Brandur Leach's personal article, not Stripe's blog; the `FORCE ROW LEVEL SECURITY` guidance is
   not in the OWASP cheat sheet. → Fix the citation, keep the engineering.
2. **Scope overstated.** e.g. Stripe idempotency keys apply to POST, not "every mutating
   endpoint"; the PCI SAQ A script criterion applies to *embedded* payment forms, not to redirects.
   → Narrow the claim; sometimes the narrowed version is *more* relevant to this platform, not less.
3. **My derivation presented as documented.** e.g. "≈33 minutes to exhaust QStash's default
   retries" is arithmetic I did, not a published figure. → Mark as derived.
4. **Genuinely wrong.** e.g. "every Shopify POS staff member must be assigned exactly one role" —
   Shopify explicitly supports multiple roles with cumulative permissions. → Delete and rethink
   anything that rested on it.

**Fetch caveat, and it is significant.** `couldFetch=false` on 14 of 15 claims in the final pass —
`help.shopify.com`, `blog.pcisecuritystandards.org`, `stripe.com`, `vercel.com` and
`docs.aws.amazon.com` all return HTTP 403 to this environment's fetcher. Verifiers worked from
exact-phrase search-index retrieval. Verifiers were instructed to refute when they could not
confirm, so **some refutations mean "unconfirmable here", not "false"** — each is labelled below.
A reviewer with unrestricted network access should re-run these; several will likely resolve to
verified.

**Bottom line for external use:** §8.1 (tenant isolation) is the only block I would put in front
of an acquirer as-is. §8.2–8.4 are engineering-grade — good enough to plan from — but every figure
needs a source check first.

### 8.1 Tenant isolation — the position behind F7 · ✅ VERIFIED BLOCK

- **AWS Well-Architected SaaS Lens — verified 3-0.** Verbatim: *"Authentication and authorization
  are not equal to isolation — While it is expected that you will control access to your SaaS
  environments through authentication and authorization, getting beyond the entry points of a
  login screen or an API does not mean you have achieved isolation."*
  → Prompt2Eat's isolation story is a NextAuth session plus a `venue_id` predicate — precisely the
  "entry points" layer AWS says is not isolation.
  **A stronger claim — that AWS prescribes isolation "must not be left to service developers" —
  was drafted here and refuted 1-2. Removed. Do not reinstate.**
- **OWASP Multi-Tenant Security Cheat Sheet — verified 3-0.** *"Do: … Use database-level isolation
  (RLS, schemas) as defense in depth. Include tenant_id in all resource queries, cache keys, and
  storage paths. … Don't: … Allow queries without tenant filters (even for admins without explicit
  override)."*
  → Note the admin clause. `lib/tenant.ts:41` resolves a venue outside the caller's memberships;
  it is allowlist-gated and audited, which is the "explicit override" OWASP contemplates — but it
  is exactly the path that must never lose that gate.
- **OWASP isolation ranking — verified 2-1.** Shared-table row-level isolation rated **Medium**,
  the weakest of three strategies (separate databases = Highest, separate schemas = High), scoped
  to "cost-sensitive, high tenant count" — the 100k+ target profile. Split vote reflects that this
  is a guidance table, not a benchmark.
- **OWASP IDOR failure mode — verified 2-0.** Lookup by resource id alone returns another tenant's
  record. Mitigations: composite `(tenant_id, resource_id)` lookups, enforcement at the
  data-access layer, non-guessable identifiers, **404 rather than 403**.
  → Prompt2Eat already satisfies all four on the order path: `(venue_id, public_token)` composite
  lookup, 192-bit tokens, storefront 404s. The gap is the enforcement *layer*, not the pattern.
- **Supabase RLS benchmarks — verified 3-0.** *"This case times out with over 3 minutes as 1M rows
  must be searched and the function is run each time on 1000 rows. Changing to wrap the function …
  is a big improvement but can still take seconds. Adding an index to team_id is the big win, but
  only with the second case. Without, the index case still times out."* And: *"Do not rely on RLS
  for filtering but only for security."*
  → The `team_id` membership pattern is the direct analogue of `venue_members`. **The most
  operationally important result in §8:** the obvious RLS implementation of Prompt2Eat's exact
  schema does not degrade, it times out.
  **A fourth Supabase claim — indexing alone as the highest-leverage fix — was refuted 0-3 and
  removed.**
- **Counter-evidence still unread:** PlanetScale *"RLS sounds great until it isn't"*, Neon's
  multi-tenancy guidance, AWS Prescriptive Guidance on RLS. **§8.1 remains one-sided in favour of
  RLS.** The verified claims establish that convention-only scoping is below the documented
  baseline and that naive RLS is dangerous. They do **not** establish that RLS is right for this
  platform. F7 should not be scheduled as committed work until the dissenting sources are read.

### 8.2 Payments and PCI · ⚠️ 2 verified, 6 refuted

- **PCI SSC removed Requirements 6.4.3, 11.6.1 and 12.3.1 from SAQ A — verified 3-0.** Verbatim:
  *"Removal of PCI DSS Requirements 6.4.3 and 11.6.1 for payment page security, and Requirement
  12.3.1 for a Targeted Risk Analysis to support Requirement 11.6.1."*
- **Stripe prescribes exponential backoff with randomised jitter — verified 3-0**, to defeat
  thundering-herd retry storms.
  → **Actionable now:** `lib/integrations/dispatch.ts:69` uses a fixed, unjittered
  `BACKOFF_SECONDS`. At scale, synchronised retries after a provider outage would self-inflict a
  second one. One-line fix.
- **SAQ A script criterion — refuted 0-3, and the correction matters more than the original.** I
  had written that SAQ A eligibility for a fully-outsourced payment page is now conditional on
  script integrity. Per PCI SSC FAQ 1588, the new criterion (*"The merchant has confirmed that
  their site is not susceptible to attacks from scripts that could affect the merchant's
  e-commerce system(s)"*) applies **only to merchants who embed a third-party payment form in
  their own page (e.g. an iframe — Stripe Elements)**, and expressly does **not** apply to
  redirect or fully-outsourced flows.
  → **Prompt2Eat uses `@stripe/react-stripe-js` (Elements), so the criterion applies to it.** The
  corrected version is narrower in general but *directly binding here*. Confirm SAQ A eligibility
  explicitly; add a checkout CSP and a script inventory.
- **Stripe idempotency scope — refuted 0-3.** Keys apply to **POST** endpoints; GET and DELETE do
  not take them in API v1. Not "every mutating endpoint". The safety guarantee is scoped to
  retrying after a connection/network error.
- **Idempotency key retention — refuted 0-3 on attribution and precision.** The correct source is
  the API reference, not the blog, and the wording is that keys are *"eligible to be removed from
  the system automatically after they're at least 24 hours old"* — a **minimum retention floor,
  not a guarantee of exactly 24h**. A retry after pruning is treated as a new request and **can
  charge again**.
  → Still binding on F3: refunds must carry an idempotency key and retry well inside that floor.
- **"Foreign state mutations" phase model — refuted 0-3 on attribution and mechanism.** It is from
  Brandur Leach, *"Implementing Stripe-like Idempotency Keys in Postgres"* (brandur.org, Oct 2017),
  not Stripe's blog. The mechanism is also the reverse of how I described it: each atomic phase is
  the *local* state mutation between foreign calls, and **must be committed before the foreign
  call is initiated** — the foreign call is deliberately outside the transaction.
  → Still the right standard for F2/F3, cited correctly.

### 8.3 RBAC · ❌ 0 verified, 3 refuted — DO NOT USE

**All three Shopify claims were refuted, one of them materially. F4's revised target model rested
on these and has been reverted.**

- **"Every POS staff member must be assigned exactly one role" — refuted 0-3, and this one is
  simply wrong.** Shopify's docs state the opposite: *"One or multiple roles can be assigned to an
  admin user or POS staff"* and *"If a user has more than one role assigned, then that user is
  granted the cumulative permissions from all the user's assigned roles."*
  → The correct reading is a **many-to-many** user↔role model with cumulative permission union —
  not one-role-per-user. This changes the schema shape F4 should target.
  → What *is* supported: *"You can't assign individual permissions to Point of Sale staff, you need
  to assign a role."* Roles are the unit of assignment.
- **"No fixed role hierarchy; one default role 'Associate'" — refuted 1-2.** The Associate default
  and its editability check out, but the claim ignores Shopify-managed roles (POS full permissions,
  POS administrator, Organization POS administrator). POS roles are also **POS Pro-only**.
- **"Permission granularity is per-action, composed via checkboxes" — refuted 0-3.** The
  *substance* is roughly right — roles are *"a named set of POS permissions"* controlling *"which
  actions"* staff perform, *"such as processing returns, adding discounts, or cash tracking"* — but
  the docs never say "checkboxes", and none of it was directly retrievable.

**Toast, Square, Lightspeed and Flipdish were never researched** (§8.6). With Shopify's claims
refuted, **there is currently no verified competitor RBAC baseline in this report.** F4's product
gap stands entirely on repository evidence; only its *target design* is unsupported.

### 8.4 Background jobs — the position behind F2 · ⚠️ 1 verified, 4 refuted (mostly overreach)

**Read this section carefully: the refutations narrowed my claims but left F2 better founded than
before, not weaker.**

- **Cron can double-invoke; handlers must be idempotent and reconciliation-based — verified 2-1.**
  Verbatim: *"Cron delivery can also occasionally invoke the same scheduled run more than once.
  Because of this, cron jobs should be resilient to both missed runs and duplicate runs. Design
  your operations to be idempotent and reconciliation-based so each run can safely reprocess
  outstanding work since the last successful run."*
  (Correction applied: dropped "neither at-most-once nor exactly-once" — not Vercel's words — and
  softened "must" to Vercel's "should".)
- **"No retry on failure" — refuted 0-3, but only on the inference.** The retrieved text confirms
  *"Vercel will not retry an invocation if a cron job fails."* What was refuted is my addition
  *"so the work is simply lost"* — because Vercel directs you to reconciliation so the next run
  catches up.
  → **This is the key insight, and it strengthens F2.** Vercel's stated contract is: we will drop
  runs, so make each run *"reprocess outstanding work since the last successful run."* Prompt2Eat
  *is* reconciliation-based — but with `SWEEP_WINDOW_MS` set to exactly the cron period, it can
  only reprocess work since the last *scheduled* run, not the last *successful* one. **The platform
  implements the pattern Vercel requires while violating the property that makes it work.** That is
  a sharper and better-sourced statement of F2 than the version it replaces.
- **"Missed runs are silent/undetectable" — refuted 0-3 on overreach.** Confirmed: *"transient
  network errors can prevent a request from reaching your function. In those cases, your function
  does not execute, and no runtime log is created for that scheduled run."* Refuted: my extension
  to "undetectable from observability generally". Vercel says no *runtime log* for that run — it
  does not say the miss is undetectable by other means.
  → Still material given F5: with no APM and no job-outcome metric, Prompt2Eat has no *other*
  means. The conclusion survives; it just now depends on F5 rather than on Vercel.
- **Hobby hour-window jitter — refuted 1-2, substantively confirmed, corrected.** Retrieved text:
  *"Vercel may invoke these cron jobs at any point within the specified hour… `0 8 * * *` could
  trigger an invocation anytime between 08:00:00 and 08:59:59… For all other teams, cron jobs will
  be invoked within the minute specified."* Corrections: the window is the **full specified hour
  (~60 min, not ~59)**, and the source is `/docs/cron-jobs/usage-and-pricing`, not the docs hub.
  → The consequence holds: consecutive Hobby runs can be ~23–25h apart against a 24h window.
- **QStash at-least-once delivery — refuted 0-3 on scope.** Confirmed: 3 retries by default,
  configurable via `Upstash-Retries`, retrying any non-2XX. Refuted: the page never uses the phrase
  "at-least-once", and there are undocumented-by-me exceptions — an endpoint can opt out with HTTP
  489 + `Upstash-NonRetryable-Error: true` (straight to DLQ), and delivery aborts past the
  plan-specific Max HTTP Response Duration.
- **QStash backoff schedule — refuted 1-2, mostly on my arithmetic.** The formula
  `min(86400, e^(2.5n))` and the 12s / 2m28s / 30m8s / 6h7m6s / 24h schedule **are** verbatim on
  the page. But **"≈33 minutes to exhaust 3 retries" is my derivation, not a documented figure**
  (12s + 2m28s + 30m8s = 32m48s). Also flagged: the page contains a typo (`30m8ss`) and Upstash's
  API reference states a *conflicting* formula, `min(86400, e^(2n))`.
  → The recommendation stands and gets stronger: QStash's defaults are unsuitable for kitchen
  dispatch, and the vendor's own docs disagree with each other about the backoff curve, so pin
  `Upstash-Retries` and an explicit backoff rather than inheriting defaults.

### 8.5 What this changes in the findings

| Finding | Change | Evidence status |
|---|---|---|
| **F7** | Materially revised. Naive RLS on this exact membership pattern times out; constraints added; effort 2–3w → 4–6w. | ✅ **Verified 3-0.** One sub-claim refuted and removed. |
| **F2** | **Reframed and better founded.** Vercel's contract is "we drop runs — reconcile since the last *successful* run". Prompt2Eat reconciles only since the last *scheduled* run. | ✅ Core guidance **verified 2-1**; aggravating details corrected. Base defect repo-proven. |
| **F4** | **Target-model revision REVERTED.** Shopify supports *multiple* roles with cumulative permissions, not one. No verified competitor RBAC baseline remains. | ❌ **All 3 claims refuted.** Product gap stands on repo evidence; target design is unsupported. |
| **F3** | Refunds must carry an idempotency key, retried inside the retention floor. | ⚠️ Corrected — "at least 24h" is a floor, not a guarantee. |
| **F10** | Revised — see finding. Prior in-repo audit is substantial; its "7/8 dialogs" note is **stale** (the 8th is fixed). Skip links remain the real gap. | ✅ Verified directly against the repo. |
| **New** | Add jitter to `BACKOFF_SECONDS` (`dispatch.ts:69`). | ✅ Stripe guidance **verified 3-0**; code fact repo-proven. |
| **New** | PCI SAQ A script criterion **does** bind this platform (Elements = embedded form). | ⚠️ Corrected from a wrong original; now *more* relevant. Confirm before relying. |
| **Removed** | 15 refuted claims across four runs. | ❌ See §8.0. |

### 8.6 Still not researched

**The search budget for this session was exhausted (200/200 WebSearch calls).** The final workflow
returned empty for four of six angles, and its CWV agent reported verbatim: *"RESEARCH NOT
PERFORMED — NOT A RESEARCH FINDING. This subagent obtained ZERO web sources."* That self-report is
recorded here rather than discarded, because a silent empty result would have looked like "nothing
found".

These four of the brief's seven questions therefore remain **unanswered**, and they are the ones
the brief leaned on hardest for competitive positioning:

- **Competitor RBAC** — Toast Access Permissions, Square employee permissions, Lightspeed user
  groups, Flipdish. Now *more* important, since the Shopify baseline was refuted.
- **Cost & performance economics** — Vercel Active CPU / Fluid pricing, Neon connection limits and
  cold-start behaviour, the concrete cost delta between a cached and a dynamic page (§7 depends
  entirely on this).
- **Competitor pricing & time-to-first-order** — Toast, Square Online, Flipdish, GloriaFood,
  Owner.com, ChowNow, BentoBox; plus documented merchant complaints.
- **Accessibility & allergen law** — WCAG 2.2 AA, EU EAA deadline, ADA Title III litigation
  volume, Australian DDA; EU FIC / Natasha's Law, FDA menu labeling, FSANZ.

Also outstanding: the RLS counter-evidence in §8.1, and re-verification of the 403-blocked sources
from an unrestricted network.

## 9. Roadmap

Each milestone is independently deployable, ≤2 weeks, and backward-compatible.

### M0 — Stop the bleeding (2 days)
- Remove the delivery option from onboarding (F1 step 1).
- Widen `SWEEP_WINDOW_MS` to 72h in all five modules (F2 step 1).
- Correct the false "every minute" comment in the jobs route.
- Add `needs: [build, e2e]` and a destructive-SQL guard to `migrate-prod` (F12 — the two
  cheapest parts; the approval gate and snapshot follow in M1).
- Add randomised jitter to `BACKOFF_SECONDS` (`lib/integrations/dispatch.ts:69`) — currently a
  fixed schedule, against Stripe's explicit thundering-herd guidance (§8.2). One-line change.
- **Tests:** unit test asserting sweep window > cron period; CI test that a `DROP COLUMN`
  migration fails the guard. **Docs:** note the cron/window coupling in the jobs route.

### M1 — See what is happening (1 week)
- Sentry via `instrumentation.ts`; instrument webhook, `placeOrder`, `processDueJobs` (F5).
- Alert on dead-lettered jobs and non-empty sweep backlogs.
- **Tests:** verify a forced job failure produces an alert. **Docs:** runbook.
- **Shipped 2026-08-01** (second remediation pass): all of the above, behind
  `SENTRY_DSN` — see `docs/ops/Observability.md`. Remaining: the DSN and the
  two alert rules are Sentry-console setup (ops, not code). The approval gate
  and pre-migration snapshot noted under M0/F12 also remain repo/Neon settings.

### M2 — Make the job engine real (1 week)
- Minute cron or durable queue; loop `processDueJobs` until drained (F2 steps 2–3).
- **Tests:** backlog of 100 jobs drains within one invocation.
- **Shipped 2026-08-01** (third remediation pass): `last_swept_at` watermarks
  for all five sweeps (72h floor kept); claim leases + fenced completion
  writes (crashed invocations can no longer strand `processing` rows);
  drain-until-empty extracted and reused by the cron route, the webhook's
  post-response kick, and the dashboard retry actions; opt-in hourly GitHub
  Actions tick for Hobby-plan deployments. The 100-job drain test is
  `lib/integrations/drain.test.ts`. Remaining: minute cron (paid tier) or a
  durable queue as the mechanism of record — the audit's §8.4 QStash caveats
  apply when that lands.

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
- Skip links on every layout (F10) — the one clean Level A failure remaining.
- Automated contrast validation of tenant `--brand` at save time, so a venue cannot publish a
  storefront below 4.5:1.
- Correct the stale "7/8 dialogs" note in `docs/audit/Accessibility.md` — the 8th is fixed.
- Add `@axe-core/playwright` to CI.

### M8 — Merchant audit log (1 week)
- Extend audit table with `venue_id`; log merchant mutations (F9).

### M8b — PCI SAQ A confirmation (3 days)
- Confirm SAQ A eligibility under the January 2025 revision, which is now conditional on
  payment-page script integrity rather than automatic (§8.2).
- Add a Content-Security-Policy to the checkout route; document the script inventory.
- **Docs:** record the eligibility determination and its basis.

### M9+ — Delivery epic (6–10 weeks)
- Full delivery domain (F1 step 2). Sequenced last because it is the largest, and because M0
  removes the active harm immediately.

---

## 10. Stop condition

**The codebase review is complete.** Reviewed to exhaustion at the architectural level: all 47
tables, 59 migrations, 14 routes, 67 pages, the auth and tenancy model, the payment and pricing
paths, the job engine, caching, testing, CI, accessibility, and the Zale portability question.
Every finding F1–F12 is evidenced against a file and line. Remaining work there is depth within
the epics above rather than undiscovered breadth.

**Verification is now finished for every claim that was extracted. The external benchmarking is
not, and this report should not be presented as though it were.**

1. **10 of 25 claims survived adversarial verification; 15 were refuted — a 60% refutation rate.**
   Every refuted claim had been drafted into an earlier revision of this report. §8.0 classifies
   them: most were attribution errors or overstated scope rather than false facts, but one — the
   Shopify single-role model underpinning F4's target design — was simply wrong.
2. **Four of the brief's seven research questions were never answered.** The session's WebSearch
   budget was exhausted (200/200); the final workflow returned empty for four of six angles. The
   unanswered questions are competitor RBAC, cost/CWV economics, competitor pricing and
   time-to-first-order, and accessibility/allergen law — the ones the brief leaned on hardest for
   competitive positioning. §7 accordingly presents no costed model.
3. **14 of 15 sources in the final pass could not be fetched directly** (HTTP 403 from Shopify,
   PCI SSC, Stripe, Vercel, AWS). Verifiers worked from exact-phrase search retrieval and were
   told to refute when unable to confirm, so some refutations mean "unconfirmable here" rather
   than "false". A reviewer on an unrestricted network should re-run these.

**The honest status: a complete, file-evidenced internal audit; a verified tenant-isolation
benchmark; a corrected but partly unconfirmable benchmark for payments and background jobs; and no
competitive, cost, or legal benchmark at all.**

Note the asymmetry that matters for planning: **F1, F3, F4, F5, F6, F8, F9, F10, F11 and F12 rest
entirely on repository evidence and are unaffected by any of this.** Only F2's *aggravating
factors* and F7's *industry framing* depend on external claims — and F7's core is now verified.
The roadmap can therefore proceed as written; the outstanding research changes emphasis, not
direction.

Remaining work before this is fit for an external due-diligence pack: close §8.6 and re-run
verification. Both are cheap — the fetch phase is cached under run `wf_830f5f81-f2a`, so a resume
re-runs only the outstanding verifier agents.
