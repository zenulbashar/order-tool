# Observability runbook (M1 / audit F5)

Error tracking for the money and job paths, shipped as roadmap milestone M1 of
`docs/audit/PlatformAudit-2026-07.md`. This document is the operational half:
how to turn it on, which alerts to create, and what to do when they fire.

## What is instrumented

Everything is server-side (Node runtime) and reports through
`lib/observability.ts`. With no `SENTRY_DSN` set, all of it is a complete
no-op — dev, tests, CI, and unconfigured previews behave exactly as before.

| Surface | What reports |
|---|---|
| `instrumentation.ts` → `onRequestError` | Every server error Next captures (Server Component renders, route handlers, server actions) — including `placeOrder`'s re-thrown transaction errors. Tagged `context:onRequestError` with route path/type; headers are never forwarded. |
| Stripe webhook (`app/api/stripe/webhook/route.ts`) | The handler's 500 path (`context:stripe-webhook.handler`) and every best-effort side effect the `swallow()` helper drops — integrations enqueue/kick, stock depletion, push, customer notification, loyalty earn/redeem, gift-card redeem (`context:stripe-webhook.side-effect`, tag `side_effect`). The swallow contract is unchanged: a side-effect failure still never fails or delays order confirmation. |
| `placeOrder` (`app/[slug]/checkout/actions.ts`) | The previously-silent PaymentIntent creation failure (`context:place-order.payment-intent`) — Stripe auth, Connect account state, network. Flush cost (≤2s) lands on the failure path only. |
| Job engine (`lib/integrations/dispatch.ts`) | Every failed job attempt. Retryable failures are warnings grouped per provider/kind; an exhausted job (`attempts >= 6`) is an **error** with the `alert:integration_job_dead_letter` tag. |
| Jobs cron (`app/api/jobs/integrations/route.ts`) | Each sweep's own failure (`context:jobs-cron.sweep-*`), plus one **warning** with the `alert:sweep_backlog` tag whenever any sweep recovered work the webhook fast path missed, or the drain loop hit its time budget with jobs still due. A clean tick reports nothing. |
| Charge reconciliation (`app/api/stripe/webhook/route.ts`) | One **error** with the `alert:charge_amount_mismatch` tag when a confirming order's `amount_received` differs from `orders.total_cents`. Fires only on the real status transition, so a redelivered webhook cannot re-alert. Matching amounts report nothing. |

## Enabling it (one-time ops setup)

The code side is complete; these steps live in the Sentry and Vercel consoles
and cannot be done from this repo:

1. Create a Sentry project (platform: Node.js / Next.js — either works, the
   SDK in use is `@sentry/node`).
2. In Vercel → Project → Environment Variables, set `SENTRY_DSN` to the
   project DSN for Production (and Preview if wanted). Unset = disabled.
3. Optional: `SENTRY_ENVIRONMENT` to override the default environment name
   (otherwise `VERCEL_ENV`: `production` / `preview` / `development`).
   Releases are stamped automatically from `VERCEL_GIT_COMMIT_SHA`.
4. Create the three alert rules below.

## The three alert rules

Create issue alert rules in Sentry matching on the `alert` tag. These three tag
values are a stable contract with the code (see `AlertKind` in
`lib/observability.ts`); alerts on anything else are optional extras.

### `alert:integration_job_dead_letter` — page-worthy

A mirror job exhausted all 6 attempts (≈15h of nominal backoff; 0.5–1.5×
jitter) and will **never retry on its own**. The venue's integration row is flipped to
`needs_attention` with the scrubbed error in `last_error`, so the merchant
dashboard shows it too — but a merchant noticing is the failure mode the
audit calls out, not a plan.

Respond:

1. Read the event: `provider`, `kind`, `venue_id`, `job_id` tags plus the
   exception. Cross-check `venue_integrations.last_error`.
2. Fix the cause — expired/revoked provider credentials (owner reconnects via
   the dashboard), revoked scopes, or a provider API change (code fix).
3. Re-drive the job from `/dashboard/integrations` (the venue owner's Square
   detail drawer has per-job **Retry** and **Retry all** buttons; both
   re-queue the job and — since M2 — kick processing immediately, so the
   outcome is visible in seconds). Attempts stay maxed, so one more failure
   re-deads it immediately — fix the cause first. An earlier revision of this
   runbook claimed re-driving required manual SQL; that was wrong — the
   buttons predate it.

### `alert:sweep_backlog` — investigate same day

The daily cron's sweeps exist to be **empty**. This event means the webhook
fast path silently missed money-adjacent work in the last window and the
backstop had to recover it: the `extra` payload carries per-sweep counts
(integration jobs enqueued, stock depletions, loyalty earns/redeems,
gift-card redeems) and `drainBudgetExhausted`.

Respond:

1. Check Stripe Dashboard → Developers → Webhooks for failed/slow deliveries
   to `/api/stripe/webhook` in the window.
2. Check Sentry for `context:stripe-webhook.*` events around the same time —
   the side-effect failures that caused the misses should be there.
3. `drain_budget_exhausted:true` means one tick can no longer drain the
   queue: the cadence is the bottleneck. Enable the hourly GitHub tick (see
   "Job engine cadence" below) if it isn't on; if it fires with the tick
   already hourly, that is the signal to move to a paid Vercel tier's minute
   cron or a queue.

### `alert:charge_amount_mismatch` — page-worthy

Stripe took a different amount than the order says it should. These two numbers
are equal by construction — `applyOrderDiscounts` writes the order row and
re-prices the PaymentIntent inside one transaction — so any event here is a real
accounting fault, never noise. There is no tolerance band: both values are
integer cents written by the same transaction, so "close enough" would only hide
a fault. Security review S4 is the reason this check exists (an amount-keyed
Stripe idempotency key let the two diverge silently, in both directions), but the
check is deliberately generic and will catch causes unrelated to that one.

