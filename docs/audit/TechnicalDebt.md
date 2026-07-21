# Technical Debt

Honest inventory of debt observed during the audit. The codebase is clean
overall; these are the real items.

## 1. Test suite — started, needs breadth
A **Vitest harness is now in place** (`vitest.config.ts`, `npm test`, wired into
CI) with initial coverage of the money math where bugs were found:
`bank-discount`, `order-discount` (`composeOrderDiscount` stacking/clamps), and
`tax` (`inclusiveTaxCents`, incl. the fixed discounted-GST case) — 17 tests.

Remaining coverage to add (still the biggest gap by breadth):
- `lib/loyalty/*`, `lib/giftcards/*` (redemption clamps, availability)
- `lib/stock/*` (depletion, cost), `lib/schedule.ts`, `lib/time.ts`
- `computeApplicationFeeCents` (co-located with the Stripe SDK — needs a light
  mock or extraction)
- **Concurrency** tests for the gift-card lock + stocktake `FOR UPDATE` (needs a
  DB-backed integration harness, not pure unit tests)
- Playwright for the checkout + order flows

The config aliases `@/*` and stubs `server-only`, so any pure function in a
"server-only" module can be unit-tested — extend `lib/**/*.test.ts`.

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
