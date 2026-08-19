# Release Checklist

Practical gates before shipping. ✅ = verified in this audit; ⬜ = needs a
runtime environment / human sign-off.

## Code quality
- ✅ `npm run typecheck` passes
- ✅ `npm run lint` passes
- ✅ `npm run build` passes
- ✅ `npm test` — Vitest unit suite (75 tests), wired into CI
- ✅ `npm run test:e2e` — Playwright E2E smoke (marketing/SEO), wired into CI
- ⬜ Broaden coverage: DB-backed integration (loyalty/giftcards concurrency) +
  signed-in E2E (checkout, order board) — needs a test DB/env. See TechnicalDebt.md

## Correctness (money path) — verify in staging
- ⬜ Discounted order mirrors to a **Square sandbox** and the payment posts (C1)
- ⬜ GST on a discounted receipt + BAS report equals the true component of the
  charged total (C2)
- ⬜ Two concurrent applies of the **same gift card** never over-redeem (C3)
- ⬜ A stocktake "set" racing an order depletion reconciles to the counted value (C4)
- ⬜ Discounted **confirmation email** line items reconcile to the Total (C5).
  The FIX shipped — a Subtotal + Discount breakdown renders in both the HTML
  and plain-text parts, and the subtotal is DERIVED when a caller supplies a
  discount without one. What is still open is seeing it in a real send.

## Security
- ✅ Tenant isolation, webhook signatures, admin gate, money recompute verified
- ✅ Owner magic-link rate limiting (S2) — done IN-APP rather than at the edge.
  `lib/auth-send-limit.ts` guards `sendVerificationRequest` in `lib/auth.ts`,
  the one point every path that mails a link goes through, so no edge
  dependency remains. The original wording asked for a provider/edge rule.
- ✅ Client-IP source hardened (S3) — `clientIpFromHeaders` prefers the
  edge-set `x-vercel-forwarded-for` / `x-real-ip`, with left-most XFF kept
  only as the off-platform fallback.
- ✅ Dependency CVE scan (`npm audit`) — was **15 advisories (3 critical, 6
  high, 6 moderate)**; now reports `found 0 vulnerabilities`. `next` 16.2.9 →
  16.3.1 (middleware/proxy bypass, 2× SSRF, Server Action DoS, cache
  confusion, unauthenticated Server Function disclosure — and with it `postcss`
  8.5.23 + `sharp` 0.35.3), `next-auth` → beta.32 (auth failing OPEN on a
  config error), `@auth/core` → 0.41.3, `tailwindcss` → 4.3.3,
  `fast-xml-parser` → 5.11.0. Two needed judgement rather than a bump: npm
  offered `drizzle-kit` **0.18.1** as the esbuild "fix", a major DOWNGRADE
  behind all 65 committed migrations — instead an `overrides` entry lifts the
  esbuild inside `@esbuild-kit/core-utils`, a subtree drizzle-kit declares and
  never imports. See PR #260.
- ⬜ Secret-scan of git history; confirm no secrets in the repo — **half done.**
  The current tracked tree is clean: a scan for `sk_live_`/`sk_test_`/`whsec_`/
  `re_`/`AKIA`/`ghp_`/`sk-ant-`/PEM headers across every tracked file returns
  only README + docs placeholders (`sk_test_…`, ellipsis included) and test
  fixtures (`"sk_live_" + "a".repeat(48)`, `whsec_test`). HISTORY is still
  unscanned and cannot be done from here — the CI/agent clone is shallow
  (back to 2026-07-21 only), so a full-history scan needs a complete clone and
  a tool like gitleaks or GitHub secret scanning run against the repo itself.
- ✅ `.env` completeness vs `.env.example` — the file was missing 24 keys the
  code already read, all of which fail SILENTLY (`PLATFORM_ADMIN_EMAILS`
  unset makes `/admin` deny everyone with no error). Now documented and
  pinned by `test/env-example-complete.test.ts`.
- ⬜ Production secrets actually SET in Vercel — still yours to do; the list
  above is what to set, not proof that it is set.

## Accessibility
- ✅ Dialog focus trap / Escape / restoration (8/8), Segmented + Field ARIA
- ⬜ Screen-reader pass (VoiceOver / NVDA / TalkBack) on the core flows
- ⬜ Contrast sampling across representative tenant brand colours
- ⬜ Reduced-motion verification
- ✅ `detail-drawer` dialog semantics (A1 remainder) — it closes by navigation
  rather than a callback, which is why it did not fit the hook originally; it
  now passes `useDialog(() => router.push(closeHref))`. A1/A2 are 8/8, and
  `test/dialog-a11y.test.ts` derives the rule so a ninth dialog cannot ship
  without it.

## Responsive — device matrix
- ⬜ iPhone SE / 16, Pixel, iPad Mini / Pro, Android tablet
- ⬜ 13" / 15" / 24" / 27" / 32" / ultrawide, portrait + landscape, foldables
- ⬜ No overflow / clipped content; wide-monitor fill (no center gutters)

## Performance
- ⬜ Lighthouse (LCP / CLS / INP) on landing, storefront, checkout, orders board
- ⬜ Bundle analysis (concierge/Stripe/QR code-split)
- ⬜ DB query plans + latency under realistic row counts (orders board, reports)

## Data / migrations
- ⚠️ **CI does not sequence the migration with the deploy — check this every
  release.** Vercel deploys on push to `main`; `migrate-prod` waits behind
  `needs: [build, e2e]`, so new code runs against the old schema for the length
  of those jobs. See `docs/ops/Migrations.md` → "Adding a column the new code
  immediately reads" for the three orderings that avoid it.

  **Correction (2026-08-03): there is no human approval gate.** This entry
  previously said `migrate-prod` waits behind "a human-approved `production`
  gate". `ci.yml` does declare `environment: production`, but no required
  reviewer has been configured for it, so GitHub creates the environment with
  **no protection rules and the job runs unblocked** — on the 0063 merge it
  started 8 seconds after E2E finished. `ci.yml` is honest about this (the
  comment says it is "safe and inert until then"); this checklist was not.
  Today the only guard on an irreversible production DDL is the destructive-SQL
  grep at `ci.yml:87-92`. Arming the real gate is two minutes in repo Settings →
  Environments → `production` → required reviewers.
- ✅ **`0063_discount_revision.sql` is applied.** Confirmed in CI: run **#454**
  (PR #220, the merge that introduced it) and every run since, including **#504**
  on `23682e1`, completed the *Migrate prod (additive only)* job's *Apply
  additive migrations* step successfully — the latter at 2026-08-02T21:54:05Z.
  Production schema is current through 0063. The earlier "pending" wording here
  was stale when written, and it mattered: it described promos, bank savings,
  loyalty redemptions and gift cards as silently broken in production when they
  were not.
- ⬜ Destructive migrations (if any) run manually + backed up first
- ⬜ Confirm no pending un-generated schema drift (`db:generate` clean)

## Mobile app (if shipping native)
- ⬜ Magic-link deep links (universal/app links) wired in `ios/`+`android/`
- ⬜ Push (APNs/FCM) credentials configured
- ⬜ Store metadata + min-functionality (Apple 4.2) satisfied