The order is **still confirmed** — by the time this fires the money has moved, and
refusing to feed the kitchen would turn an accounting fault into a customer-facing
one. Reconciliation is a human step.

Respond:

1. Read `extra`: `orderId`, `paymentIntentId`, `chargedCents`, `orderTotalCents`,
   `deltaCents`. The `direction` tag is `over` or `under`.
2. `direction:over` — the diner was charged **more** than the order. They are owed
   `deltaCents`; refund that amount from `/dashboard/orders` (the refund path
   creates on the connected account and caps at the order total, so a partial
   refund here is correct and safe).
3. `direction:under` — the venue is **short** `deltaCents`. Do not re-charge
   silently; treat it as a billing conversation with the venue.
4. Either way, check whether other orders in the same window diverged: filter
   Sentry by the fingerprint and compare `deltaCents`. A cluster means a code
   defect, not a one-off — capture the PaymentIntent ids before changing anything.
5. Cross-check the PaymentIntent in the Stripe Dashboard against the order row
   before acting; the event is a report, not a source of truth.

## Job engine cadence (M2)

Three processing triggers, all safe to overlap (claims are atomic and
leased; sweeps are idempotent and watermark-anchored):

1. **After every confirmed order** — the Stripe webhook's post-response kick
   drains due jobs on a small budget (~8s), so on an active venue retries
   run at order cadence. Owner-initiated retries on
   `/dashboard/integrations` kick the same drain.
2. **The daily Vercel cron** (`vercel.json`, 03:00 UTC — the Hobby-plan
   ceiling) — the reconciliation backstop: sweeps + full drain on a ~35s
   budget.
3. **The opt-in hourly GitHub Actions tick**
   (`.github/workflows/job-tick.yml`) — disabled by default; enable by
   setting the repo variable `JOB_TICK_URL`
   (`https://<domain>/api/jobs/integrations`) and the repo secret
   `CRON_SECRET`. Caps worst-case retry latency at ~1h without a new vendor.
   Cost note: on a private repo each run bills ≥1 Actions minute (~720
   min/month hourly); public repos are free.

Durability properties shipped with M2, relied on by all three triggers:

- **Claim leases** — a claimed job carries `next_attempt_at = now + 5min`;
  an invocation dying mid-job (deploy, OOM, timeout) no longer strands the
  row in `processing` forever — the lease expires and exactly one later tick
  reclaims it. Completion writes are fenced on `attempts`, so a slow
  original claimant can never overwrite a reclaim's result. Re-running is
  provider-safe: Square calls are keyed `idempotency_key = job.id`. A job
  that repeatedly **crashes** its invocation (never reaching the clean
  failure path) gets one post-crash grace run, then is parked dead as
  presumed poison — it raises the same dead-letter alert.
- **Sweep watermarks** (`sweep_watermarks` table) — every sweep reconciles
  from the last *successful* run (Vercel's own cron contract), with the 72h
  window as the floor: lookback never narrows below today's behaviour and
  widens automatically after an outage longer than the floor.

Upgrade path when scale demands it: a paid Vercel tier's minute cron, or a
queue (QStash — pin `Upstash-Retries` and an explicit backoff; the audit
§8.4 documents why its defaults are unsuitable for order-path work).

## Design constraints (read before extending)

- **No monkey-patching.** The SDK is initialised with
  `defaultIntegrations: false` and `skipOpenTelemetrySetup: true` — no
  patching of `http`, `console`, or process handlers, and no OpenTelemetry
  wiring. This app runs on a Next.js fork; the SDK is kept to plain event
  transport plus enrich-only integrations (error causes, source context,
  runtime info). Consequences: no tracing/latency percentiles (future work),
  and scope state is **not request-isolated** — never use `Sentry.setTag` or
  other global-scope mutation; pass all context per capture.
- **Reporters never throw and always flush.** Vercel freezes the sandbox
  after the response; an unflushed event evaporates. Add new reporting only
  through `lib/observability.ts` helpers (or mirror their guard + ≤2s flush),
  and inside `after()`/`.catch()` chains return the promise so the runtime
  waits for it.
- **PII discipline.** Tags/extra carry opaque ids (venue, order, job) and
  enum-ish strings only. Request headers are structurally excluded
  (`reportRequestError` cannot receive them); `sendDefaultPii` is false. Do
  not attach payloads, customer fields, or provider tokens.

## Known gaps (deliberate, tracked)

- Client-side/browser errors are not tracked (server-only milestone).
- The Edge runtime is not instrumented — the app has no Edge routes today;
  the `NEXT_RUNTIME` guard in `instrumentation.ts` keeps `@sentry/node` out
  of any future Edge bundle, which would need its own SDK.
- No tracing, latency percentiles, or cross-service traces (audit F5 lists
  them; error visibility was the P0).
- If Sentry itself is down, events are dropped after one attempt; the
  pre-existing `console.error` lines still land in Vercel function logs.

## How it was verified

- `lib/observability.test.ts`: a forced job failure produces the dead-letter
  alert event (the M1 acceptance test), sweep backlog telemetry fires only on
  dirty ticks, reporters no-op without a DSN and never throw even when the
  SDK fails.
- End-to-end against the production build: with `SENTRY_DSN` pointed at a
  local envelope sink, a forced server error produced a real
  `POST /api/1/envelope/` from `sentry.javascript.node` via
  `onRequestError` — init options, capture, and flush all exercised for real.
