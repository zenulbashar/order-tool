# Architecture Review — Prompt2Eat (order-tool)

## Verdict

A cohesive, well-factored Next.js 16 App Router monolith with a clear
multi-tenant model, a disciplined design-token system, and strong separation
between owner, diner, and platform-admin surfaces. The codebase shows unusual
care: documented invariants at the top of security-critical helpers, a typed
`aria-label` requirement on icon-only buttons, reduced-motion handling on every
animation, and an explicit "owner↔diner accent firewall" encoded in CSS
variables. This is above the median for a SaaS of this size.

## Layering

```
app/                     Route tree (RSC by default; "use client" leaves)
  _components/           Shared UI primitives (Button, Input, Card, Toast, …)
  _landing/              Marketing composition
  [slug]/                Diner storefront + checkout + account (tenant)
  dashboard/             Owner console
  admin/                 Platform-operator console (allowlist-gated, dark chrome)
  onboarding/            Setup wizard
  api/                   Route handlers (webhooks, jobs, auth, push, support)
lib/                     Framework-free domain logic + integrations
  db/                    Drizzle schema (43 tables) + client
mobile/                  Capacitor WebView shell (owner app; wraps hosted dashboard)
design/                  Design handoff bundle (reference only, not shipped)
drizzle/                 57 migrations (additive-in-CI convention)
```

Server Components fetch data directly through `lib/` query modules; mutations
go through **server actions** (`actions.ts`, 36 modules) and **route handlers**
(13). Business rules (money, tax, loyalty, promotions, stock, scheduling) live
in `lib/` and are framework-agnostic and unit-testable in isolation.

## Multi-tenancy & identity

- Tenancy is **by venue**. `lib/tenant.ts` is the single resolution point:
  venues are always selected from the user's own `venue_members` rows — never by
  a client-supplied id — which is the IDOR gate. `scopedToVenue()` is the
  greppable convention every venue-owned query is expected to use.
- The selected-venue cookie is a **UI preference, not an auth token**: it is
  re-validated against membership on every resolve.
- **Platform admin** is a role above venue owners, modelled by an env allowlist
  (`PLATFORM_ADMIN_EMAILS`), fail-safe deny, re-checked every request — including
  mid-impersonation, so revocation is immediate. Non-admins get `notFound()`
  (existence-hiding), not a redirect.
- **Diner identity** is a separate, firewalled system (customer sessions +
  magic-link tokens), independent of owner Auth.js sessions.

## Design system

Tokens live in `app/globals.css` `@theme` (colours by intent, radius/shadow
scales, motion library). The `--action` / `--brand` indirection resolves the
functional accent to forest on owner surfaces and the per-tenant brand colour on
diner surfaces, with amber reserved exclusively for AI affordances. Primitives
in `app/_components/` are the intended single source for buttons, inputs, cards,
toasts, and status badges.

## Data & migrations

- Application-side UUID PKs (no DB extension dependency), case-insensitive unique
  email, `withTimezone` timestamps with `$onUpdate` bumping.
- CI applies **additive-only** migrations to prod on merge to `main`; destructive
  changes are run manually — a sound guardrail for a live multi-tenant DB.

## Integrations & async

- Stripe (payments + billing), Square (OAuth + webhook + mirror sync), S3/R2
  uploads, Upstash rate-limiting, Anthropic (concierge + support chat).
- A DB-backed job queue (`integrationJobs` + `/api/jobs/integrations`) decouples
  webhook receipt from slower mirror work.
- Push (`lib/push.ts`) and deep-link association files are wired server-side but
  inert until env is configured — a clean "seam ready" pattern.

## Notable strengths

1. Security invariants are documented **at the code**, not just in a wiki.
2. Owner/diner/admin surfaces are genuinely isolated, including their accent
   systems.
3. Accessibility is designed into primitives (touch-target floors, required
   labels, reduced motion) rather than retrofitted.
4. The mobile app reuses 100% of the web surface, so feature parity is
   structural rather than a maintenance burden.

## Risks / watch-items

1. **Convention-enforced tenant scoping.** Safety depends on every new query
   calling `scopedToVenue()`. There is no lint rule or type-level guarantee — a
   forgotten scope is a silent IDOR. (See Security.md.)
2. **Build-not-wire primitives.** `Toast`/`ToastProvider` ship unmounted; some
   surfaces still hand-roll status UI. Wiring these closes consistency gaps.
3. **No automated test suite in-repo** (CI runs typecheck + build only). The
   domain logic in `lib/` is pure and highly testable; the absence of unit tests
   around money/loyalty/stock is the biggest testing gap. (See TechnicalDebt.md.)
4. **Webhook + job endpoints** are the highest-value attack surface; their
   signature verification and idempotency deserve the closest review.
