# order-tool

Branded online ordering for hospitality venues. Multi-tenant (venue = tenant)
with authentication, a menu catalog, a public per-venue storefront (browse +
cart), checkout, and **online payments via Stripe Connect** (test mode).
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
| `AUTH_URL`       | Auth.js (prod) | Set once a custom domain is live (see Deployment). Also builds Stripe onboarding return URLs. |
| `STRIPE_SECRET_KEY`      | Stripe (server)  | TEST secret key (`sk_test_…`). Lazily read; build/typecheck need none. |
| `STRIPE_PUBLISHABLE_KEY` | Stripe (browser) | TEST publishable key (`pk_test_…`); handed to the Payment Element.     |
| `STRIPE_WEBHOOK_SECRET`  | Stripe webhook   | Signing secret (`whsec_…`); added **post-deploy** (see Payments).      |
| `ANTHROPIC_API_KEY`      | Anthropic vision | Powers "Import menu from photo". Lazy (`lib/anthropic.ts`); metered cost. |
| `R2_ACCOUNT_ID`          | Cloudflare R2    | R2 account id. Lazy (`lib/r2.ts`); build/typecheck/lint need none.     |
| `R2_ACCESS_KEY_ID`       | Cloudflare R2    | R2 API token access key id.                                           |
| `R2_SECRET_ACCESS_KEY`   | Cloudflare R2    | R2 API token secret.                                                  |
| `R2_BUCKET_NAME`         | Cloudflare R2    | Bucket that holds menu-item photos.                                   |
| `R2_PUBLIC_URL`          | Cloudflare R2    | Public base URL photos are served from (stored in `image_url`).       |

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

- **Rate limiting / bot protection** (e.g. Cloudflare Turnstile) on the public
  checkout endpoint — not yet implemented; sane input bounds only for now.
- **Server-side idempotency key** to dedupe repeat submissions — the
  PaymentIntent is created with an idempotency key (the order id) and the
  webhook's status guard is idempotent; full dedupe of repeat _order_
  submissions is still deferred (the client disables the button while submitting).

## Payments (Phase 2c)

Online payments use **Stripe Connect (Express)** in **test mode**. Each venue
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

### Post-deploy: register the webhook (one-time)

`STRIPE_WEBHOOK_SECRET` does not exist until the endpoint is registered, and the
webhook route **rejects** requests when it is missing (it never bypasses
verification). After this deploys:

1. Stripe Dashboard (**test mode**) → **Developers → Webhooks** → **Add endpoint**,
   choosing **"Events on connected accounts"** (a **Connect** endpoint —
   direct-charge events originate on the connected accounts).
2. Endpoint URL: `https://order.zaleit.com.au/api/stripe/webhook`.
3. Events: `payment_intent.succeeded` and `payment_intent.payment_failed`.
4. Copy the **Signing secret** (`whsec_…`) → add it to Vercel (Production) as
   `STRIPE_WEBHOOK_SECRET` → **redeploy** so the variable is live.

`STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY` (test keys) must also be set in
Vercel (Production).

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
  auth.ts                      # Auth.js config
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
  `https://order.zaleit.com.au`) so magic-link callbacks don't use the
  `*.vercel.app` URL.
- `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY` — Stripe **test** keys.
- `STRIPE_WEBHOOK_SECRET` — added after registering the webhook (see
  [Payments](#payments-phase-2c)).
