# order-tool

Branded online ordering for hospitality venues. Multi-tenant (venue = tenant)
with authentication, a menu catalog, a public per-venue storefront (browse +
cart), checkout, and **online payments via Stripe Connect**.
Kitchen display and owner order management come later.

## Stack

- **Next.js 16** (App Router) + **TypeScript** + **Tailwind CSS v4**
- **Drizzle ORM** + **Neon** (Postgres, `ap-southeast-2` / Sydney)
- **Auth.js** (`next-auth` v5) — email magic-link via **Resend**, Drizzle adapter
- **Vercel** hosting (functions pinned to `syd1`)

## Getting started

Requires Node.js 20.9+ (22 recommended).

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run db:migrate           # apply migrations to your dev database
npm run dev                  # http://localhost:3000
```

### Environment variables

| Variable         | Used by        | Notes                                                                 |
| ---------------- | -------------- | --------------------------------------------------------------------- |
| `DATABASE_URL`   | app runtime    | **Pooled** Neon connection string (host contains `-pooler`).          |
| `AUTH_SECRET`    | Auth.js        | `openssl rand -base64 33`.                                            |
| `RESEND_API_KEY` | Resend         | API key for magic-link delivery.                                      |
| `EMAIL_FROM`     | Resend         | Sender identity. **Must be a Resend-verified sending domain.**        |
| `AUTH_URL`       | Auth.js (prod) | Set once a custom domain is live (see Deployment). Also builds Stripe onboarding return URLs and emailed magic-links. Optional — unset falls back to Vercel's env-provided URL, never the request Host. |
| `STRIPE_SECRET_KEY`      | Stripe (server)  | TEST secret key (`sk_test_…`). Lazily read; build/typecheck need none. |
| `STRIPE_PUBLISHABLE_KEY` | Stripe (browser) | TEST publishable key (`pk_test_…`); handed to the Payment Element.     |
| `STRIPE_WEBHOOK_SECRET`  | Stripe webhook   | Signing secret (`whsec_…`) for the **order** webhook; added **post-deploy** (see Payments). |
| `STRIPE_BILLING_WEBHOOK_SECRET` | Stripe webhook | SEPARATE signing secret (`whsec_…`) for the **billing** webhook (`/api/stripe/billing-webhook`, subscriptions/invoices). Distinct endpoint and secret from the order webhook. |
| `ANTHROPIC_API_KEY`      | Anthropic vision | Powers "Import menu from photo". Lazy (`lib/anthropic.ts`); metered cost. |
| `R2_ACCOUNT_ID`          | Cloudflare R2    | R2 account id. Lazy (`lib/r2.ts`); build/typecheck/lint need none.     |
| `R2_ACCESS_KEY_ID`       | Cloudflare R2    | R2 API token access key id.                                           |
| `R2_SECRET_ACCESS_KEY`   | Cloudflare R2    | R2 API token secret.                                                  |
| `R2_BUCKET_NAME`         | Cloudflare R2    | Bucket that holds menu-item photos.                                   |
| `R2_PUBLIC_URL`          | Cloudflare R2    | Public base URL photos are served from (stored in `image_url`).       |
| `UPSTASH_REDIS_REST_URL`   | Rate limiting | Upstash Redis REST URL. Lazy (`lib/rate-limit.ts`); **absent → limiter fails open** (no limiting). |
| `UPSTASH_REDIS_REST_TOKEN` | Rate limiting | Upstash Redis REST token.                                             |

## Database & migrations

The schema lives in `lib/db/schema.ts`; the runtime client is `lib/db/index.ts`
(neon-serverless WebSocket pool, lazy connection, supports interactive
transactions).

```bash
npm run db:generate   # generate a new SQL migration from schema changes
npm run db:migrate    # apply pending migrations
npm run db:studio     # browse data
```

### Pooled vs. direct connection

- **App runtime** uses the **pooled** endpoint (`DATABASE_URL`).
- **Migrations** should use the **direct** (non-pooled) endpoint, which is what
  the CI `migrate-prod` job expects in `PROD_DATABASE_URL`.

### Migration policy — additive only in CI

On merge to `main`, CI runs `drizzle-kit migrate` against production. **Only
additive migrations are allowed through CI** (new tables, columns, indexes,
nullable additions). **Destructive changes** — dropping or renaming columns or
tables, narrowing types, adding non-nullable columns without a default — are
**run manually** by a human against prod, outside CI, so they can be sequenced
with deploys and backfills. Keep generated migrations additive; split anything
destructive into a separate, manually-applied step.

## Authentication

Passwordless magic-link sign-in. Emails are fully lower-cased
(`normalizeIdentifier`) and backed by a `UNIQUE INDEX on lower(email)`, so
casing can never fork a duplicate account.

## Multi-tenancy

A **venue is the tenant**. At onboarding the signed-in user creates one venue
and becomes its `owner` in `venue_members` (which also supports multiple users
per venue later). **Every venue-owned query must be scoped by `venue_id`** —
resolve the active venue with `requireVenue()` and filter with `scopedToVenue()`
from `lib/tenant.ts`.

## Ordering & checkout (Phase 2b)

The storefront checkout is a **public, unauthenticated write**, so the placement
action (`app/[slug]/checkout/actions.ts`) treats all input as hostile:

- accepts **ids + quantities only** — never a client-supplied price;
- **recomputes every total from live, venue-scoped DB prices**;
- re-checks each item/option against the DB, requiring every selected option to
  belong to a modifier group of **that** item (no cross-item / cross-venue
  injection), and enforces modifier `min/max` server-side;
- writes the order in a **single transaction** with every sensitive column
  (venue, token, status, totals) **server-set** (mass-assignment defense).

Orders are retrieved only via an **opaque, server-generated `public_token`**
(never a sequential id). Line names/prices are **snapshotted** at order time, so
later menu edits never alter historical orders.

Orders are created `pending_payment`; payment is taken via Stripe Connect and
the order is confirmed **only** by the signature-verified webhook — never inline
(see [Payments](#payments-phase-2c)).

### Deferred hardening

- **Rate limiting** on the public checkout endpoint is now implemented at the
  app level (per-IP, fail-open) — see [Rate limiting](#rate-limiting). A
  CAPTCHA / bot-challenge (e.g. Cloudflare Turnstile) stays the **edge's** job
  and is not in the app.
- **Server-side idempotency key** to dedupe repeat submissions — the
  PaymentIntent is created with an idempotency key (the order id) and the
  webhook's status guard is idempotent; full dedupe of repeat _order_
  submissions is still deferred (the client disables the button while submitting).

## Payments (Phase 2c)

Online payments use **Stripe Connect (Express)**. There is no test/live flag in
the code — the mode is whichever `STRIPE_SECRET_KEY` is configured, so a
deployment is in test mode exactly while it holds an `sk_test_…` key (see
"Going live" above). Each venue
connects its **own** Stripe account and customers are charged **directly** on it
(direct charge via the `Stripe-Account` header); the platform takes a per-order
`application_fee_amount` computed server-side by `computeApplicationFeeCents`
(`lib/stripe.ts` — the single source of truth for the fee).

- **Onboarding:** owners connect at **Dashboard → Payments**, which creates an
  Express account (server-side, scoped to the venue, never client input) and
  redirects to Stripe-hosted onboarding. `charges_enabled` gates checkout.
- **Checkout:** the charge amount is the **server-recomputed** order total — the
  client never sets the amount or the fee. Checkout refuses to place an order
  when the venue can't accept payments. The order is written `pending_payment`,
  a PaymentIntent is created on the connected account, and the browser confirms
  it with the Stripe Payment Element.
- **Confirmation:** the order is confirmed (or failed) **only** by the Stripe
  webhook — there is no inline confirmation. The webhook verifies the raw body
  against `STRIPE_WEBHOOK_SECRET` and rejects anything unverified.

### Post-deploy: register the webhooks (one-time)

There are **TWO** Stripe webhooks with **two different signing secrets** and two
different endpoint types. Both routes **reject** requests when their secret is
missing (neither ever bypasses verification), so nothing works until both are
registered.

#### 1. ORDER webhook — a **Connect** endpoint

1. Stripe Dashboard → **Developers → Webhooks** → **Add endpoint**, choosing
   **"Events on connected accounts"** (a **Connect** endpoint — every diner
   charge is a direct charge, so the events originate on the *connected*
   account, not the platform).
2. Endpoint URL: `https://prompt2eat.com/api/stripe/webhook`.
3. Events — all **four**:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `charge.refunded`
   - `charge.refund.updated`
