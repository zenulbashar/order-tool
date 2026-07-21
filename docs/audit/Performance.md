# Performance Review

Method: static review of rendering strategy, data-access patterns, and bundle
posture. **Runtime profiling (Lighthouse, bundle analyzer, query timing under
load) needs a deployed environment and is listed as a release gate.**

## Strengths

- **Server Components by default.** Data fetching happens on the server; only
  interactive leaves are `"use client"` (105 of 195 components), keeping client JS
  down. The Next 16 build reports mostly dynamic (`ƒ`) server-rendered routes with
  SSG (`●`) for the SEO `/learn/[slug]` hub and static (`○`) marketing/metadata.
- **Request-level memoization.** `getMembershipVenues` is wrapped in React
  `cache()` so venue resolution runs one query per request across all callers —
  a deliberate N+1 guard on the hottest path.
- **Immutable order snapshots.** Kitchen/order views read snapshot columns
  (`itemNameSnapshot`, `unitPriceCentsSnapshot`) instead of live-menu joins —
  fewer joins and correct financial history.
- **Async work is decoupled.** Webhooks enqueue via `integrationJobs` +
  `/api/jobs/integrations` and Stripe's `after()` seam, so slow mirror/push work
  doesn't block the money path.
- **Set-based queries.** Modifier/loyalty/gift-card lookups use `inArray` and
  aggregate `sql` rather than per-row loops in the paths reviewed.

## Watch-items

- **N+1 spot-checks under load.** The audit didn't find obvious N+1s in the hot
  paths, but the orders board, reports, and stock overview aggregate across
  several tables — profile them with realistic row counts.
- **Owner-supplied images** bypass `next/image` (no remote host config), so no
  automatic resizing/format negotiation for library/menu images. If image weight
  matters, add remote patterns + `next/image`, or resize on upload.
- **Client bundle** — run `@next/bundle-analyzer` to confirm the concierge/support
  chat, Stripe Elements, and QR code libs are code-split to the routes that use
  them (they appear to be, via route-local client components).
- **Rate-limit / Redis** calls are on some hot paths (checkout, concierge); they
  fail open, so a Redis blip degrades gracefully rather than blocking.

## Not verified (release gates)
Core Web Vitals (LCP/CLS/INP), bundle sizes, hydration cost, DB query plans and
latency under load, memory over long-running order-board sessions. See
ReleaseChecklist.md.
