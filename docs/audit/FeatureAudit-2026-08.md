# Feature Audit — 2026-08-05

> Adversarial audit of every feature area at `db7ce68`, immediately after PRs #245-#254.
> 55 agents across 7 areas; every candidate finding independently re-checked with a
> refute-by-default verifier. **47 candidates → 46 confirmed, 1 refuted.**
>
> **Status:** the six REGRESSIONS (R1-R6) were fixed in PR #256. Everything under
> "PRE-EXISTING" is still open. **P1 is the pre-launch blocker.**
>
> Method caveat carried from the report: this repo is a shallow clone with squashed
> history, so `git blame` cannot attribute lines to PRs. Every "introduced by #NNN"
> claim rests on PR descriptions plus code reading — one finding was refuted precisely
> because that premise did not survive checking.

---


## 1. Verdict

**The product is not sound on the money path, but the ten merged PRs did not cause that.** #245–#254 introduced **six defects, all low or medium, none touching money, tenancy, or security**: one real regression (#253's `after()` + `headers()` call, which silently disables Apple Pay registration on the automatic path), one latent interaction between #253 and #247 (the cutover script leaves a stale domain), one low-severity currency assumption in #246's pricing fetch, and three copy/label inaccuracies in #252. #248, #249, #250 and #254 are clean — no verified defect in any of them. The serious problems are all **pre-existing**: one **critical** money defect (a declined-then-retried card is charged but the order is stranded in `payment_failed` forever, fulfilling nothing and telling the diner "no charge was made"), two **high** defects that mint bearer value (refund compensation credits gift cards whose debit never landed; the confirm-to-debit window lets one gift card be spent twice), and one **high** UX defect that defeats the entire table-QR feature. A note on method: this repo is a shallow clone with squashed history, so `git blame` cannot attribute lines to PRs — every "introduced by #NNN" claim below rests on the PR descriptions plus code reading, and one finding (`PR246-cta-alignment`) was refuted precisely because its regression premise could not survive that check.

---

## 2. Confirmed defects

Duplicates across audit areas have been merged. Severities are the post-verification corrected ones.

### 2A. REGRESSIONS introduced by #245–#254

| # | Severity | Title |
|---|---|---|
| R1 | Medium | `after()` calls `headers()` from a render — Apple Pay never auto-registers |
| R2 | Medium (launch) / Low (steady) | Cutover leaves `stripe_payment_method_domain` stale; new live account never registered |
| R3 | Low | Pricing tier assumes one currency across Stripe Prices |
| R4 | Low | Import summary says "Everything else was added" when nothing was added |
| R5 | Low | Wizard import button labelled "Go to my menu" advances to Stations |
| R6 | Low | #251's `incl. GST` line sits under an already-unreconciled Total *(aggravation, see P6)* |

---

**R1 — `ensurePaymentMethodDomain` calls `headers()` inside `after()` scheduled from a render** — `lib/stripe/payment-method-domain.ts:46` (scheduled at `app/dashboard/payments/queries.ts:52`, from `app/dashboard/payments/page.tsx:76`) — **#253**

`getBaseUrl()` (`lib/url.ts:98`) calls `await headers()` unconditionally as its first statement. Next 16 throws E839 when a request API is called inside `after()` unless `rootTaskSpawnPhase === 'action'` (`node_modules/next/dist/server/request/headers.js:26`, `request/utils.js:46`). `PaymentsPage` is a Server Component, so the phase is `'render'`. This is the only `after()` in the repo scheduled from a render — the other nine are Route Handlers or Server Actions, where the call is legal.

*Failure:* Owner finishes Connect onboarding → Stripe redirects to `/dashboard/payments?onboarding=return` → `syncStripeAccountStatus` sees `charges_enabled` true → schedules the `after()` → callback throws → the function's own `try/catch` swallows it into `reportError` (a no-op without `SENTRY_DSN`) → `paymentMethodDomains.list/create` is never issued → column stays NULL → re-fails on every subsequent load. Apple Pay never renders for that venue.

*Fix:* Resolve the hostname during render and pass it into the callback:
```ts
const host = new URL(await getBaseUrl()).hostname;   // in queries.ts, before after()
after(() => ensurePaymentMethodDomain(venueId, accountId, registeredDomain, host));
```
*Mitigation today:* the "Refresh status" button (`app/dashboard/payments/actions.ts:76`) runs in the `'action'` phase and works — it is currently the only path that ever registers the domain.

---

**R2 — Cutover script leaves `stripe_payment_method_domain` populated; the guard is account-blind** — `scripts/stripe-live-cutover.ts:99` and `lib/stripe/payment-method-domain.ts:48` — **#253 × #247**

The `--apply` UPDATE clears `stripeAccountId`, `stripeCustomerId`, `stripeSubscriptionId`, `stripeChargesEnabled` — but not the column #253 added in migration 0064 (it is also absent from the dry-run SELECT, so the operator gets no signal). The short-circuit is `if (registeredDomain === domain) return;` — keyed on hostname only. `accountId` (line 42) is not consulted before the return. A payment_method_domain is registered **on a connected account**; the column records a per-(venue, account) fact and is compared as a per-venue fact. Repo-wide, the column has exactly one writer and one reader; nothing ever clears it.

*Failure:* Operator runs `npx tsx scripts/stripe-live-cutover.ts --apply` at go-live. A venue with `stripe_payment_method_domain = 'order.prompt2eat.com'` from its test account keeps the value. Owner reconnects → new live `acct_` → `syncStripeAccountStatus` returns the stale domain via `.returning()` → hostnames match (`getBaseUrl` resolves from `AUTH_URL`/`VERCEL_*`, which do not change across a key swap) → immediate return, zero Stripe calls, permanently. No error, no Sentry event.

*Fix (both, they are independent):*
1. `scripts/stripe-live-cutover.ts:99` — add `stripePaymentMethodDomain: null` to the `.set()` and to the dry-run SELECT/report.
2. `lib/stripe/payment-method-domain.ts` — store the account id alongside the domain and compare on both, so any account replacement re-registers.

*Bounding:* the column is only populated for venues whose owner hit `?onboarding=return|refresh` or clicked "Refresh status" between #253 deploying and the cutover. If that set is empty, nothing breaks. **Check it with one query before running the cutover** (see §4).

---

**R3 — Annual/monthly currency mismatch produces an invented discount and a wrong "Prices in X" footnote** — `lib/billing/public-pricing.ts:88`, `app/_landing/landing.tsx:125` — **#246**

`currency` is captured from `monthly.currency` only; `annual.currency` is discarded at capture (`PublicPlanPrice` has one field). `annualSavingPercent` (line 133) then compares `annualCents` against `monthlyCents * 12` as bare integers — the `annualCents >= yearlyAtMonthlyRate → null` guard only holds when units match. Separately, `landing.tsx:125` takes the *first* resolved tier's currency and prints it as a blanket claim at line 569.

*Failure:* `scale_monthly` created in Stripe as USD while `pro_*` are AUD. Footnote reads "Prices in AUD"; the Scale card renders `formatPlanAmount(14900, "USD")`, which in `en-AU` with `currencyDisplay:"narrowSymbol"` prints **`$149`** — visually indistinguishable from AUD. Visitor is quoted AUD 149 for a plan that charges USD 149.

*Fix:* Add `annualCurrency` to `PublicPlanPrice`; return `null` from `annualSavingPercent` when currencies differ. Render the footnote per-tier, or omit it when resolved tiers disagree. **Adjacent, same assumption:** `formatPlanAmount` divides by 100 unconditionally — a zero-decimal currency (JPY) renders 14900 as `¥149`.

---

**R4 — Import summary claims items were added when zero were written** — `app/dashboard/menu/import/import-client.tsx:406, 419` — **#252**

`publishMenu` has an explicit all-duplicates branch (`actions.ts:348-358`) returning `{ok:true, addedCategories:0, addedItems:0, addedSizes:0, skippedDuplicates}` — the transaction never opens, `revalidatePath` never runs. The client branches only on `skippedDuplicates.length > 0` (`import-client.tsx:192-198`); the three counters have **zero consumers anywhere in the repo**. The screen is a fixed string: heading "Added to your menu" and body "Everything else from this import was added."

*Failure:* Owner re-imports the same menu photo — the exact case #252 was written for. All 24 items skipped, nothing written, and the screen asserts a partial success that did not happen.

*Fix:* Widen `skipped` state from `string[] | null` to carry the counts, then switch heading and closing line on `addedItems === 0` ("Nothing was added — every item is already on your menu.").

---

**R5 — Wizard summary's only forward control is mislabelled** — `app/dashboard/menu/import/import-client.tsx:434` — **#252**

The skipped-summary screen renders one button labelled "Go to my menu"; its `onClick` calls `onPublished()` when supplied. `app/onboarding/menu/page.tsx:30` passes `completeMenuStep`, which sets `onboardingStep = 4` and redirects to `/onboarding/stations`. Reachable on a fresh venue via a within-draft duplicate ("Flat White" under two categories).

*Fix:* Label from the caller — pass a `continueLabel` prop, "Continue to stations" in the wizard, "Go to my menu" on the dashboard.

---

