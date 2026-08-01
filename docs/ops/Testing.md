# Testing the money paths (M3 / audit F8)

The audit's F8 finding was that coverage was concentrated on money *math* while
the paths where **a defect costs money** — order placement and payment
confirmation — had no test at all. This document describes what now covers
them, and the one part that still needs infrastructure this repo does not have.

## What runs on every CI run

| Suite | Command | What it protects |
|---|---|---|
| Unit — pricing rules | `npm test` | `lib/payments/line-plan.test.ts`: the checkout recompute. Prices always come from live DB rows; variant rules; per-group min/max; duplicate options; **cross-item and cross-venue option injection**. |
| Unit — webhook contract | `npm test` | `test/stripe-webhook-idempotency.test.ts`: drives the real webhook handler with its I/O mocked. First delivery confirms and moves value once; **a replay moves nothing**; signature/secret rejections; failed-payment transition; 500-so-Stripe-retries. |
| E2E smoke | `npm run test:e2e` | `e2e/smoke.spec.ts`: the anonymous marketing/SEO surface. No database needed. |

The two unit suites are fast (milliseconds) and need no database, which is why
they are the primary safety net rather than the browser path.

### Why these tests are trusted

Both suites were **mutation-checked** when written — the guard they protect was
deliberately broken and each suite was confirmed to fail with a message naming
the real property, then the code was restored:

- Removing the `confirmed.length > 0` gate on loyalty earn → the replay tests
  fail with *"loyalty earn must NOT fire on a replay"* and *"expected 1 call,
  got 3"*.
- Weakening the option-group ownership check to `if (!group)` → the
  cross-item injection test fails.

A test that cannot fail is not coverage. Repeat this exercise for any new test
added to these files.

## The full-path spec (does NOT run in CI)

`e2e/checkout.spec.ts` implements the roadmap's end-to-end leg: **cart →
checkout → order persisted with a real PaymentIntent → signature-verified
webhook → confirmed**, then replays the same webhook and asserts no ledger row
is written twice.

It **skips itself** unless four variables are present, so CI stays green:

| Variable | Purpose |
|---|---|
| `E2E_CHECKOUT_SLUG` | Slug of a seeded venue that is onboarded and has `charges_enabled`. |
| `E2E_CHECKOUT_ITEM` | Exact name of an available menu item on that venue. |
| `DATABASE_URL` | Used as the test *oracle* — reads the order's token, PaymentIntent id, and ledger counts. |
| `STRIPE_WEBHOOK_SECRET` | Used to **sign** the simulated `payment_intent.succeeded` event. |

Run it against a staging deployment:

```bash
E2E_CHECKOUT_SLUG=demo-cafe \
E2E_CHECKOUT_ITEM="Flat White" \
DATABASE_URL="postgres://…" \
STRIPE_WEBHOOK_SECRET="whsec_…" \
PLAYWRIGHT_BASE_URL="https://staging.example" \
  npx playwright test e2e/checkout.spec.ts
```

`PLAYWRIGHT_BASE_URL` points the run at an already-running deployment; without
it Playwright builds and starts the app locally (the default for the smoke
suite).

### Why it is gated rather than wired into CI

Confirming an order end to end requires three things CI does not have and this
repository cannot provision:

1. **A seeded Postgres.** The storefront resolves a venue, menu, and modifiers
   from the database; there is no anonymous path to a checkout page.
2. **A Stripe test secret key.**
3. **A Stripe Connect account with `charges_enabled`.** Orders are *direct
   charges* on the venue's connected account, so a platform test key alone is
   not enough.

Wiring the spec into CI without those would produce a permanently red job,
which is worse than an honest skip. The correct home for it is a staging
pipeline that already has a seeded tenant and Stripe test credentials.

### Why the spec signs a webhook instead of typing a test card

Driving Stripe's card iframe is third-party and flaky, and it is not where the
risk lives. In production the **webhook is the only path that confirms an
order** — there is no second confirmation path — so signing a real
`payment_intent.succeeded` exercises the actual security and idempotency
boundary. The spec also posts an unsigned event and asserts it is rejected.

## Adding coverage here

- Put pure rules in `lib/**` with a colocated `*.test.ts`; they run everywhere
  and need no mocks.
- Put route-level specs in `test/**` (not `app/**`, so nothing test-shaped sits
  in the App Router file tree) and mock only I/O — the point is to exercise the
  handler's own control flow.
- Anything needing a database or Stripe belongs in `e2e/` behind an env gate,
  documented in the table above.

## Known gaps

- Owner/dashboard flows (menu editing, order status transitions) have no E2E
  coverage; they need the same seeded environment.
- Refunds are untested because they are unbuilt (audit F3 / roadmap M4).
- No load or concurrency test on the claim path; the job engine's atomicity is
  argued from the guarded `UPDATE … RETURNING` and covered indirectly by
  `lib/integrations/drain.test.ts`.