4. Copy the **Signing secret** (`whsec_…`) → Vercel (Production) as
   `STRIPE_WEBHOOK_SECRET` → **redeploy** so the variable is live.

> **Both halves of step 3 fail silently, so get them right the first time.**
> Register a *plain account* endpoint instead of a Connect one and it receives
> **nothing**: orders stay `pending_payment` forever, are excluded from the
> kitchen board, and no error is raised anywhere. Omit the two `charge.*` events
> and a refund issued from the Stripe Dashboard moves real cash while the app
> records nothing — no `refunds` row, the order stays `confirmed`, loyalty is
> never reversed, gift-card value is never returned, stock is never restocked,
> and net revenue is overstated. `reconcileRefundsForPaymentIntent` has exactly
> one caller (this webhook) and there is **no sweep** that re-derives an
> out-of-band refund.

#### 2. BILLING webhook — a **platform** endpoint

Subscriptions and the hardware marketplace are charged on the PLATFORM account,
so this one is an ordinary (non-Connect) endpoint.

1. **Add endpoint**, this time WITHOUT "Events on connected accounts".
2. Endpoint URL: `https://prompt2eat.com/api/stripe/billing-webhook`.
3. Events — all **six**:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
4. Copy that endpoint's **own** signing secret → Vercel (Production) as
   `STRIPE_BILLING_WEBHOOK_SECRET` → **redeploy**.

