# Technical Debt

Honest inventory of debt observed during the audit. The codebase is clean
overall; these are the real items.

## 1. Test suite — established, needs DB-backed breadth
Two harnesses are now in place and wired into CI:

- **Vitest** (`npm test`) — **75 unit tests** over the pure domain logic where
  bugs were found: `bank-discount` / `order-discount` (stacking + clamps), `tax`
  (incl. the fixed discounted-GST case), `orders/station` routing, `schedule`
  (the pickup gate), `stock/cost` (COGS + margins), `validation`, `crypto`
  (AES-GCM round-trip + tamper), `time`, and `menu-health` scoring. The config
  aliases `@/*` and stubs `server-only`, so any pure function in a "server-only"
  module is unit-testable — extend `lib/**/*.test.ts`.
- **Playwright** (`npm run test:e2e`) — **E2E smoke** over the anonymous
  marketing/SEO surface (landing, sign-in, `/learn`, robots), which renders
  without a DB. Config auto-uses the pre-installed Chromium locally and
  Playwright's own in CI.

Remaining (needs a **seeded database**, so integration- not unit-testable):
- `lib/loyalty/*`, `lib/giftcards/*` end-to-end (availability under real rows)
- **Concurrency** tests for the gift-card lock + stocktake `FOR UPDATE`
- `computeApplicationFeeCents` (co-located with the Stripe SDK — light mock or
  extraction)
- E2E for the signed-in owner + diner flows (checkout, order board) — needs a
  test `DATABASE_URL` + seed + auth/Stripe test env.

## 2. Convention-enforced tenant scoping
Isolation is correct today but depends on every new query calling
`scopedToVenue(...)`. There is no lint rule or type-level guarantee — a forgotten
scope is a silent IDOR. Consider a custom ESLint rule (flag `db.update/delete` on
venue-owned tables without a `venueId` predicate) or a typed query wrapper.

## 3. Design-system drift
The `controlClass` recipe and the `text-[9px]` micro-label are copy-pasted across
~12 and ~20 files respectively; several one-off buttons/headers/segmented controls
bypass the primitives. Not broken, but each new author re-derives values. See
DesignSystemCompliance.md.

## 4. Build-not-wire primitives
`Toast`/`ToastProvider` ship fully built but unmounted; the `p2e-*` motion library
is defined but largely unreferenced. Intentional staging, but it's latent surface
area — wire the toast provider at the owner root + diner storefront and adopt it
where surfaces currently hand-roll status UI.

## 5. Discount propagation was incomplete by design
Before this pass, the discount was applied to the charge but not consistently
propagated to tax, the Square mirror, or the receipt email. Two of three are now
fixed; the email (C5) remains. The underlying lesson: a single "order financial
snapshot" shape consumed by every downstream (receipt, email, mirror, reports)
would prevent this class of drift.

## 6. Owner-level audit log
Only platform-admin actions are audit-logged. If per-venue action history is a
product requirement, it needs a schema addition.

## 7. Mobile app is a WebView shell
`mobile/` is a Capacitor shell over the hosted dashboard — deliberate "hybrid
phase 1". Feature parity is structural (it *is* the web app), but the native wins
(push, deep-link sign-in) are documented-but-inert until env + native project
wiring is completed. Not debt so much as an explicit roadmap seam.
