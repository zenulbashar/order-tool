# Production migrations: gates, approvals and rollback

**Covers:** audit F12 — *"Production migrations auto-apply with no gate and no
backup."*

Migrations are the one CI step that **cannot be undone by redeploying**. A bad
deploy is a revert; a bad migration is data loss. Everything below exists
because of that asymmetry.

## What is enforced in code today

Three gates, all in `.github/workflows/ci.yml`:

1. **`needs: [build, e2e]`** — a failing test suite blocks a schema change,
   not just a failing build. (M0)
2. **A destructive-SQL guard** — the job fails if any committed migration
   contains `DROP TABLE|DROP COLUMN|DROP TYPE|TRUNCATE`, a type narrowing, or
   `SET NOT NULL`. Verified to pass on the existing migrations and to catch a
   synthetic `DROP COLUMN`. Destructive changes are routed to the manual
   process below rather than applied blind. (M0)
3. **`environment: production`** — binds the job to a GitHub Environment so
   an approval rule can apply. (this pass)

## The two steps that cannot be done from code

These need repository/provider settings. Until they are done, the approval
gate is declared but **inert** — the workflow references the environment, and
GitHub creates it implicitly with no protection rules.

### 1. Require a reviewer on the `production` environment

Repo **Settings → Environments → `production` → Required reviewers**: add at
least one person (ideally not the usual PR author). From then on every merge
to `main` that would migrate pauses for an explicit approval, with the diff
visible in the run.

Consider also setting **Deployment branches** to `main` only, so the
environment's secrets cannot be reached from a branch build.

### 2. Snapshot before migrating

Neon's point-in-time restore covers this if the retention window is long
enough — check **Neon → Project → Settings → History retention** and set it
to comfortably exceed the time it would take to notice a bad migration (a
week is a reasonable floor; the default may be shorter).

For an explicit pre-migration marker rather than relying on retention alone,
create a Neon **branch** immediately before applying:

```bash
# Requires NEON_API_KEY and the project id; run from the migrate job or by hand.
curl -sS -X POST \
  "https://console.neon.tech/api/v2/projects/$NEON_PROJECT_ID/branches" \
  -H "Authorization: Bearer $NEON_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"branch":{"name":"pre-migration-'"$(date -u +%Y%m%d-%H%M%S)"'"}}'
```

A branch is a cheap copy-on-write snapshot; restoring means pointing
`DATABASE_URL` at it. **This is deliberately not wired into CI yet** — doing
so needs a `NEON_API_KEY` secret with branch-create permission, and adding a
credential is a decision for whoever owns the Neon account, not something to
slip into a workflow unannounced.

## Running a destructive migration

The guard exists so this is a conscious act:

1. Take a snapshot (above) and confirm it exists.
2. Apply the destructive statement manually against the **direct**
   (non-pooled) Neon URL, outside CI, sequenced with any backfill.
3. Deploy the code that depends on it.
4. Only then commit a migration that brings the tracked schema back in step —
   keeping the committed migrations additive so the guard stays green.

Splitting it this way means the irreversible step is never running
unattended, which is the whole point of F12.

## Adding a column the new code immediately reads

The mirror of the case above, and easier to get wrong because nothing warns you.
An `ADD COLUMN` is additive, so the guard stays green and the migration looks
free — but **the deploy and the migration are not sequenced with each other**:

- Production ships through Vercel's Git integration, which fires on push to
  `main`. No workflow deploys, so nothing makes Vercel wait.
- `migrate-prod` runs in GitHub Actions behind `needs: [build, e2e]` **and** the
  `production` environment gate, which the section above tells you to arm with a
  required reviewer.

So the code goes live first, and stays live — for as long as the approval takes —
against a database that does not have the column yet. Every query naming it fails
with `42703 undefined_column`. If the caller swallows errors, that is invisible:
this is exactly how `applyOrderDiscounts` would have silently stopped applying
every promo, bank saving, loyalty redemption and gift card on every checkout page
load (it now reports before swallowing, so at least the window is loud).

Order it deliberately, one of:

1. **Migrate in an earlier deploy.** Land the migration on its own, let it apply,
   then merge the code that reads the column. Two PRs, no window. Preferred.
2. **Apply it manually first**, against the direct (non-pooled) URL, before
   merging the code — same shape as the destructive flow above.
3. **Make the read tolerant for one release** if neither is practical, then drop
   the fallback once the column exists everywhere.

Choosing none of these is also a choice: it means accepting a silent-degradation
window whose length is however long the approval sits unclicked.

## If a migration goes wrong

1. **Stop further merges to `main`** — the environment approval makes this
   easier, since the next migration will be waiting anyway.
2. Restore from the pre-migration branch or via point-in-time restore.
3. Redeploy the previous application build. Application rollback is cheap;
   sequence it *after* the data is right.
4. Record what happened in `docs/audit/` — a migration incident is exactly
   the sort of thing the merchant audit log (F9) cannot capture, because it
   happens below the application.

## Related

- `docs/ops/Observability.md` — how a failure surfaces at all.
- `README.md` → "Migration policy — additive only in CI".
