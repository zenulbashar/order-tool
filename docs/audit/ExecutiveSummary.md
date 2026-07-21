# Executive Summary — Product Audit

**Product:** Prompt2Eat (`order-tool`) — a multi-tenant restaurant ordering SaaS.
**Stack:** Next.js 16 (App Router, React 19), Tailwind v4, Drizzle/Postgres,
NextAuth v5, Stripe + Square, Anthropic (AI concierge + support).
**Surface:** 60 pages, 13 route handlers, 36 server-action modules, 43 tables,
195 components, plus a Capacitor owner app (WebView shell) and an SEO content hub.

## Headline

This is a **well-engineered, near-production-grade** codebase. Security invariants
are documented at the code, tenant isolation is enforced uniformly, the money path
is server-authoritative and idempotent, accessibility is designed into the
primitives, and the design system is mature. The audit's job was to find the
**real residual defects**, not to rehabilitate a broken app — and it did.

## What the audit found and fixed

Four parallel specialist audits (security, correctness, accessibility,
design-system/CRUD) produced verified findings. **No Critical issues, and no
High/Critical security issues.** The concrete defects clustered around one theme
— *discounts not propagating to downstream state* — plus modal accessibility and
unguarded destructive actions. Shipped across three verified commits (each passing
`typecheck` + `lint` + `build`):

**Correctness (money path).**
- **High:** every discounted order failed to mirror to Square (assertion rejected
  it) — now mirrors the discount as an order-scoped line.
- **Medium:** GST/`taxCents` was stale after discounts, overstating tax on
  receipts and in the owner's BAS report — now recomputed from the discounted
  total.
- **Medium:** gift-card redemption could double-spend across concurrent orders —
  now re-derived under a row lock inside the transaction.
- **Low:** non-atomic stocktake — now read under `FOR UPDATE`.

**Security.**
- **Low:** an admin price edit wasn't venue-scoped in its WHERE (contradicting its
  own comment) — fixed. Two deployment-dependent hardening items (auth
  rate-limit bypass, XFF trust) are documented with fixes.

**Accessibility (WCAG 2.2 AA).**
- **High:** 8 hand-rolled dialogs lacked a focus trap / initial focus / focus
  restoration — a shared `useDialog` hook now gives them the full modal keyboard
  contract (7 migrated). Plus `Segmented` keyboard model, `Field` error
  association, and a brand-contrast fix.

**CRUD safety.**
- **High:** four owner actions destroyed data with no confirmation (delete table /
  station, void gift card, delete image) — all now confirm via the shared
  `ConfirmSubmit` primitive (promoted to `_components`).

## What remains (nothing Critical)

The deferred items are (a) **runtime-only verification** — device-matrix
responsive testing, Lighthouse/bundle profiling, screen-reader passes, staging
concurrency tests — and (b) **large mechanical design-system consolidations**
(control-recipe duplication, a missing micro-label token, one-off components)
that change rendered pixels and so want a visual review rather than a blind sweep.
Both are fully specified in RemainingRecommendations.md and DesignSystemCompliance.md.

**The single biggest gap is the absence of an automated test suite** — the pure
`lib/` domain logic is highly testable, and a modest suite would have caught three
of the bugs fixed here (TechnicalDebt.md).

## Would this pass an internal release review at Apple / Stripe / GitHub / Vercel?

**Close, with conditions.** The architecture, security posture, and engineering
discipline are at that bar. The blocking gaps for a formal sign-off are the
**test suite** and the **runtime verification gates** in ReleaseChecklist.md
(especially the staging checks on the money-path concurrency changes). With those
addressed, this is a premium-tier product.

## Deliverables
`docs/audit/`: ExecutiveSummary · Inventory · UserFlows · ArchitectureReview ·
Security · Accessibility · Responsive · Performance · DesignSystemCompliance ·
CRUDConsistency · IssuesFound · IssuesResolved · RemainingRecommendations ·
TechnicalDebt · ReleaseChecklist.