### 2B. PRE-EXISTING defects

| # | Severity | Title |
|---|---|---|
| P1 | **Critical** | Declined-then-retried payment: charged, never confirmed, stranded forever |
| P2 | **High** | Refund compensation credits gift cards / restocks stock that was never debited |
| P3 | **High** | Confirm-to-debit window lets one gift card be spent twice |
| P4 | **High** | Table-QR `?table=` label dropped on every route to the menu |
| P5 | Medium | Failed/canceled refunds are never demoted from `succeeded` |
| P6 | Medium | ~~Printed customer receipt lines do not sum to the printed Total~~ **FIXED** |
| P7 | Medium | ~~All five backstop sweeps filter `status='confirmed'` — refunded orders skipped forever~~ **FIXED** (the prescribed fix below was itself wrong) |
| P8 | Medium | ~~Reports and Payments give contradictory 30-day revenue and GST~~ **FIXED** |
| P9 | Medium | ~~`/dashboard` home renders revenue on bare membership, bypassing `reports:view`~~ **FIXED** — and the class was 22 of 38 dashboard pages, not one |
| P10 | Medium | ~~Scheduled-pickup wall-clock→instant is wrong for ~11h before every DST transition~~ **FIXED** |
| P11 | Medium | ~~Scheduled pre-order stamped with the placement day's call number~~ **FIXED** |
| P12 | Medium | ~~Completed orders cannot be refunded or stepped back from the dashboard~~ **FIXED** |
| P13 | Medium | ~~Reports trend uses rolling 24h windows labelled in server (UTC) time~~ **FIXED** |
| P14 | Medium | ~~Onboarding marks a venue live with no Stripe account~~ **FIXED** |
| P15 | Medium | ~~Landing page advertises a Google Gemini ordering integration that does not exist~~ **FIXED** |
| P16 | Low ×10 | (see table at end) |

---

**P1 — CRITICAL — A declined-then-retried payment is charged but the order is never confirmed** — `app/api/stripe/webhook/route.ts:311` (failure write) vs `:115` (success write)

Both writers use `WHERE stripe_payment_intent_id = ? AND status = 'pending_payment'`. `payment_failed` is a terminal sink. The checkout retries against the **same** PaymentIntent: `payment-step.tsx:102-133` builds one `<Elements>` from one `clientSecret`, and on `confirmError` (`:358-366`) only calls `setError` + `setSubmitting(false)` — the diner re-confirms `pi_X`, which Stripe returned to `requires_payment_method` precisely so it can be re-confirmed.

*Failure:* $42 order → `pending_payment`, `pi_X`. Card declined → `payment_intent.payment_failed` → order becomes `payment_failed`. Diner enters a second card on the same page → `pi_X` succeeds → `payment_intent.succeeded` UPDATE matches **0 rows** → `confirmed` is empty → every `after()` block skipped → handler returns 200 so Stripe never retries.

*Blast radius (all key on `status='confirmed'`):* `enqueueJobsForOrder` (POS mirror), `depleteStockForOrder`, `redeemPointsForOrder`, `redeemGiftCardForOrder`, `earnPointsForOrder`, `notifyCustomerOrder`, `notifyNewOrder`. Order never appears on the kitchen board (`ACTIVE_ORDER_STATUSES`). The charge-vs-order backstop at `route.ts:146-159` is itself inside `for (const order of confirmed)`, so the one thing that would alert is silent exactly here. `refundOrder` rejects a non-paid order, so the venue **cannot even refund it in-product**. Gift-card and loyalty reservations evaporate (they count only `pending_payment`), so the diner keeps the balance *and* paid the discounted total. The diner's page renders "Payment was not completed — no charge was made" (`app/[slug]/order/[token]/page.tsx:439`) — false, after money moved.

*Fix (all three):*
1. `route.ts:117` — widen to `inArray(orders.status, ["pending_payment", "payment_failed"])` so a later success reclaims the row.
2. Stop using `orders.status` as the failure sink; record the decline in a nullable `last_payment_error` column and leave `status = 'pending_payment'`.
3. Add a reconciliation job that lists PaymentIntents with a succeeded charge whose order is not `confirmed`, and confirm them — the same shape as `reconcileRefundsForPaymentIntent`. There is no order-status reconciler today; `app/api/jobs` contains only `integrations` and `seo-stats`.

---

**P2 — HIGH — Refund compensation restores gift-card value and restocks ingredients that were never debited** — `lib/payments/refund-compensation.ts:162` (`restoreGiftCard`), `:104` (`restockOrder`)

`restoreGiftCard` takes its amount from `orders.gift_card_redeemed_cents` — the **reservation** written pre-payment by `applyOrderDiscounts` — and inserts a `refund_reversal` plus an unconditional `balanceCents + cents`. It never reads `gift_card_ledger`. Its sibling `reverseLoyalty` (`:120-153`) does the right thing: it SELECTs the actual `points_ledger` rows and reverses their net, returning 0 when there are none. `restockOrder` is gated only on `shouldRestock(fulfillmentStatus)`, and `fulfillmentStatus` defaults to `'new'`, so it is always true for an order that was never confirmed. The `(order_id, reason)` unique index makes the credit idempotent but does nothing about crediting a debit that never happened. `gift_cards_balance_nonneg` is a floor, not a ceiling.

*Failure (two independent triggers):*
- (a) Any non-confirmed-but-charged order refunded from the Stripe Dashboard — **including every order stranded by P1**. `reconcileRefundsForPaymentIntent` resolves the order by PI with **no status filter** (`refund-service.ts:214`), and `syncOrderRefundStatus` (`:283`) writes `status` with no prior-state predicate. GC-1 with $50: order reserved $40, stranded, owner refunds the orphan $10 charge → card goes 5000 → **9000**. Every ingredient in the order is added back to `on_hand_qty` though nothing was ever depleted.
- (b) A normally-confirmed order refunded before its deferred debit lands — `redeemGiftCardForOrder`/`depleteStockForOrder` run in swallowed `after()` blocks with a **daily** cron backstop, so a swallowed failure leaves up to 24h of exposure.

*Terminal:* once `status='refunded'`, `sweepGiftCardRedeem` and `sweepStockDepletion` filter `confirmed` and can never repair it. And the ledger stays internally self-consistent (`SUM(delta) == balance_cents`), so a reconciliation sweep would not flag it.

*Fix:* Mirror `reverseLoyalty` — have `restoreGiftCard` SELECT the order's `gift_card_ledger` rows and credit the negation of the observed `redeem` net (0 when absent). Gate `restockOrder` on the existence of a `depletion` stock movement for that order rather than on `fulfillmentStatus` alone. Add a status precondition to `syncOrderRefundStatus` so it cannot promote a `pending_payment`/`payment_failed` order straight to `refunded`.

---

**P3 — HIGH — Gift card can be redeemed twice in the confirm-to-debit window** — `lib/giftcards/queries.ts:81`, `app/[slug]/checkout/discount-actions.ts:276`

Availability = cached `balance_cents` − reservations on **other `pending_payment` orders**. The reservation is released the instant the webhook commits `status='confirmed'` (`route.ts:115-124`, a standalone auto-committed UPDATE); the balance drops only later, inside `after(() => redeemGiftCardForOrder(...))` (`route.ts:280-290`), which itself requires `status='confirmed'` and so can only run *after* the release. In that interval the card reads as fully available. The `FOR UPDATE` lock in `applyOrderDiscounts` does **not** close it — it re-sums with the same `pending_payment` predicate, so `available` legitimately reads the full balance. `insertDebit` clamps with `GREATEST(balance - cents, 0)` (`redeem.ts:56`, mandatory because of the non-negative CHECK), so the overspend is **silently absorbed rather than erroring**.

*Failure:* $50 card. Order A reserves 5000 and is paid. Before the `after()` debit commits, a second apply against the same code sees `available = 5000` and order B reserves 5000 and is paid. Both debits run: `GREATEST(5000-5000,0)=0`, then `GREATEST(0-5000,0)=0`. **$99 of food honoured on a $50 card, nothing logged.** The ledger permanently reads −9900 against a `balance_cents` of 0, breaking the invariant documented at `schema.ts:983-987`; a later top-up restores spendable value without settling the deficit. The comment at `discount-actions.ts:207` claiming the lock prevents "double-spend of a bearer instrument" is the claim that fails.

*Window:* `after()` uses an unbounded-concurrency p-queue, so the happy-path window is a response flush plus one DB round trip — hundreds of ms, scriptable against the unthrottled `applyOrderDiscounts` action, not human-clickable. **But a swallowed `after()` failure widens it to the next daily cron (`0 3 * * *`), ~24h, with no timing skill needed at all.**

*Fix:* Perform the debit inside the same transaction as the status flip, or make availability subtract reservations for any order that is `pending_payment` **or** is confirmed-and-lacking-a-`redeem`-ledger-row. Additionally, report (do not swallow) when `GREATEST` actually clamps.

