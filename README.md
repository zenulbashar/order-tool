# order-tool

Branded online ordering for hospitality venues. Multi-tenant (venue = tenant)
with authentication, a menu catalog, a public per-venue storefront (browse +
cart), and checkout / order placement. **Payments are stubbed** pending Stripe
Connect (Phase 2c); kitchen display and owner order management come later.

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
| `AUTH_URL`       | Auth.js (prod) | Set once a custom domain is live (see Deployment). Optional locally.  |

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

Payment is **stubbed**: orders are created `pending_payment` and flipped to
`confirmed` by a clearly-marked inline stub that Phase 2c replaces with the
Stripe payment webhook.

### Deferred hardening

- **Rate limiting / bot protection** (e.g. Cloudflare Turnstile) on the public
  checkout endpoint — not yet implemented; sane input bounds only for now.
- **Server-side idempotency key** to dedupe repeat submissions — deferred to 2c
  (a payment concern). For now the client disables the button while submitting.

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
