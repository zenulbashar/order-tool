# Technical Debt

Honest inventory of debt observed during the audit. The codebase is clean
overall; these are the real items.

## 1. No automated test suite (biggest gap)
CI runs `typecheck` + `build` only. There is no unit/integration/E2E harness.
The highest-value place to start is the **pure `lib/` domain logic**, which is
framework-free and trivially testable:

- `lib/payments/*` (tax, order-discount, bank-discount), `composeOrderDiscount`
- `lib/loyalty/*`, `lib/giftcards/*` (redemption clamps, availability)
- `lib/stock/*` (depletion, cost), `lib/schedule.ts`, `lib/time.ts`

Several bugs this audit fixed (stale GST, gift-card double-spend, stocktake race)
are exactly the kind a modest unit + concurrency test suite would have caught.
Recommend Vitest for `lib/`, then Playwright for the checkout + order flows.

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