*Points variant (LOW, same shape):* `lib/loyalty/balance.ts:65` — identical pattern, but `insertRedeem` has **no clamp** and `points_ledger` has no non-negative CHECK, so the balance goes negative and renders as `-500` on the account page (`points-panel.tsx:48`). Self-limiting (one extra redemption of the customer's own points, recouped from future earns), which is why it is low. Note the module comment at `balance.ts:47-49` accepts a *simultaneous* double-apply as a v1 edge; this is a different, wider window it does not cover.

---

**P4 — HIGH — Table-QR `?table=` is dropped on every route to the ordering page** — `app/[slug]/storefront.tsx:514`, `:331`, `app/[slug]/category-tiles.tsx:31`

`tableDeepLink()` (`lib/qr.ts:17`) points the printed QR at `{baseUrl}/{slug}?table=<label>` — the **landing** view. Ordering is impossible there: the item grid, `CartRail` and `ItemModifierSheet` all live inside the `{!isLanding ? …}` block (`storefront.tsx:627`). All three navigation paths to `/{slug}/menu` hard-code a table-less href. The label is persisted nowhere else — `cart-provider.tsx` stores only itemId/variantId/optionIds/quantity, there is no cookie and no `middleware.ts`.

*Failure:* Diner at table 12 scans the tent → `/pizzaco?table=12` (the desktop bar even shows a "Dine-in · Table 12" pill) → taps a category tile → `/pizzaco/menu` with no param → `initialTable=""` → checkout href has no `?type=dinein&table=` → `normalizeOrderType(undefined) → "pickup"` → order written with `orderType="pickup"`, `tableLabel=null`. Kitchen card and docket print **PICKUP**, the tables board never sees it so table 12 stays "Open", nobody takes the food to the table. The pill visible on the landing silently vanishes, so the diner gets no cue.

*Fix:* Propagate the param on all three hrefs (`/${slug}/menu?table=${encodeURIComponent(table)}`, and the same on the category anchor), **or** set a short-lived scoped cookie in `app/[slug]/page.tsx` when `sp.table` is present and read it in `menu/page.tsx` and `checkout/page.tsx`. The diner can self-correct at checkout, which is why this is not critical — but the whole feature (print sheet, onboarding QRs, live table board) is defeated on effectively 100% of scans.

---

**P5 — MEDIUM — A refund Stripe later reports failed/canceled is never demoted** — `lib/payments/refund-service.ts:232` and `:155`

Two optimistic writes with no walk-back. `refundOrder:155-158` maps every non-terminal Stripe status (`pending`, `requires_action`) to `"succeeded"` and immediately drives `syncOrderRefundStatus` + `compensateFullyRefundedOrder`. `reconcileRefundsForPaymentIntent:232` then does `if (refund.status === "failed" || "canceled") continue;` — **skipped, not applied** — before any DB write. `markRefundFailed` (`:302-310`) has exactly two callers, both strictly before Stripe returns. So `charge.refund.updated`, the event whose entire purpose is carrying a status transition, is a no-op for `pending → failed`.

*Failure:* $30 order paid by PayTo/BECS refunded in-product. Stripe returns `pending` → stored as `succeeded` → order `refunded`, gift card restored, loyalty reversed. Three days later the bank rejects and `charge.refund.updated` fires `failed` → `continue` → row stays `succeeded`. `planRefund` then blocks the retry with "This order is already fully refunded." Diner never got the $30. Bank-debit refunds are asynchronous by nature, so `pending` is the *normal* initial status there. `schema.ts:1422` documents the table as "only its status as Stripe reports back" — the demotion half is unimplemented.

*Fix:* In the reconcile loop, replace `continue` with an UPDATE keyed on `stripe_refund_id` setting the terminal status; when demoting a previously-`succeeded` row, re-run `syncOrderRefundStatus` so `orders.status` follows. Beware the compensating side effects already applied.

---

**P6 — MEDIUM — Printed customer receipt line items do not sum to the printed Total** — `app/dashboard/orders/order-ticket.tsx:88`, `order-card.tsx:195`, `ticket-drawer.tsx:123`

`applyOrderDiscounts` writes `totalCents = subtotal − promo − bank − points − giftCard` but never rewrites `orders.subtotalCents` or `order_items.line_total_cents`, so line rows always sum to the **subtotal**. `KitchenOrder` (`queries.ts:60-92`) selects `subtotalCents`, `totalCents`, `taxCents`, `refundedCents` — never the discount columns. All three owner surfaces print full-price lines then a bare Total. `print-context.tsx:54` documents this print kind as *"the customer receipt"*, and the ticket ends with "Thank you".

*Failure:* 3 × Burger @ $10 with a $5 promo → paper reads `3× Burger $30.00 / Total $25.00 / incl. GST $2.27`. Nothing accounts for the $5. The diner's own receipt page and the notification email **both** print Subtotal/Promotion/Total for the identical order — `lib/customer/order-email.ts:51-53` even carries the comment stating that without the breakdown "the lines visibly sum to more than the stated Total." The team fixed this class of bug on the email and left it on the three owner surfaces.

*Fix:* No schema or query change needed for a single line — `subtotalCents` is already on `KitchenOrder`. Render `Subtotal` and `Discount −$(subtotal − total)` above the Total when they differ. Add the four discount columns to the two selects only if a per-component breakdown is wanted.

**RESOLVED.** `app/dashboard/orders/discount-line.ts` holds the decision, exactly
as `tax-line.ts` holds the GST one, and all three surfaces render it in their own
styling. No schema, query or migration change — as predicted.

The assumption the whole fix rests on was verified at the source rather than
taken on trust: `lib/payments/line-plan.ts:186-193` accumulates
`subtotalCents` from the SAME `lineTotalCents` values it writes to
`order_items`, and `discount-actions.ts` reads `orders.subtotalCents` without
ever rewriting it or the line rows. So the printed Subtotal is, by
construction, exactly what the printed rows add up to.

Two guards worth naming. The helper returns null when `total >= subtotal`, not
just when they are equal — the product charges no per-order fee, so a total
above subtotal means data we do not understand, and an unexplained Total is a
smaller error than a confidently wrong breakdown a venue might carry into its
books. And the undiscounted path renders byte-identically to before, so the
common docket is unchanged.

Pinned by `test/order-discount-line.test.ts`, which covers the arithmetic and
asserts all three surfaces resolve through the shared helper and off the
order's own `subtotalCents` rather than a re-summed item list. A counterweight
test keeps a Total on every surface. Mutation-verified against three reverts.

**Still open, and deliberately not folded in:** `refundedCents` is on
`KitchenOrder`, so a docket printed for a partially refunded order still shows a
Total that no longer reflects the money the venue kept. That is a different
defect from this one and wants its own decision about what a reprinted receipt
should say after a refund.

**On #251:** the GST figure itself is correct — `discount-actions.ts:288` recomputes `finalTaxCents` off the discounted total. #251 introduced no arithmetic error; it added a correct line beneath an already-unreconciled Total, and the commit positioned the docket as "enough for the shoebox with no dashboard lookup later." That framing is what turns a pre-existing presentational gap into a tax-invoice problem.

---

**P7 — MEDIUM — All five backstop sweeps filter `status='confirmed'`, so any refunded order is permanently skipped** — `lib/giftcards/redeem.ts:115`, `lib/loyalty/redeem.ts:104`, `lib/loyalty/earn.ts:134`, `lib/stock/depletion.ts:168`, `lib/integrations/dispatch.ts:201`

Each webhook call site states the fast path is "a latency optimization only — the cron sweep re-derives any missing job from order state." That contract is false for any order that leaves `confirmed`. `syncOrderRefundStatus` rewrites the status, `orderStatusForRefunds` returns `partially_refunded` for any `0 < refunded < total`, and **nothing anywhere writes `confirmed` back** (the only writer is the webhook's `WHERE status='pending_payment'`). `compensateFullyRefundedOrder` deliberately does nothing on partial refunds.

*Failure:* Order Y redeems $20 of a gift card and 300 points and has recipes mapped. Its `after()` block is lost (deployment restart mid-`waitUntil`). Two hours later the owner issues a $5 goodwill partial refund → `partially_refunded`. The next cron tick excludes Y from all five sweeps, permanently: the $20 never leaves the card, the 300 points are never debited, ingredients are never depleted, and the order is never mirrored to the POS.

*More reachable than that:* `sweepLoyaltyEarn` needs **no infrastructure failure at all**. `claimOrder` is fire-and-forget (`checkout-client.tsx:138`, `.catch(() => {})`); when the link lands after `payment_intent.succeeded`, `earnPointsForOrder` returns 0 and the sweep is the only path that will ever credit those points. A routine goodwill partial refund before 03:00 destroys them.

*Fix (as first written):* `inArray(orders.status, PAID_ORDER_STATUSES)` for the three ledger-debit sweeps; `inArray(orders.status, ACTIVE_ORDER_STATUSES)` for depletion and the POS mirror (a fully refunded order should not deplete stock or mirror). `lib/db/order-status.ts` was written for exactly this — its docblock names the hazard verbatim — and the read paths were migrated while the sweep predicates were not.

**RESOLVED — but NOT with the predicate prescribed above, which was wrong.**

`PAID_ORDER_STATUSES` includes `refunded`, and putting a fully refunded order
back into the three ledger sweeps would have been a new money defect pointing
the other way. `compensateFullyRefundedOrder` restores by READING the ledger
(`restoreGiftCard` and `reverseLoyalty` both bail on `rows.length === 0`), so a
full refund whose debit never landed correctly finds nothing and restores
nothing. A sweep debiting that order afterwards takes stored value — or credits
points — for an order the diner was refunded in full, and no later pass ever
undoes it, because the compensation already ran and wrote no reversal row.

Verified against the code rather than reasoned about in the abstract:
`refund-service.ts:175` and `:277` call the compensation **only** when
`syncOrderRefundStatus` returns exactly `"refunded"`, so a partial refund gets
no compensation at all and genuinely still owes its debit.

All five sweeps therefore use `ACTIVE_ORDER_STATUSES` — `confirmed` +
`partially_refunded`, stopping short of `refunded`. The webhook FAST PATHS keep
`eq(status, 'confirmed')`: they read the order they have just confirmed, and
widening them would let a redelivered webhook debit a refunded order.

Pinned by a harness in `test/order-confirm-reclaim.test.ts` that scans each
sweep body for the narrow predicate, requires the shared grouping, asserts the
fast paths stay narrow, and asserts `ACTIVE_ORDER_STATUSES` excludes
`refunded` with the reason above. Mutation-verified against three reverts,
including the wrong prescription itself.

---

**P8 — MEDIUM — Reports and Payments contradict each other on 30-day revenue and GST** — `app/dashboard/reports/page.tsx:90` and `:105`; also `app/dashboard/page.tsx:209`, `app/admin/stats/page.tsx:76`, `app/admin/page.tsx:76`

Reports filters `eq(orders.status, "confirmed")` for both the order rows and the item rows. `getConfirmedSalesSummary` (`app/dashboard/payments/queries.ts:133`) uses `inArray(orders.status, PAID_ORDER_STATUSES)` and subtracts succeeded refunds. Opposite conventions, same window, both labelled 30 days.

*Failure:* One $55 order, $10 goodwill refund → `partially_refunded`. Payments: **"Sales · 30d $45.00"**. Reports: **Revenue $0.00, Orders 0, GST collected $0.00, "No sales yet"** — and the order drops out of Top Items and the order mix entirely. Meanwhile the board card and docket for that same order print `Total $55.00 / incl. GST $5.00`, because `ACTIVE_ORDER_STATUSES` includes `partially_refunded`. A single refunded cent zeroes an entire order out of the venue's revenue and GST line.

*Fix:* Use `PAID_ORDER_STATUSES` in all five query sites and subtract succeeded refunds from the revenue and GST aggregates, matching the Payments convention. `docs/audit/PlatformAudit-2026-07.md:70` already asserts "Revenue reporting is now net of refunds" — Reports does not honour it.

**RESOLVED.** All five sites migrated, with the refund subtraction in
`lib/orders/net-money.ts` so a sixth aggregate cannot pick a third convention.

Two things the finding did not anticipate, both decided rather than guessed:

**GST has to be APPORTIONED, not looked up.** The `refunds` table stores
`amount_cents` and nothing else — there is no tax component on a refund row to
subtract. So the GST going back is the same fraction of the order's own
recorded `taxCents` as the refund is of its total, computed PER ORDER. A single
ratio across a window's totals would be wrong whenever a venue changed its GST
setting mid-window, since `taxCents` is 0 on everything after. Deriving from
the order's STORED tax rather than re-applying today's rate is the same
reasoning: a refund must unwind the tax the order actually carried.

**Platform revenue is deliberately NOT netted.** `admin/stats` computes
`computeApplicationFeeCents(o.totalCents)`, and Stripe does not proportionally
refund an application fee on a partial refund unless the refund asks it to —
which this codebase's refunds do not. Netting it would understate what the
platform kept, the opposite error to the one being fixed. GMV nets; the fee
line stays gross with a comment naming the flag that would have to change with
it.

Reports now also SHOWS the subtraction ("net of $X refunded" under Revenue)
rather than silently reporting a smaller number, and the page description no
longer says "confirmed orders". The order COUNT stays gross on every site — a
partly refunded order is still an order the venue served, which is how Payments
already counted it.

Pinned by `lib/orders/net-money.test.ts`: the apportionment arithmetic, plus a
harness asserting no aggregate filters on `confirmed` alone, all five resolve
through `PAID_ORDER_STATUSES`, every money site reads succeeded refunds, and
each joins refunds to ORDERS so a refund lands in its order's window rather
than its own. Mutation-verified against four reverts, including the halfway
state — status widened but refunds not netted — which would have counted
refunded orders at full value and been worse than the original bug.

---

**P9 — MEDIUM — `/dashboard` home renders the venue's trading position on bare membership** — `app/dashboard/page.tsx:185`

Gates on `requireVenue()` (membership only), then queries 30 days of confirmed orders and renders today's revenue (`:357`), the 7-day chart with a `{dollars(weekTotal)} total` badge (`:413`), average order value (`:369`) and the 30-day order mix (`:456-500`). `app/dashboard/reports/page.tsx:72` gates the *same figures* on `reports:view` with the comment "a kitchen login has no business reading it." `reports:view` is in `MANAGER_PERMISSIONS`, not `STAFF_PERMISSIONS`. The Home nav entry carries no `permission`, so it is always visible — and `requireVenuePermission` denies by redirecting to `/dashboard?denied=1`, so a staff member who types `/dashboard/reports` is **bounced onto the page showing the numbers `reports:view` was protecting**, with no explanation (nothing reads the `denied` param).

*Why the green suite misses it:* `test/authz-coverage.test.ts` only enrols files whose source contains `"use server"`. A read-only Server Component is out of scope by construction.

*Fix:* Wrap the revenue/AOV/trend/mix block in `await hasVenuePermission(venue.id, "reports:view")` and render the operational tiles (open orders, prep queue) unconditionally. Also make `?denied=1` render an explanatory banner.

**RESOLVED — and the finding understated it by a factor of 22.** Fixing this meant
asking which other read-only pages had the same shape, and the answer was
**22 of the 38 pages under `app/dashboard`**: every settings screen (tax, brand,
hours, prep stations, order-notification recipients), all four stock screens
(ingredient COSTS and supplier reorder data), the whole menu editor with its
prices, `integrations`, `marketplace`, `media`, `studio` and `tables`. Each
one's sibling `actions.ts` already gated its WRITES on a permission; the READ
beside it was open to any member. The SECRET_PAGES docblock in
`test/authz-coverage.test.ts` had already written the rule down — "a gate on the
write without the same gate on the read is decorative" — for one page.

All 22 now gate on the permission their own actions require, and
`app/dashboard/sidebar.tsx` carries the matching `permission:` so nobody is
shown a link that will bounce them. `/dashboard` itself stays open to every
member DELIBERATELY: `requireVenuePermission` redirects there on denial, so
gating it would put a denied viewer in a redirect loop. It gates its own
privileged tiles inline instead — and gates them by NOT FETCHING, so the
figures never reach the render at all. The Concierge tile went behind the same
gate: its suggestions quote per-dish gross margin ("Pad Thai margin is 38%").
Kitchen staff get an operational KPI row (open orders / preparing / ready)
built from the live queue they already hold `orders:view` on.

The structural gap is closed too. `test/authz-coverage.test.ts` only enrolled
files containing `"use server"`, which is *why* a read-only Server Component was
invisible to it; it now also walks every `app/dashboard/**/page.tsx`, requires a
gate or a written exemption, and asserts the home page's inline gate really does
guard the query rather than just the markup. Mutation-verified against three
separate regressions.

---

**P10 — MEDIUM (latent) — Wall-clock→instant conversion is wrong for ~11h before every DST transition** — `lib/schedule.ts:124`

`venueWallClockToInstant()` derives the zone offset at the **provisional** instant `Date.UTC(y,m,d,h,mi)` rather than at the target instant. For a UTC+10/+11 zone the sample point is 10-11h late, so any DST transition in that gap is applied to the wrong side. `validateScheduledForConfig`'s round-trip guard (`:193-196`) then rejects with "That time isn't available. Please pick another." — but `buildPickupSlots` (`:267`) uses the same helper **without** the guard, so the picker offers exactly those slots. This breaks the module's stated invariant at `:5-7` that offered and accepted slots "cannot drift."

Verified by running the real exported functions: Sydney venue, Sat 17:00-21:00, `now` = Fri 2 Oct 2026 → the picker offers 16 slots and the validator rejects all 16.

*Why it is latent, not live:* `venues.timezone` is `text notNull default 'Australia/Brisbane'` and **no application code ever writes it** — a grep of every `.ts/.tsx` returns only reads. The onboarding insert omits it, there is no settings field, no admin action, no migration UPDATE. Brisbane has no DST, so every venue the product can currently create is clean. It becomes the full outage the moment one row gets a DST zone — one UPDATE, or the settings UI this fully-threaded column is plainly waiting for.

*Fix:* Two-pass offset resolution — compute the provisional offset, subtract it, then re-derive the offset at that corrected instant and use it (the standard fix). Then either add the round-trip guard to `buildPickupSlots` or make both call one guarded helper. `lib/schedule.test.ts:9` deliberately pins `timeZone: "UTC"` and comments that it is "DST-free", which is why the suite is green.

**RESOLVED**, both halves, and the reproduction was re-run against the real
exported functions before anything changed rather than taken from the finding:
Sydney venue, Sat 17:00-21:00, `now` = Fri 2 Oct 2026 gave **16 slots offered,
0 accepted, 16 rejected**. Exactly as recorded.

The conversion is now two-pass, and the second pass is the correctness rather
than a refinement — the offset has to be sampled somewhere, the only available
starting point is the components read as UTC, and for a UTC+10 zone that sits
ten to eleven hours before the answer.

`buildPickupSlots` did not get a copy of the round-trip guard. Both callers now
go through one `venueWallClockToInstantStrict` returning `Date | null`, so
"offered ⟺ accepted" is structural instead of two call sites remembering the
same rule. That was the actual defect: the module's docblock already promised
the two cannot drift, and one of them was simply not enforcing it.

The test that carries this asserts the INVARIANT — every slot the picker offers
must validate — rather than the offset arithmetic, so it keeps holding if the
conversion is ever rewritten. The suite also now covers the direction easy to
over-correct into: the REPEATED hour at fall-back (5 Apr 2026, 02:00-02:59 twice
in Sydney) must be accepted, not refused, because both readings genuinely exist.

Mutation-verified against three reverts: the single-pass offset, the slot
builder dropping back to the unguarded conversion, and the strict helper
ceasing to reject.

**Still true, and still the reason this was latent:** no application code writes
`venues.timezone`. Every venue the product can currently create is Brisbane,
which has no DST. This fix means the settings UI that column is plainly waiting
for can ship without taking scheduling down with it.

---

**P11 — MEDIUM — Scheduled pre-orders get the placement day's call number** — `lib/orders/daily-number.ts:31`

`serviceDate` is derived from `new Date()` and the `(venue_id, service_date)` counter for **that** day is incremented. `placeOrder` calls it unconditionally at `checkout/actions.ts:310`, including for orders carrying a `scheduledForInstant` days out. It is the only writer of `orders.dailyNumber` — no re-stamp job exists. `scheduling_max_days_ahead` defaults to 7, and `buildPickupSlots` explicitly offers days labelled "Tomorrow" and "Wed 15 Jul".

*Failure:* Monday, a Thursday pre-order is the 5th order of Monday → `dailyNumber = 5`. Thursday the counter restarts; by 11:40 the venue is on order 5. At 12:00 the pre-order joins the make-now queue. Two cards badged `#5`, two dockets headed `ORDER 5`, two station labels tagged `5-K`. The card/ticket/docket carry a `createdAt` line with day+month, a weak disambiguator — **the station label (`station-label.tsx:32-73`) carries none at all**, so the one surface designed to be sorted by eye is byte-identical. Both diners are also independently told "Order 5" (`app/[slug]/order/[token]/page.tsx:457`, `lib/customer/notify.ts:84`).

*Fix:* `assignDailyNumber(venueId, serviceInstant)` — derive `serviceDate` from `scheduledForInstant ?? new Date()`.

**RESOLVED**, with the parameter REQUIRED rather than defaulted. A default of
`new Date()` is precisely how this went wrong the first time, and it would have
let the next caller reintroduce it silently; the signature now forces the
decision, and the compiler caught the single existing call site as intended.

Fixing it surfaced a second, unrelated defect in the same function. "Which
venue-local day is this" had TWO implementations — this one and
`dashboard/page.tsx`'s `dayKeyFormatter` — and they had already drifted: the
dashboard's caught a timezone `Intl` rejects and fell back to UTC, while this
one did not, so a corrupt `venues.timezone` fell into `assignDailyNumber`'s
outer catch and cost the order its call number ENTIRELY. Days in the wrong zone
are strictly better than no number. Both now resolve through
`lib/orders/service-date.ts`, which exports a reusable formatter for the
dashboard's per-row bucketing and a one-shot for the counter, so the dedup costs
the loop nothing.

No DST interaction with P10, and worth stating because the two look adjacent:
formatting an instant INTO a local date is DST-safe on its own, since `Intl`
resolves the offset in effect at that instant. P10's bug is the opposite
direction — wall-clock to instant, which must pick an offset before it knows the
instant. Pinned by a test asserting the same wall-clock hour maps correctly
either side of a Sydney DST change.

Pinned by `lib/orders/service-date.test.ts`, mutation-verified against four
reverts: the wall-clock read, a defaulted parameter, a call site passing
placement time, and the dropped timezone fallback.

---

**P12 — MEDIUM — Completed orders cannot be refunded or stepped back** — `app/dashboard/orders/orders-board.tsx:230`

The COMPLETED column renders `onOpen={isCompleted ? undefined : …}` and `compact={isCompleted}`. The compact branch (`order-card.tsx:59-97`) is a bare `<li>` with no click handler, no `OrderStatusControls`, no `PrintButton`, and without `onOpen` the enlarge button is not rendered either. `RefundControl` is mounted in exactly one place repo-wide — `ticket-drawer.tsx:139` — and is itself perfectly willing to refund a completed order. `BACKWARD.completed = { prev: "ready" }` (`order-status-controls.tsx:32`), documented as the "back-one-step correction", is unreachable.

*Failure:* Order handed off at 12:40; customer returns at 12:55 wanting a refund. The card in Completed has nothing to click, and there is no other order-detail route in the dashboard. After 4h (`RECENT_COMPLETED_WINDOW_MS`) it leaves the board entirely.

*Not as bad as it looks:* a Stripe-Dashboard refund is **not** unreconciled — `charge.refunded` → `reconcileRefundsForPaymentIntent` inserts the refunds row idempotently, rewrites `orders.status`, and runs compensation. The real loss is actor attribution: `actorUserId: null`, note "Reconciled from Stripe", and no `recordVenueAudit("order_refunded")` entry.

*Fix:* Keep the compact card but restore the enlarge affordance (`onOpen`) on completed orders and render the drawer read-only apart from `RefundControl` and the back-one-step control. Also correct the stale comment at `order-status-controls.tsx:66-67` ("nothing forward and nothing back"), which contradicts its own table.

**RESOLVED**, and one part of the prescribed fix turned out to need no work —
verified rather than assumed. The drawer ALREADY mounts `RefundControl`,
`OrderStatusControls` and `PrintButton` unconditionally, and for a completed
order `BACKWARD.completed` is populated, so it renders "Back to ready" perfectly
well. `RefundControl` gates on PAYMENT status (`confirmed` /
`partially_refunded`) and never reads `fulfillmentStatus`, so a completed order
was always refundable by it. The finding inferred drawer work from the symptom;
the whole defect was that the BOARD never opened the drawer.

Two changes, then: `orders-board.tsx` passes `onOpen` for completed orders, and
the compact card gained the enlarge affordance — which `onOpen` alone would not
have surfaced, since the button lived only in the full card's header.

Adding it copy-pasted the button's class literal, and
`test/button-literal-drift.test.ts` failed — the repo's own harness catching the
copy before review did. Both branches now share one `OpenTicketButton`, which is
the better structure and only happened because that test exists.

The stale comment mattered more than tidiness. It claimed completed cards render
no controls "because nothing forward and nothing back", contradicting the table
twelve lines above it: `BACKWARD.completed` is populated, so a completed order
falls straight through that guard. A reader trusting it would conclude the
back-one-step path did not exist and build it again.

Pinned by `test/completed-order-actions.test.ts`, including a test asserting the
drawer's three controls stay unconditional so the fix cannot be undone from the
other end. Mutation-verified against three reverts.

---

**P13 — MEDIUM — Reports trend uses rolling 24h windows labelled in server time** — `app/dashboard/reports/page.tsx:120-121`

`dayEnd = now - d * dayMs` with buckets `[dayEnd − 24h, dayEnd)` — rolling windows anchored to the request instant, not calendar days. The label is `toLocaleDateString("en-AU", {day,month})` with **no `timeZone` option**, so it formats in the Node process zone (UTC on Vercel; no `TZ` is set anywhere). `venue.timezone` is on the row the page already loaded, and `lib/time.ts:11` already provides the tz-aware helper. The Overview does it correctly on the identical rows: `dayKeyFormatter(venue.timezone)`, commented "Bucketed by venue-local day in JS (tz-correct via Intl)" (`app/dashboard/page.tsx:218-247`).

*Failure:* Sydney venue, owner opens Reports at 09:00 Wed. The last bar is labelled "5 Aug" and covers 09:00 Tue → 09:00 Wed Sydney. Wednesday morning's takings appear under Tuesday; Tuesday's evening trade is split across two bars. The Overview on the same dashboard reports Wednesday's takings under "Today." Bar *heights* are wrong versus calendar days regardless of labels.

*Fix:* Reuse `dayKeyFormatter(venue.timezone)` and bucket by venue-local calendar day, exactly as `app/dashboard/page.tsx:220` does. (`app/admin/stats/page.tsx:90` has the same copied pattern but is cross-venue, where no single timezone applies.)

**RESOLVED**, and the day-series construction is now shared rather than copied a
second time. `venueCalendarDays` joins `venueDayFormatter` in
`lib/orders/service-date.ts`, and BOTH charts use it — the Overview's inline
`dayFor` is gone. Two charts on one dashboard drawing the same rows through two
different definitions of "a day" is the whole finding; leaving one of them
private would have left the next copy free to drift again.

Deriving the series by calendar arithmetic rather than subtracting 86_400_000
also makes it correct across a DST week, where a venue-local day is 23 or 25
hours long — pinned by a test over the 4 Oct 2026 Sydney transition. The old
shape would drift an hour per transition and eventually skip or repeat a day.

The `timeZone: "UTC"` on the label formatter is load-bearing and commented as
such at both sites: `VenueDay.date` is a CALENDAR DATE built in UTC, not an
instant, so formatting it in the process zone shifts it and labels a bar with
its neighbour's date — a subtler version of the bug being fixed.

`app/admin/stats/page.tsx` deliberately keeps its own pattern. It is cross-venue,
so no single timezone applies, and forcing it through a venue-scoped helper
would be wrong rather than consistent.

Pinned by `lib/orders/service-date.test.ts`: the series arithmetic (month
boundaries, DST, the non-overlapping prior window the Overview's Delta baseline
depends on) plus a harness asserting neither chart slices rolling windows off
the request instant or formats a label without a timeZone. Mutation-verified
against three reverts, including a prior window overlapping the current one by a
day, which would silently distort every percentage on the Overview.

---

**P14 — MEDIUM — Onboarding marks a venue live with no Stripe account** — `app/onboarding/live/actions.ts:29`

None of the six wizard steps creates or connects a Stripe account (`stripe.accounts.create` appears exactly once in the repo, in `app/dashboard/payments/actions.ts:33`). `finishOnboarding` stamps `onboardingCompletedAt` unconditionally under the heading "You are ready to go live"; `isLive` derives purely from that timestamp. The storefront shows no banner and checkout's only gate is `!venue.isLive`. Nothing on the dashboard warns — `needsOnboarding` is false once the wizard finished, and there is no `charges_enabled` check on `page.tsx`, `sidebar.tsx` or `layout.tsx`.

*Failure:* Owner finishes the wizard, prints table QRs from the go-live step, opens. Every diner browses, builds a cart, types name/email/phone, taps "Continue to payment · $24.50" and gets "This venue isn't accepting online payments yet." The dashboard shows zero orders and no explanation.

*Correctly fails closed:* the reject at `checkout/actions.ts:149` runs **before** any item fetch, price recompute, transaction or PaymentIntent — no order row, no PI, no money at risk. This is a dead-end plus a false heading, not a data defect.

*Fix:* Gate the "You are ready to go live" copy on `stripeChargesEnabled`, add a persistent dashboard banner and a storefront "not taking orders yet" banner when it is false, and move the payments check into the checkout page gate so the diner is told before filling the form.

**RESOLVED**, all four parts, via a new `acceptsOrders` on the public venue
shape (`onboarding_completed_at is not null AND stripe_charges_enabled`).

The tempting fix was to fold payments into `isLive` itself — one line, and all
three diner gates would have covered it for free. Deliberately NOT done. "The
owner finished setup" and "the venue can take money" are different facts;
`app/admin` reports on the first, every diner surface needs the second, and
overloading the name is how the next person gets a surprise. A test pins
`isLive` to the onboarding timestamp alone.

The three diner surfaces (storefront, menu, checkout) now gate on
`acceptsOrders`, so a diner learns before building a cart rather than on the
final tap. `placeOrder`'s reject stays exactly where it is and is commented as
the authoritative block — it fails closed before any item fetch, price
recompute, transaction or PaymentIntent, and a test exists specifically to stop
it being "deduped" now that the UI checks too. The page gate is the courtesy;
the action gate is the control.

The concierge follows `acceptsOrders` as well: it exists to help someone order,
so offering it on a venue that cannot take one is the same dead end one step
earlier.

Owner side: the wizard's final heading reads "One step left: connect payments"
with a CTA when charges are off, instead of promising readiness above the QR
codes it invites the owner to print. And the dashboard finally says something —
this state was silent in every direction, because `needsOnboarding` goes false
the moment the wizard ends, leaving an owner staring at an empty board with no
indication that every checkout was being turned away.

Mutation-verified against three reverts: the checkout page back on `isLive`, the
one-line `isLive` fold, and `placeOrder`'s reject deduped away.

---

**P15 — MEDIUM — Landing page advertises a Google Gemini ordering integration that does not exist** — `app/_landing/landing.tsx:309` (also `:222`, `:241`, `:320`)

Sold as shipped in three places, including a full FeatureRow: "Prompt2Eat plugs into Google Gemini, so a diner can order from your venue without opening anything new… They ask Gemini, it places the order, your kitchen gets the ticket," illustrated with "✓ Placed. The kitchen has it." No feature flag, no "coming soon" qualifier.

The capability does not exist: no Google/Gemini/MCP SDK in `package.json` (the concierge runs on Claude Haiku), no agent/tool endpoint among the 11 API routes, no `.well-known/ai-plugin.json`, no `potentialAction`/`OrderAction` in the JSON-LD. There is exactly one order-creation path repo-wide — `placeOrder`, a `"use server"` action reachable only from the venue storefront. The repo's own record agrees: `docs/DEPLOYMENT-PLAN.md:105-106` lists "Order with Google" and "agent/MCP interface" under **"Confirmed genuinely absent."** It also violates the codebase's stated standard at `lib/marketing-content.ts:7-8` ("no invented capabilities").

*Fix:* Remove the FeatureRow and both chips, or re-label them explicitly as roadmap. This is a misleading-representation exposure (notably under Australian Consumer Law given the AU/PayTo positioning), and `app/robots.ts` explicitly admits GPTBot/ClaudeBot/PerplexityBot, so the claim will propagate into AI answers once `prompt2eat.com` is attached. Currently gated behind `MARKETING_HOSTS`, which per the deployment plan is still an open operator step.

**RESOLVED by REMOVING, not re-labelling** — all four sites, including the
mocked "✓ Placed. The kitchen has it." confirmation, which was a rendered
screenshot of a completed order through a path with no implementation at all.

Removal rather than a "coming soon" label is a deliberate choice, matching how
the PayTo saved-mandate claims were handled earlier in this series. Whether
agent ordering is on the roadmap is a product decision, not one to infer from
the fact that someone already wrote the copy — and leaving a present-tense claim
standing while that question is open is the worse default. Re-adding it
explicitly marked as roadmap is a small change if that is the intent.

Every premise was re-verified against the repo before removal: no
google/gemini/genai/MCP package in `package.json`, no `.well-known/ai-plugin.json`
(that directory serves only `apple-app-site-association` and `assetlinks.json`),
and exactly one `placeOrder` — a `"use server"` action reachable only from the
venue storefront.

Pinned by `test/marketing-truthfulness.test.ts`. The standard was already
written down twice — `lib/marketing-content.ts` ("no invented capabilities") and
`content/voice.md` — and the claim shipped anyway; a stated standard with
nothing enforcing it is how that recurs. The harness bans each term ALONGSIDE
what would have to exist to make it honest, and separately asserts no such
dependency has appeared, so adding a real integration forces someone to revisit
the ban deliberately instead of leaving it in place by inertia.

`content/voice.md` is deliberately outside the scan: its rules have to NAME the
claims they ban, so scanning it flags the prohibition as the violation and the
tempting fix is to weaken the rule. A counterweight test keeps Apple Pay, Google
Pay and PayTo advertised — all three are really wired up, and stripping copy
until the page says nothing is not a fix either.

---

### 2C. Low-severity, confirmed

| ID | File:line | One-line summary | Fix |
|---|---|---|---|
| ~~L1~~ **FIXED** (and it was not a low — see below) | `lib/payments/refund-service.ts:161` | `charge.refunded` racing an in-product refund → 23505 on the partial unique index; the action throws, a succeeded refund is reported as failed, no `venue_audit` row, orphan `pending` row forever. On a *partial* refund the false error induces a retry that passes `planRefund` → genuine double refund. | Reserve the id before the Stripe call (idempotency-key-derived), or wrap the stamp UPDATE in a conflict-tolerant path that merges into the webhook-inserted row. |
| L2 | `app/dashboard/stock/actions.ts:231` | Opening count of **0** on a NULL `on_hand_qty` computes `deltaQty = 0`, `recordStockMovement` bails at `movements.ts:40`, nothing is written, and the action redirects as success. This is the default path — the form pre-selects `set` exactly when `onHandQty` is null and the placeholder is literally "0". | Force the `on_hand_qty` write when `locked?.onHandQty == null`, treating NULL→0 as a real transition. |
| ~~L3~~ **FIXED** | `lib/payments/refund-compensation.ts:213` | `restockOrder` re-derives from **today's** `recipe_lines` and never consults the order's actual `depletion` movements. A recipe edited mid-order over-restocks; a missed depletion restocks from nothing, permanently (the sweep is already locked out by `status='refunded'`). | Restock from the order's recorded `depletion` movements, negated. |
| L4 | `app/dashboard/stock/overview/page.tsx:90` | 30-day usage filters `reason='depletion'` only, so `refund_restock` never nets out — usage, run-rate, days-of-cover and COGS all overstate. Separately `REASON_LABEL` (`:17-24`) has no `refund_restock` entry, so the feed prints the raw enum `REFUND_RESTOCK`. | Include `refund_restock` in the sum; add the label. |
| ~~L5~~ **FIXED** | `lib/promotions.ts:118` | The `audience:"new"` guard short-circuits on `customerId`, which is set only by fire-and-forget `claimOrder` (`checkout-client.tsx:138`, `.catch(() => {})`). If that call fails, a signed-in returning customer gets the first-timers-only promo written to the order and the PI, and also loses their loyalty earn. | Set `orders.customerId` in `placeOrder` — the checkout page already resolved the signed-in customer server-side. |
| L6 | `app/dashboard/tables/queries.ts:69` | "Current session" is a fixed 2h rolling label-keyed sum with no close control, so a new party inherits the previous party's spend and order count until it ages out. Prepay model, so nothing is owed — a display-accuracy defect. | Add a dwell-gap boundary, or relabel to "Recent orders (2h)" and drop the single-`orderRef`+combined-total pairing. |
| L7 | `app/dashboard/tables/queries.ts:122` | Table identity is the free-text `tableLabel` snapshot with no FK. Renaming a table orphans its in-flight session; renaming a *different* table onto that string mis-attributes the session. Blast radius is the tables board only. | Add `orders.table_id` alongside the label snapshot and join on it. |
| L8 | `app/[slug]/checkout/payment-step.tsx:224` | `runDiscount` wraps its body in `if (result.ok)` with no `else`, no catch, and every caller uses `void`. On `{ok:false}` both status states stay "idle", so Apply looks broken. Most reachable trigger: after a decline the order is `payment_failed`, so every subsequent Apply silently no-ops for the session. No financial consequence — the gift card is never consumed (the reservation rolls back with the transaction). | Add an `else` setting an error status, and a `.catch` on every `void runDiscount(...)`. |
| L9 | `app/[slug]/storefront.tsx:505` | Landing branch has no empty-menu state — the "hasn't published a menu yet" copy lives only in the `!isLanding` block, and the link to `/menu` is gated on `menu.length > 0`. A venue that skipped the menu step hands out QRs that land on "Browse by category" with nothing beneath it. | Render the line-651 paragraph in the landing branch when `menu.length === 0`. **Adjacent:** `StorefrontHero`'s "View menu" button scrolls to `#menu-top`, which only exists in the `!isLanding` block — so it is a no-op on the landing even for a venue *with* a menu. |
| L10 | `app/_landing/landing.tsx:590` | Final-CTA `<form action="/signin">` is a GET, so the email lands in `/signin?email=…`; `app/signin/page.tsx` declares no props and never reads `searchParams`, and `SignInForm` has no `defaultValue`. The visitor retypes the address next to copy reading "Enter your email above to get started." | Accept `searchParams` on the sign-in page and pass `defaultValue` into the input. |
| ~~L11~~ **FIXED** | `app/dashboard/orders/order-card.tsx:201` | A partially refunded order stays on the board and reprints `Total $55.00 / incl. GST $5.00` with a plain fulfillment badge; `refundedCents` is on `KitchenOrder` but its only consumer is `RefundControl` inside the drawer. | Render a "Refunded $X" line on the card and docket when `refundedCents > 0`. |
| L12 | `app/onboarding/plan/page.tsx:37` | "We will email you before it ends" — no trial-reminder sender, template, cron or `trial_will_end` webhook case exists. Mitigated: the owner who sees this string *did* complete Checkout, so `trialEndsAt` is populated and the Billing page countdown does render; and trial expiry is not enforced at all yet (`schema.ts:288`). | Remove the sentence, or implement the reminder. Confirm whether Stripe Billing's own trial-ending email is enabled (§4). |


### L1 — resolved, and re-rated

Filed as LOW. It is not. `planRefund` gates only on HEADROOM, so on a partial
refund the false error is not self-limiting: the webhook's row makes
`alreadyRefunded` $10 of a $55 order, leaving $45 remaining, so the retry the
operator is pushed into VALIDATES and creates a second real Stripe refund under
a fresh idempotency key. The diner is refunded twice, with no `venue_audit` row
naming either actor. Verified by reading `planRefund` rather than inferred.

The stamp UPDATE is now conflict-tolerant. A 23505 on `stripe_refund_id` means
one specific thing — `charge.refunded` for this very refund already inserted a
row — so the handler adopts that row, stamping on the actor, reason and note the
webhook could not know, and deletes the duplicate pending row inside one
transaction. The caller is told the refund succeeded, because it did.

`isUniqueViolation` moved to `lib/db/errors.ts`; it was already inlined in
`lib/customer/auth.ts` and now has two call sites.

Pinned by `test/refund-webhook-race.test.ts`, which drives the real `refundOrder`
with only its I/O mocked. Mutation testing earned its keep here: swallowing
EVERY stamp error rather than only 23505 passed all four original assertions, so
a fifth was added — an unrelated DB failure must not be mistaken for a webhook
race, because that would adopt a row that does not exist and report success on a
refund the ledger has no succeeded record of.

**Residual, deliberately not widened into:** any post-Stripe DB failure that is
NOT a unique violation still surfaces as an error, and an operator who retries
on the back of it can still double-refund a partial. That is a broader question
about compensating actions after money has already moved, not the race this
finding describes, and it wants its own design rather than being smuggled in
here. The `charge.refunded` webhook does eventually reconcile the record via
`reconcileRefundsForPaymentIntent`, which bounds the exposure.

### L3, L5, L11 — resolved

**L3** was half-closed already, by the earlier fix that required an observed
`depletion` movement before restocking — that stopped restocking from nothing.
The remaining half was the AMOUNT, which still came from order_items x TODAY's
`recipe_lines`. Edit a dish from 5g of saffron to 20g, refund an order from
before the edit, and the venue is credited four times the saffron it ever took
out. `restockOrder` now negates the order's recorded depletion movements, which
are exact by construction (one row per ingredient, `deltaQty: -consumed`, under
a unique index on `(order_id, ingredient_id) WHERE reason = 'depletion'`). The
orderItems/recipeLines join is gone from the module entirely, so the fix is a
simplification rather than a patch.

**L5** was worse than the summary implied. The guard reads
`c.audience === "new" && customerId && returning`, short-circuiting on a falsy
`customerId` — and `placeOrder` never set the column at all. Its only writer was
`claimOrder`, which runs AFTER the order exists and is called fire-and-forget
with `.catch(() => {})`. So at the moment discounts are evaluated it was null in
the ORDINARY case, not only when that call failed. `placeOrder` now resolves the
diner from the SESSION via `getCustomer(venueId)` — never from input, because a
client-supplied customer id would let anyone attach an order to another diner's
account. Best-effort: a lookup failure degrades to null rather than blocking a
paying order. The guard itself is untouched; loosening it would have granted
first-timer promos more widely, not less.

**L11** is the item deliberately left out of the P6 fix, where the scope was the
lines-versus-Total reconciliation. The refund is printed BENEATH the Total, not
netted into it: the Total is what was charged and the refund is a separate
movement against it, so collapsing them would leave a receipt that reconciles
against neither the Stripe charge nor the refund.

Mutation-verified against three reverts: restocking the raw (negative) deltaQty,
taking `customerId` from client input, and netting the refund into the Total.

One test-harness note worth recording, because it recurs: the absence
assertions in `test/refund-restock-source.test.ts` strip comments first. The
comment explaining why the recipe join was removed has to NAME the join, and a
raw-text scan reads that explanation as the violation —
`test/authz-coverage.test.ts` records the same lesson from the opposite
direction, prose satisfying an assertion.
---

## 3. Areas audited and found clean

Stated explicitly so coverage is visible.

**Merged PRs with no verified defect:**
- **#248** — security headers. The catch-all `/:path*` rule declared before `/:slug/checkout` is correct; the later rule overriding `X-Frame-Options` to DENY works as intended and `test/security-headers.test.ts` pins it.
- **#249** — NUL byte → `\0` escapes in `seo-stats/route.ts`, the widened `env-example-complete` scan over root `.ts` files, `engines: node 22.x`, and `permissions: {}` on `audit-slugs.yml`. Nothing found.
- **#250** — the minimum-total guard. Correctly placed after `totalCents` is derived and before `db.transaction`; `MIN_TOTAL_CENTS` (50) moved to `lib/payments/limits.ts` and re-exported cleanly. It correctly does *not* clamp the discount composition.
- **#254** — `ExpressCheckoutElement` `onConfirm` receiving the event and calling `event.paymentFailed({reason:"fail"})` on both the early-return and `confirmError` paths. Correct.
- **#247 script safety** — `scripts/stripe-live-cutover.ts` is a standalone `tsx` entry point, imported by nothing in `app/` or `lib/` (verified by grep), outside the Next route tree, requires `DATABASE_URL`, and is dry-run unless `--apply`. There is no path to invoke it from the application. Its venue-wide UPDATE with no venue filter is correct for its purpose. Only its SET list is wrong (R2).
- **#251 arithmetic** — `taxCents` is correctly re-snapshotted off the *discounted* total (`inclusiveTaxCents`, `lib/payments/tax.ts:39`), so every `incl. GST` figure printed is the true GST on the amount actually charged. The threading of `taxCents`/`taxLabel` through `OrdersBoard → OrderCard → TicketDrawer → PrintProvider → StagedDocument` is consistent across all five surfaces. The one claim that #251's GST line is "computed on the gross total and contradicts the refund line" was **refuted** — see §5.

**Cross-cutting areas checked with no defect found:**
- **Cross-tenant isolation.** No cross-venue leak found anywhere. `scopedToVenue` is correctly applied on every query examined (including the three in `stock/overview/page.tsx:77,89,107`). Every authz finding is intra-tenant over-disclosure to a user the owner deliberately admitted — no tenancy boundary is crossed.
- **Webhook authenticity and idempotency.** Signature verification is intact; `reconcileRefundsForPaymentIntent`'s insert is idempotent via `onConflictDoNothing` on `refunds_stripe_refund_id_uniq`; the confirm UPDATE is naturally idempotent via its `WHERE status='pending_payment'`; `gift_card_ledger_order_reason_idx` and `stock_movements_order_*_uniq` correctly prevent double-application of ledger and stock effects.
- **Checkout fails closed.** A venue with no connected account rejects before any DB write or PaymentIntent creation. `placeOrder` rate-limits, revalidates prices server-side, and never trusts client totals.
- **Double-refund prevention.** `planRefund` correctly clamps against `remaining` and blocks a re-refund of a fully refunded order — the only escape is the L1 race, which requires a false error to induce the retry.
- **Loyalty reversal on refund.** `reverseLoyalty` (`refund-compensation.ts:120-153`) is the correct pattern: it reads the actual ledger rows and reverses their observed net, self-correcting when a debit never landed. It is the model the gift-card and stock arms should follow.
- **Gift-card non-negative invariant.** `gift_cards_balance_nonneg` holds; the balance can never go negative (it goes *silently wrong* instead, which is P3).
- **Order-status enum discipline.** `lib/db/order-status.ts` and the `PAID_`/`ACTIVE_` groupings are correct as designed; six read sites use them properly. The defects (P7, P8) are the sites that were *not* migrated, not the abstraction.

---

## 4. Not verifiable statically — needs a runtime or staging check

1. **R1 — does `after()` + `headers()` actually throw in this build?** Traced through the installed Next 16 source (`after-context.js:64`, `headers.js:26`, `utils.js:46`) and the bundled docs, but confirm empirically: complete Connect onboarding on staging, watch for E839, and check whether `venues.stripe_payment_method_domain` is written.
2. **R2 — is any production row's `stripe_payment_method_domain` already populated?** One query decides whether the cutover is safe: `SELECT id, slug, stripe_payment_method_domain FROM venues WHERE stripe_payment_method_domain IS NOT NULL;` If empty, R2 cannot fire. **Run this before the cutover.**
3. **P1 — Stripe's actual event sequence on decline→retry against one PI.** Very high confidence that `payment_intent.payment_failed` then `payment_intent.succeeded` are both delivered for `pi_X`, but reproduce with test card `4000000000009995` (insufficient funds) then a good card on the same Elements instance, and inspect `orders.status`.
4. **P3 / L1 — race windows.** Both need timing reproduction: (a) script two `applyOrderDiscounts` calls against one gift-card code straddling the confirm; (b) issue two partial refunds on one PaymentIntent within ~1s. Neither is provable from source.
5. **Server timezone on Vercel (P13).** The UTC label assumption depends on `TZ` being unset in the Node runtime. Log `Intl.DateTimeFormat().resolvedOptions().timeZone` from a deployed page.
6. **`venues.timezone` in production (P10).** Confirm every row is `Australia/Brisbane`. If any DST zone exists, P10 escalates from latent to high immediately.
7. **Stripe Price currencies (R3).** Confirm `pro_monthly`, `pro_annual`, `scale_monthly`, `scale_annual` all carry the same currency in both test and live mode. Also confirm no zero-decimal currency is in use.
8. **Apple Pay end to end.** Even with R1 and R2 fixed, verify a `payment_method_domain` actually exists on a connected account and that the button renders in `ExpressCheckoutElement` on a real Safari/iOS device.
9. **`after()` / `waitUntil` availability on the deployment platform.** P3 and P7 severity both hinge on how often `after()` callbacks are dropped. Instrument the six webhook `after()` blocks with a counter and compare against confirmed-order volume for a week — that number tells you whether P7 is a rare compound case or routine.
10. **Marketing host status (P15).** Whether `prompt2eat.com` is attached yet determines whether the Gemini claim is live to crawlers today or only prospectively.
11. **Stripe Billing trial-ending email (L12).** Check the Stripe Dashboard setting — if enabled, the onboarding copy is arguably true, though nothing in the repo arranges or depends on it.
12. **Whether `payment_intent.payment_failed` is actually a registered webhook event** in the live endpoint config. `README.md:159` and the deployment plan say it is; if it were not, P1 would not fire (it would be a different bug — no failure state at all).

---

## 5. Refuted, with the documentation problems they revealed

- **"#251's GST line is computed on the gross total and contradicts the refund line" — REFUTED.** The line annotates the Total immediately above it and is arithmetically exact for that figure (`tax.ts:39` defines it as the GST component *contained in* a GST-inclusive amount). "Total $22.00 / incl. GST $2.00" and "Refunded $11.00 of $22.00" are both true against the same base. The same `incl. GST` line has been on the **customer's** confirmation page since before #251, on a page that renders a "Partly refunded" badge 130 lines earlier — so "GST is the component of the order total as placed" is an established convention, not a regression. And `reports/page.tsx` excludes partially refunded orders entirely, so no aggregate over-reports.
  **Genuine clarity problem it reveals:** the snapshot convention is nowhere documented on the surfaces that print it. Label the line "GST at time of order", and state the as-placed-snapshot rule in `lib/payments/tax.ts` and in the print components — otherwise every future auditor re-raises this. (The related *real* defects are P6 and L11.)

- **"#246 removed `mt-auto` from the pricing CTAs" — REFUTED as a regression.** `mt-auto` never existed in this file: `grep -c mt-auto` returns 0 in all 9 reachable revisions. The CSS observation is partly real — the cards are `items-stretch` with nothing absorbing leftover height, so the tier with a "Save N%" badge sits ~24px lower — but it is two heights, not three, cosmetic, `sm:`-only, and absent whenever no tier has a resolvable annual saving.
  **Genuine process problem it reveals:** this repo is a **shallow clone with squashed history** (`.git/shallow` lists `a2e3718`; `cc1687c^` is a bad revision). `git blame` attributes every line of several files to the graft boundary, which manufactures false "introduced by #NNN" attributions. Several other findings were initially mis-scoped to #251/#252 for the same reason. Any future audit of this repo must fetch full history first, or treat blame output as unusable.

- **`authz-stock-overview-cogs` — downgraded to informational.** The gate claim is true (`overview/page.tsx:69` is bare `requireVenue()`), but the exposure is not marginal: the sibling `/dashboard/stock` is gated identically and leaks strictly *more* (literal supplier names, pack cost, derived per-unit cost, average dish margin). The overview renders no supplier names and no pack costs at all, and its window is 30 days, not 14. Reporting it per-page would send a fixer to patch one of six equally open doors.
  **Genuine problem it reveals:** there is **no read permission declared for the stock area at all**. That is a model gap worth an explicit decision (add `stock:view`, or record that stock reads are intentionally membership-gated), not six page-level patches.

- **`authz-orders-view-never-enforced` — downgraded to informational.** Every fact checks out — `orders:view` is the only permission in the catalogue with zero call sites, and the orders board gates on bare membership. But the failure scenario requires *editing `lib/authz.ts`* to add a role: `venue_member_roles.role` is a pg enum hard-limited to owner/manager/staff, so no data-only path exists. And the un-gated board is deliberate and test-pinned — `test/authz-coverage.test.ts:352` is literally named "leaves the orders board readable by kitchen staff."
  **Genuine problem it reveals:** `lib/authz.ts:22-23` claims adding a Permission "forces every role to declare its stance." It does not — `ROLE_PERMISSIONS` is `Record<RoleKey, readonly Permission[]>`, an array-of-union, so a new member forces no role array to change, and `ALL_PERMISSIONS` is a hand-written literal despite the comment claiming owner is "the full set by construction." Either fix the type to an exhaustive map, or correct both comments. Separately, either delete `orders:view` or comment that the board is intentionally membership-gated.

---

## Summary counts

| | Critical | High | Medium | Low | Informational |
|---|---|---|---|---|---|
| **Regressions (#245–#254)** | 0 | 0 | 2 | 4 | — |
| **Pre-existing** | 1 | 3 | 11 | 12 | 3 |

**The single most urgent item is P1** — it is the only defect that captures money and fulfils nothing, it sits on an ordinary flow (card decline, retry on the same page), it emits no alert, it has no in-product recovery, it tells the diner in writing that no charge was made, and it is the upstream cause that makes P2 and P7 reachable without any infrastructure fault. Fix it before launch, ahead of everything on this list including R1 and R2.