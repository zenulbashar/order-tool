# Security Review — 2026-08 (web + mobile)

A second, adversarial security pass over the whole repository, run *after* the
twelve platform-audit findings (F1–F12) were closed. Scope was the full app —
not a diff — because the earlier review had signed off with "no Critical or High
findings" and the point of this pass was to test that claim rather than inherit
it.

**It did not hold.** Three High findings, all of them in code that the first
review had looked at and passed. Each one is the same shape: a control that
exists and is correct in one place, and simply absent in a neighbouring place
that reaches the same state.

## Method

Six independent identification passes, each given only its surface and told that
"no findings" was an acceptable answer:

| Pass | Surface | Result |
| --- | --- | --- |
| Money paths | checkout, discounts, refunds, gift cards, loyalty, both Stripe webhooks | 1 candidate |
| Authz & tenancy | `lib/tenant.ts`, `lib/authz.ts`, invitations, ~24 dashboard action files, `app/admin/**` | 2 candidates |
| API route handlers | every `route.ts`, cron endpoints, OAuth callback, webhooks | none |
| Secrets & crypto | token minting/storage, HMAC, credential encryption, env fallbacks | none |
| Public storefront & customer accounts | `app/[slug]/**`, diner auth, order tracking | none |
| Mobile (Capacitor) | `mobile/**`, App Links / Universal Links, push registration | none |

Every candidate then went to a **separate** reviewer that was told to refute it,
given the hard-exclusion list (no DoS, no rate-limiting, no theoretical races, no
missing-hardening), and required to trace each link itself. Anything scoring
below 8/10 confidence was dropped.

Two candidates were dropped this way, and recording them matters as much as the
findings:

- **Host-header injection in `getBaseUrl`** (`lib/url.ts`). `AUTH_URL` is
  documented as optional, and without it the base URL comes from
  `x-forwarded-host` — which feeds the diner magic-link email. The token is a
  pure bearer credential, so on paper this is account takeover. Dropped at 3/10:
  the repo deploys only to Vercel (`vercel.json`, no Dockerfile, no self-host
  docs), where the edge sets that header rather than passing a client copy
  through, and the repo's own Auth.js config relies on exactly that property.
  Still worth pinning `AUTH_URL` in production as hardening — it is listed in
  RemainingRecommendations.md, not here.
- **Dashboard read surfaces gated on bare membership** (`/dashboard/reports`,
  `/customers`, `/billing`, `/payments`, `/discounts`). Real, but scored 7/10 —
  below the bar for this report. It is the same root cause as S6 and is captured
  in RemainingRecommendations.md.

## Findings

### S4 — PaymentIntent desync via an amount-keyed idempotency key — **Fixed**

`app/[slug]/checkout/discount-actions.ts`. The Stripe idempotency key on the
PaymentIntent re-price was `${orderId}-disc-${targetAmount}` — keyed to the
DESTINATION, not the transition. Discounts are composable, so a diner reaches the
same total twice by ordinary use:

1. bank saving → 1800c, key `…-disc-1800` burnt, PI = 1800
2. gift card → 1300c, PI = 1300, row records `gift_card_redeemed_cents = 500`
3. clear the gift card → target 1800c again, key **reused**

The request body is byte-identical in steps 1 and 3 (`computeApplicationFeeCents`
is a pure function of the amount), so Stripe **replays** the cached response
instead of erroring: no update runs, the PI stays at 1300, and the order row —
already written earlier in the same transaction — says 1800. The replay is an
HTTP 200, so the `catch` that would roll the transaction back never fires.

The diner is charged $13.00 on an order recorded as $18.00, and because
`gift_card_redeemed_cents` was reset to 0 both `redeemGiftCardForOrder` and the
cron backstop skip the order — so the card keeps its full balance too.

Two things make this worse than an exploit. It needs no gift card (the points
checkbox alone reproduces it), and it is **symmetric**: points on → off → on
leaves the PI on the *higher* amount, so an honest diner is over-charged. Nothing
downstream compared the two numbers — the webhook confirms on PaymentIntent id
alone and never read `amount_received`.

**Fix.** The key is now `(order, revision, target)`, where `revision` is a
monotonic `orders.discount_revision` claimed under the existing row lock
(`lib/payments/discount-idempotency.ts`). A from/to pair would not have been
enough — an A→B→A→B oscillation repeats it, a counter cannot. Verifying the
*returned* PaymentIntent would not have worked either: the replayed body is the
earlier successful response and already carries the expected amount.

