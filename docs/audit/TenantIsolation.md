# Tenant isolation: the current position, and why RLS is deferred

**Status:** decision recorded 2026-08-01 (F7 / audit §8.1).
**Decision:** do **not** implement row-level security yet. Ship the
enforcement harness now; revisit RLS once the dissenting sources are read.

## Why not simply "add RLS"

Because the audit's own verification says not to, and it is worth being
precise about which parts are established and which are not.

**Established (verified 3-0 in §8.1):**

- AWS's SaaS Lens: *"getting beyond the entry points of a login screen or an
  API does not mean you have achieved isolation."* Prompt2Eat's isolation
  story is a session plus a `venue_id` predicate — exactly that entry-point
  layer.
- OWASP: *"Use database-level isolation (RLS, schemas) as defense in depth…
  Don't allow queries without tenant filters."*
- Supabase's own benchmark on the **same `team_id` membership pattern**
  `venue_members` uses: the naive policy *"times out with over 3 minutes"*;
  a `SELECT`-wrapped function plus an index on the predicate column are
  **jointly** necessary, neither alone sufficient.
- Supabase again: *"Do not rely on RLS for filtering but only for security."*
  RLS would be the backstop, never a replacement for `scopedToVenue()`.

**Not established, and explicitly flagged as such:**

- §8.1 is **one-sided in favour of RLS**. PlanetScale's *"RLS sounds great
  until it isn't"*, Neon's multi-tenancy guidance, and AWS Prescriptive
  Guidance on RLS were **never read**. The audit's instruction is unambiguous:
  *"F7 should not be scheduled as committed work until the dissenting sources
  are read."*
- The `FORCE ROW LEVEL SECURITY` point (plain `ENABLE` leaves the table owner
  exempt, so an app connecting as owner would get no enforcement while
  appearing to) had its OWASP attribution **refuted 0-3**. The underlying
  Postgres behaviour is *believed* correct but unverified. If true, an RLS
  rollout omitting it is silently inert — which is a worse outcome than not
  rolling out at all, because it manufactures false confidence.

So: the evidence establishes that convention-only scoping is below the
documented baseline, **and** that the obvious RLS implementation of this exact
schema is dangerous. It does not establish that RLS is the right answer here.
Implementing it now would be acting on half an argument.

## What shipped instead

`test/tenant-scoping.test.ts` — the verification harness F7's own
recommendation calls for ("ship it table-by-table behind a verification
harness that asserts cross-tenant reads return zero rows"), available now at
zero schema risk.

It derives the venue-scoped tables from the schema (39 of them), walks every
query in `app/` and `lib/`, and fails CI on any statement against one of
those tables with no tenant predicate. F7's complaint was that *"nothing —
not the type system, not a test, not the database — will catch it."* One of
those three now does.

Deliberate cross-venue reads are allowed through an exemption list where
**every entry must carry a reason**, so the set of places that legitimately
cross tenants is enumerated and reviewable rather than implicit. Today that
list is: platform admin (allowlist-gated, audited), the cron sweeps and job
worker (per-row `venue_id` scopes each write), webhook paths that resolve by
Stripe-issued globally-unique ids, token-resolved customer and invitation
paths, and the read-then-write-by-id pattern in the integrations actions —
safe *only* because the preceding read is scoped, which is precisely why it
is listed rather than ignored.

Two findings from building it, worth recording:

1. The first version reported a false positive on the orders board, because
   splitting statements on `;` truncated a chain at a semicolon inside a
   prose comment. Comments are now stripped before splitting. A harness that
   cries wolf gets exemptions added to silence it, which would defeat it.
2. It was mutation-checked: an unscoped `db.select().from(orders)` added
   under `app/dashboard/` failed the suite by file name, and removing it
   restored green.

## What it does not do

It is a **static check over source text**. It reasons about code as written,
not as executed, and it cannot see a tenant predicate assembled dynamically.
It is a guardrail against the specific failure F7 describes — someone forgets
`scopedToVenue()` — not a proof of isolation. The database still enforces
nothing.

## When to revisit

1. Read the three dissenting sources.
2. If RLS still looks right, prototype on **one** high-value table (`orders`),
   with the `SELECT`-wrapped policy **and** the predicate index together, and
   benchmark against a realistic row count — the timeout above is the
   expected failure, not a hypothetical.
3. Confirm the `FORCE ROW LEVEL SECURITY` behaviour against the PostgreSQL
   `CREATE POLICY` / `ALTER TABLE` documentation before it goes anywhere near
   acceptance criteria.
4. Keep `scopedToVenue()` in every query regardless. RLS is the backstop.