> `checkout.session.completed` is the one that cannot be skipped. It is the
> **only** writer that moves a `marketplace_orders` row out of `pending_payment`
> — a hardware order is `mode: "payment"`, so no subscription event covers it,
> and there is no reconciliation sweep. The subscription events are more
> forgiving: a subscription is linked three ways (metadata `venueId`,
> `stripeSubscriptionId`, `stripeCustomerId`), so a missed one largely self-heals.

`STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY` must also be set in Vercel
(Production). Use the **test** keys while testing and the **live** keys at
cutover — see below.

### Going live (test → live cutover)

The app has **no test/live mode flag**: it uses whichever keys it is given, and
nothing rejects a test key in production. The order of operations matters.

1. Activate the platform account for **live**, with **Connect Express** enabled.
2. Create the **six live Price objects**, carrying exactly these lookup keys:
   `pro_monthly`, `pro_annual`, `scale_monthly`, `scale_annual`,
   `roster_monthly`, `roster_annual`. Do this **before** step 3 — the app
   resolves prices by lookup key and a miss surfaces only as a generic
   `?error=checkout` redirect, with nothing logged.
3. Swap `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` to `sk_live_…` /
   `pk_live_…` and redeploy.
4. Re-register **both** webhooks above in **live** mode and update both secrets.
5. **Clear the stored test-mode ids**, which are invalid under a live key:

   ```
   DATABASE_URL="<direct Neon URL>" npx tsx scripts/stripe-live-cutover.ts          # dry run
   DATABASE_URL="<direct Neon URL>" npx tsx scripts/stripe-live-cutover.ts --apply
   ```

   Skip this and `placeOrder` passes its mirrored `stripe_charges_enabled` gate,
   writes the order, and only then fails at `paymentIntents.create` — leaving an
   orphan `pending_payment` row and a generic diner error. See the script's
   header for the full reasoning.
6. Every venue reconnects Stripe from **Dashboard → Payments** (live KYC).
7. Prove it end to end: place one real-card minimum-value order and confirm the
   row reaches `confirmed`, then refund it from the Stripe Dashboard and confirm
   net revenue drops. Nothing else exercises step 4, and both halves fail
   silently.

### Express checkout & Apple Pay domain registration (per connected account)