The target is still in the key, and self-review is why. Keying on the revision
**alone** trades this bug for another: the DB write and the Stripe call share a
transaction, so a commit that fails *after* Stripe succeeded reverts the revision
too. The next apply then reuses that revision — and if the diner has since
changed the discount, reuses it with a different body. Stripe answers a reused
key with changed parameters by **erroring**, not replaying, so the update throws,
the transaction rolls back, and every retry reproduces it: the order wedges,
unable to re-price at all. With the target included, the key repeats only when
the revision *and* the destination both repeat — which, since a revision only
recurs after a rollback reverted the row, is genuinely the same transition being
retried, where replaying is the correct answer. Both halves are mutation-tested
separately.

Separately, the webhook now compares `amount_received` to `orders.total_cents` on
the confirming transition and raises a `charge_amount_mismatch` alert on any
difference. It reports rather than blocks — the money has already moved, and
refusing to feed the kitchen would turn an accounting fault into a customer-
facing one. This is a backstop for the whole class, not just for S4.

### S5 — Onboarding actions gated on membership, not permission — **Fixed**

All five `app/onboarding/*/actions.ts` gated on `requireUser()` + `requireVenue()`.
`requireVenue()` resolves through `venue_members` and **never consults role**, so
any member — including a `staff` kitchen login holding only `orders:view` /
`orders:manage` — passed. The dashboard's Settings → Stations screen gates the
identical writes on `settings:manage`.

The step routes stayed reachable: only `app/onboarding/page.tsx` checked
`isOnboardingComplete`, so the individual steps rendered normally for a fully live
venue and served a valid action id. No crafted request was needed.

`saveStations` runs an unconditional `DELETE FROM venue_stations WHERE venue_id =
…`; because `menu_items.station_id` is `ON DELETE SET NULL`, submitting "0
stations" nulls **every** item's kitchen routing across the menu and turns station
printing off. And `finishOnboarding` writes `onboarding_completed_at`, the exact
gate `placeOrder` checks — so a staff member could push a half-configured venue
live and start it taking real payments.

**Fix.** `requireWizardVenue()` (`lib/tenant.ts`) = `settings:manage` **plus**
"wizard unfinished", applied to all five actions and all five step pages. The
second half restores an invariant the code already claimed: the replace-set's
safety comment says item→station assignments "are made later in the menu editor,
not during onboarding", which is only true while the wizard is unfinished.

`/onboarding/details` is deliberately **not** guarded — it creates a venue and is
how the sidebar's "Add location" opens a second one, so a completed current venue
is the normal case there.

### S6 — Gift-card codes readable by any venue member — **Fixed**

`app/dashboard/gift-cards/page.tsx` gated on `requireVenue()` while all three
mutating actions beside it required `giftcards:manage`. The page renders every
card's full code and balance, unmasked.

A gift-card code is a pure bearer instrument: `resolveGiftCardForRedemption`
matches on `(venue_id, code, status='active')` with no purchaser, no PIN and no
possession proof. So a `staff` login could open the page, copy the highest-balance
codes, and redeem them as an ordinary diner on the public storefront —
indistinguishable from legitimate customer redemption. A gate on the write
without the same gate on the read is decorative.

**Fix.** The page now requires `giftcards:manage`. Codes are deliberately **not**
masked: the page's job is "issue a card and share its code", and masking would
break the feature rather than secure it.

## What the fixes are held to

- `test/authz-coverage.test.ts` now scans `app/onboarding` as well as
  `app/dashboard`. The original harness proved a *filename* pattern is not a
  security boundary; this review proved a *scan root* is not one either.
- The same harness now **strips comments before scanning**. Mutation-testing
  caught this live: the docblock explaining a gate contained the literal
  `requireVenuePermission(`, so a file whose real gate had been deleted still read
  as gated. Prose must not be able to satisfy a security assertion.
- `requireWizardVenue` is recognised as a gate only because a test pins that the
  wrapper itself calls `requireVenuePermission` — a wrapper must not become a way
  to launder an ungated action.
- Pages whose output is a bearer instrument are pinned by name, with a stated
  reason. Deliberately a short list, not "every page needs a permission" — kitchen
  staff legitimately read the menu and the orders board.
- `lib/payments/discount-idempotency.test.ts` walks the exact 1800 → 1300 → 1800
  sequence and asserts no key repeats.
- `test/stripe-webhook-idempotency.test.ts` drives the real handler and asserts
  the reconciliation fires with both amounts, stays silent on a replay, and never
  fails the webhook when the reporter throws.

Every one of these was mutation-tested: the guard was broken deliberately, the
named test was confirmed to fail, and the guard restored.

## Standing lesson

Both S5 and S6 are the same failure as the F4 miss that preceded them: a control
was applied to a *set of files someone enumerated* rather than to a *property of
the code*. Enumerations go stale the moment someone adds a file or a directory.
Where a rule matters, it is now asserted over a derived set — and the assertion
is checked by breaking it.
