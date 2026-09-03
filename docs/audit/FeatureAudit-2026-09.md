# Feature Audit — 2026-09-03 (round 2)

A second full pass over the codebase after every item in
`FeatureAudit-2026-08.md` (P1–P16, L1–L12 except the deliberately deferred
L7) had shipped. Method: the dependency graph (`npm audit`) and the module
import graph (`madge`) first, then eleven subsystem finders and four
cross-cutting lenses, then every candidate finding verified by reading the
full code path before anything was changed. Every fix below is its own
commit whose message states the defect, carries a mutation-verified test
where the decision is pure, and merged through PRs #277–#289.

Rule for the next round: nothing in this register is re-reported.

## Graph phase

| Graph | Result |
| --- | --- |
| Dependency graph | Production graph clean (`npm audit --omit=dev`: 0). Dev-only `browserslist` advisories fixed by a lockfile-only bump (#289). |
| Module import graph | 0 runtime cycles, 0 dead modules. Two cycles reported by madge are `import type` in one direction. |

## Fixed — high severity

| # | Defect | Fix | PR |
| --- | --- | --- | --- |
| R1 | A venue could delete another venue's R2 objects by pasting the other venue's public URL, then "removing" it. | Key recovery scoped to `venues/{venueId}/` (`venueOwnedR2Key`). | #277 |
| R2 | Accepting a staff invite as `staff` demoted a legacy-only owner — the sole owner locked out. | `rolesToGrantOnAccept` carries the legacy role across; acceptance only ever widens access. | #278 |
| R3 | "Choose a plan" while subscribed created a second Stripe subscription with a fresh trial. | `decideSubscriptionCheckout`: live subscription → portal; trial only on the first subscription. | #279 |
| R4 | A superseded subscription's late `deleted` event flipped the venue to free while the new one billed. | `shouldApplySubscriptionSync` in `syncVenueFromSubscription`. | #280 |
| R5 | Abandoned checkouts held gift-card and loyalty value forever. | `sweepAbandonedCheckouts`: cancel the PaymentIntent first, then the order, after 24h. | #281 |
| R6 | Uploads trusted the browser-declared `File.type`; any bytes renamed `.png` reached sharp and R2. | Byte-signature sniffing (`sniffImageType`) on all four upload paths. | #282 |

## Fixed — medium severity

| # | Defect | Fix | PR |
| --- | --- | --- | --- |
| R7 | Unique-key conflicts became 500s: `isUniqueViolation` never saw through `DrizzleQueryError`. | Shared classifier walks the cause chain; four local copies removed. | #283 |
| R8 | Onboarding step 2 redirected every new owner to the dashboard. | Forwards to step 3. | #283 |
| R9 | `isLive` / `acceptsOrders` served from an hour-long cache that go-live and Stripe status changes never cleared. | Flags read fresh per request; go-live revalidates. | #283 |
| R10 | Invite acceptance set a cookie during render and threw after committing. | Route Handler at the same URL; outcome page at `/invite/invalid`. | #284 |
| R11 | Sign-in ignored the invite's `callbackUrl`. | Honoured via `safeReturnPath` (same-origin only). | #284 |
| R12 | Concurrent refunds both validated; pending refunds compensated stored value before settling. | Row lock + committed headroom; compensation on settled money only. | #284, #289 |
| R13 | A card could pay the pay-by-bank price unnoticed. | Bank portion stamped on the intent; settling method checked at confirm and reported. | #285 |
| R14 | Promo budgets, audiences, usage counts and recommendations dropped refunded orders. | `PAID_ORDER_STATUSES`; harness extended. | #285 |
| R15 | Promo dates parsed as UTC midnight (codes died at 10am local). | `dayBoundsInTimeZone`, DST-aware. | #285 |
| R16 | Kitchen status writes had no compare-and-set; "ready" re-notified on regressions. | CAS on the shown status; `shouldNotifyReady`. | #285 |
| R17 | Refund control shown to staff without `refunds:issue`. | Capability resolved server-side; control hidden. | #286 |
| R18 | Scheduled pre-orders flagged LATE on arrival. | Timer from `scheduled_for`. | #286 |
| R19 | "Test mode" copy hard-coded on money pages. | `isStripeTestMode` from the key prefix. | #286 |
| R20 | Cart accepted quantities the server refuses. | One shared cap. | #286 |
| R21 | Hardware order paid by bank debit stayed pending. | `checkout.session.async_payment_succeeded` handled. | #286 |
| R22 | Admin plan discount: typo removed a live coupon; Stripe failure audited as applied; pre-subscription grants applied nowhere. | Invalid input rejected; failure reported; coupon applied at Checkout. | #286 |
| R23 | Every venue outside Queensland ran on Brisbane time. | Zone derived from state at onboarding. | #286 |
| R24 | Stock depletion sweep stalled on recipe-less orders; failures swallowed. | Filtered, ordered, reported. | #286, #287 |
| R25 | Two simultaneous bookings both passed the capacity check. | Per-venue advisory lock. | #286 |
| R26 | One limiter's block enforced by every other limiter. | One ephemeral cache per limiter. | #286 |
| R27 | Discounts froze at decline time on a retried payment. | Re-pricing follows `CONFIRMABLE_ORDER_STATUSES`. | #286 |
| R28 | Stale-cost detection never fired for ingredients that sold (`updated_at` bumped by every movement). | `cost_updated_at` column (migration 0066). | #287 |
| R29 | Admin stats rankings and platform revenue disagreed with the net headline. | One per-order net value; fee netted pro rata. | #288 |
| R30 | Square mirror ran against refunded orders; second manual retry parked dead; `needs_attention` was a dead end; connecting mirrored days of old orders. | Status read; attempts reset; connected statuses enqueued; sweep floored at connection time. | #288 |
| R31 | Cancelling a paid hardware order kept the payment with no precondition. | Refund confirmation required and audited. | #288 |
| R32 | Plan picker sold "Custom domain", which does not exist. | Claim removed. | #288 |

## Fixed — low severity

R33 refunded order page said "cancelled" · R34 hero "Open" from `isLive` · R35 tax toggle saved On with no rate · R36 UTC times on points/SEO/support pages · R37 admin "Prod" pill · R38 silent gift-card top-up failure · R39 supplies shop gated on the wrong permission · R40 Completed column hid refunded money · R41 JSON-LD variant price · R42 onboarding phone/logo validation · R43 voided gift card still debited · R44 `sharp` undeclared · R45 restored cart with unsatisfied required groups · R46 bank-saving callout overstated next to a promo (all in #286–#289).

## Not done, and why

- **`next` patch bump (16.3.1 → 16.3.4).** The finder cited an advisory identifier that does not resolve; the underlying upload defect (R6) was fixed on its own merits. The bump was not made on an unverified claim.
- **`stripe` SDK bump (22.2.3 → 22.6.1).** Tried and reverted: the release moves the pinned API version, which changes webhook payload shapes. Not a drop-in change.
- **L7 (`orders.table_id` FK)** stays deferred as recorded in the August register.
- **Existing venues' `timezone`** is not rewritten by R23; only newly onboarded venues derive it from their state.

## Areas re-audited in the third pass and found clean

Selected-venue cookie resolution (membership re-verified per request), diner magic-link tokens (hashed, single-use, expiring), every `app/api/**` route handler (session, `CRON_SECRET`, or signature-verified), member removal (last-owner guard), points and gift-card reservations, booking cancellation by token.