The payment step shows a one-tap **Express Checkout** button (Apple Pay / Google
Pay / Link) **above** the card form. It confirms the **same** PaymentIntent as the
card form — same direct charge, same app fee — so the webhook stays the sole
confirmation source; there is no second confirmation path. If no wallet is
available the button doesn't render and checkout is exactly the card form.

**Google Pay and Link need no extra setup. Apple Pay on the web** only renders
once the storefront **domain is registered as a payment method domain in Stripe**.
Because every charge is a **direct charge on the venue's connected account**, the
domain must be registered **on each connected account** — registering it only on
the platform is not enough.

**This is now automatic — no operator step.** `syncStripeAccountStatus` (which
runs whenever the owner's Payments page loads or they refresh their Stripe status)
registers the storefront domain on that venue's connected account as soon as the
account reaches `charges_enabled`. See `lib/stripe/payment-method-domain.ts`.

How it behaves, and why:

- It runs in `after()`, so it is never in front of the page render.
- It **never throws**. Every failure is swallowed and reported to Sentry. Apple
  Pay simply not appearing is a soft degradation — Google Pay, Link and the card
  form are untouched — whereas a throw would break the payments page for an owner
  who has done nothing wrong.
- In the steady state it costs **zero Stripe calls**: the domain it last
  registered is stored on `venues.stripe_payment_method_domain`, so the common
  case is a string comparison.
- It **lists before creating**, so an account whose domain was already registered
  by hand (the old manual step below) is detected and recorded rather than
  re-created, which Stripe would reject.
- It stores the DOMAIN, not a flag, so a venue later moving to a custom domain
  re-registers instead of being wrongly treated as done.

Stripe serves the Apple Pay domain-association file for domains registered this way
when the storefront loads Stripe.js, so the app does **not** host a `.well-known`
file.

<details>
<summary>Manual fallback (only if you need to register a domain out of band)</summary>

```ts
await stripe.paymentMethodDomains.create(
  { domain_name: "prompt2eat.com" },
  { stripeAccount: "<acct_id>" },
);
```

Safe to run alongside the automatic path — the next sync lists the domain, finds
it, and just records it.
</details>

**If registration fails for a venue, nothing breaks** — the Apple Pay button just
doesn't appear there, and the customer still has Google Pay / Link / the card form.

## Customer accounts (#7)

An **optional, opt-in** customer identity so a customer can save their details,
see their past orders, and **reorder in one tap**. **Guest checkout is the
untouched default** — `orders.customer_id` is **nullable**, identity is never
required to order, and `placeOrder` is unchanged (it never sets `customer_id`).

**Firewalled from owner Auth.js — a separate system, by construction:**

- Customers have their **own tables** (`customers`, `customer_login_tokens`,
  `customer_sessions`) — **never** the owner `users`/`sessions`/`accounts`/
  `verification_tokens`. The Auth.js Drizzle adapter (`lib/auth.ts`) is wired to
  only the owner four and has no knowledge of the customer tables.
- Customer code lives under `lib/customer/*` + `app/[slug]/account/*` and
  **never imports `lib/auth.ts`** or calls `signIn`/`auth`/`signOut`.
- Customers use their **own cookie** (`ot_customer_session`), distinct from the
  Auth.js cookie and from `ot_selected_venue`. Owner routes gate on
  `requireUser()` (blind to this cookie); the customer area gates on
  `getCustomer()` (zero venue-management).
- **Disjoint identity keyspaces:** owner email is unique **globally**; customer
  email is unique **per venue** (`customers (venue_id, lower(email))`). The same
  person can be an owner **and** a customer as separate records that never
  collide.

**Scope = per-venue.** A customer belongs to one venue. Forward-compatible to a
platform-wide account later via an additive account table + nullable link.

**Mechanism = email magic-link**, hand-rolled and **separate** from the Auth.js
Resend provider — but it **reuses the same `RESEND_API_KEY`/`EMAIL_FROM`**, so
there is **no new required env**. Tokens are stored **SHA-256-hashed**; the raw
token lives only in the emailed link (single-use, ~15 min) or the httpOnly
session cookie. The send path (`lib/customer/email.ts`) calls the Resend REST API
lazily, so build/typecheck/lint run with no env.

**Linking orders is IDOR-safe.** Claiming runs
`UPDATE orders SET customer_id = <session customer> WHERE venue_id = ? AND
public_token = ? AND customer_id IS NULL`: authorization is **possession of the
unguessable `public_token`** (the same capability that already authorizes
viewing), the `IS NULL` guard blocks taking an already-owned order, and the
customer is **session-derived, never client input**. We deliberately do **not**
bulk-claim by phone (an unverified phone match would be an IDOR; that's reserved
for a future phone-OTP upgrade). The history read is filtered by `venue_id` AND
the session customer, so a customer only ever sees their own orders.

**Reorder re-prices live.** It seeds the cart with the past order's **ids only**
(never prices) via the same shape the cart already persists; a fresh
`CartProvider` reconciles them against the live menu (dropping unavailable items,
raising the "items changed" notice) and **checkout re-prices server-side through
the same verified `placeOrder` recompute**. A reorder is just a normal new order
with a pre-filled cart — no stored/old price is ever charged.

Routes live under `/[slug]/account` (`/[slug]/account` history + sign-in,
`/[slug]/account/verify` magic-link callback). The additive migration is `0010`.

## Menu item photos

Owners attach a real photo to each menu item; the storefront renders an
image-led layout (photo + name/description/price), with items that have no photo
falling back to a clean text-only row. Photos are **real owner uploads only** —
no AI-generated or web-scraped images.

- **Storage:** Cloudflare **R2** (S3-compatible), driven by `@aws-sdk/client-s3`
  via a lazy client (`lib/r2.ts` — constructed on first use, so build/typecheck/
  lint run with no R2 env). The public URL is stored in the existing
  `menu_items.image_url` (no migration).
- **Upload is server-side** (never browser→R2). `uploadItemPhoto`
  (`app/dashboard/menu/actions.ts`) re-checks **type** (JPEG/PNG/WebP), **size**
  (≤5 MB), and **venue ownership** of the item server-side — the real gate,
  regardless of any client check — then writes to a collision-safe key
  (`venues/{venueId}/items/{itemId}/{uuid}.{ext}`) and updates `image_url`
  scoped by `id + venue_id`. Replacing or removing a photo cleans up the old R2
  object best-effort (a failed cleanup never fails the request).
- The item create/update form **never** touches `image_url`, so editing an
  item's name or price can't wipe its photo.

### Cloudflare setup (one-time, parallel to deploy)

Create an R2 bucket, enable public access (or attach a Cloudflare-proxied custom
domain), and create an R2 API token (Account ID + Access Key ID + Secret). Put
the bucket name and public URL, with the token, into env — `.env.local` for
local runs and **Vercel (Production)**. The build proceeds without them (lazy
init); they're only needed at runtime to actually upload and serve photos.

## Rate limiting

Sensitive, cost-bearing, and abusable endpoints are rate-limited **at the app
level** as defense-in-depth — the **second** line behind the edge (Cloudflare /
Vercel), which absorbs volumetric floods. App-level limiting catches abuse that
is lower-volume, distributed, or passes the edge: magic-link spam / sign-in
probing, the cost-bearing AI calls, and junk-order floods.

Serverless functions don't share memory, so an in-memory counter can't
rate-limit; the limiter (`lib/rate-limit.ts`) uses **Upstash Redis** via
`@upstash/ratelimit` (sliding window). It is **lazy** (build/typecheck/lint run
with no env, like the Stripe/Anthropic/R2 clients) and **fails open**: if the
store is unconfigured, unreachable, slow, or errors, the request is **allowed**
(a Redis blip must never 500 a request or block checkout/sign-in). Enforcement
is server-side and every key is server-derived (never spoofable client input).

| Endpoint                            | Key                         | Limit                              |
| ----------------------------------- | --------------------------- | ---------------------------------- |
| Customer + owner magic-link         | IP **and** email (SHA-256)  | 30/hr per IP, 5 per 15 min / email |
| Menu import (vision)                | venue                       | 10/hr                              |
| AI descriptions (single + bulk)     | venue                       | 30/hr                              |
| Order placement (`placeOrder`)      | IP                          | 20/min                             |

Reads (storefront / menu) are not app-limited (the edge handles volumetric;
reads are cheap), and the non-AI writes (`publishMenu` / `saveItemDescriptions`)
are not limited (no cost / email, already venue-scoped). When limited, the user
sees a friendly "too many…" message in the existing form error slot — never a
scary error. The checkout limit deliberately errs **loose** (blocking a real
sale is worse than a few junk orders, which the payment step rejects anyway);
raise `checkoutIp` if a busy single-NAT venue ever trips it.

**Client IP (served directly by Vercel).** There is no `request.ip` in Next 16,
and prompt2eat.com is DNS-only at Cloudflare (no Cloudflare proxy in front), so
Vercel's edge is the trusted hop. The IP is read from headers in this order:
first (left-most) hop of `x-forwarded-for` (Vercel-set on its edge; the left-most
entry is the real client IP — the trusted primary) → `x-real-ip` /
`x-vercel-forwarded-for` (Vercel-set fallbacks) → `cf-connecting-ip` (last resort
only, normally absent now that Cloudflare's proxy is gone; kept in case it is
re-enabled) → `"unknown"`. Trusting Vercel's left-most `x-forwarded-for` entry
avoids both collapsing everyone to one proxy IP and trusting a spoofed
per-request IP.

Set `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (Upstash console) in
Vercel (Production); without them the limiter fails open (no limiting), which is
fine in dev / preview.

> Edge's job / future: a direct POST to the Auth.js `/api/auth/signin/resend`
> route bypasses the owner-sign-in wrapper and is covered by the edge. An
> optional `sendVerificationRequest` chokepoint in `lib/auth.ts` would add
> app-level coverage there as a fast-follow (left out so owner auth stays
> stable).

## Project structure

```
app/
  page.tsx                     # routes by auth/venue state
  signin/                      # magic-link sign-in
  onboarding/                  # create-venue form + server action
  dashboard/                   # venue-scoped shell
  api/auth/[...nextauth]/      # Auth.js route handlers
lib/
  db/{index,schema}.ts         # Drizzle client + schema
  auth.ts                      # Auth.js config (OWNER auth only)
  customer/                    # customer identity (#7) — SEPARATE from auth.ts
  tenant.ts                    # venue resolution + scoping convention
  validation.ts                # email/slug validation
drizzle/                       # generated migrations
```

## CI/CD

GitHub Actions (`.github/workflows/ci.yml`):

- **On every PR and push to `main`:** `typecheck` + `build`.
- **On push to `main`:** the `migrate-prod` job applies additive migrations
  (see policy above).

Plus a manual workflow (`.github/workflows/audit-slugs.yml`, `workflow_dispatch`)
that runs the read-only reserved-slug audit (`scripts/check-reserved-slugs.ts`)
against prod.

Required GitHub Actions secrets:

| Secret              | Purpose                                          |
| ------------------- | ------------------------------------------------ |
| `PROD_DATABASE_URL` | **Direct** (non-pooled) Neon URL for migrations. |
| `AUTH_SECRET`       | Passed to the migrate job for parity.            |

### Deployment (Vercel)

Deploys happen via Vercel's **native Git integration** (push to `main` →
production deploy); there is no deploy job in CI. Functions are pinned to
`syd1` via `vercel.json` to sit next to the Neon Sydney database.

Configure these in the Vercel project (Production):

- `DATABASE_URL` — the **pooled** Neon URL
- `AUTH_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`
- `AUTH_URL` — set to the production URL once a custom domain is live (e.g.
  `https://prompt2eat.com`) so magic-link callbacks don't use the
  `*.vercel.app` URL. Optional: `lib/url.ts` falls back to
  `VERCEL_PROJECT_PRODUCTION_URL` / `VERCEL_URL` — both env-provided — and only
  reaches the request Host in local development, so an emailed magic-link token
  can never be pointed at an attacker's domain by a poisoned header.
- `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY` — Stripe **test** keys.
- `STRIPE_WEBHOOK_SECRET` — added after registering the webhook (see
  [Payments](#payments-phase-2c)).
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` — Upstash Redis for rate
  limiting (see [Rate limiting](#rate-limiting)). Absent → limiter fails open.
