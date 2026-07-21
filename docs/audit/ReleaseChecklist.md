# Release Checklist

Practical gates before shipping. ✅ = verified in this audit; ⬜ = needs a
runtime environment / human sign-off.

## Code quality
- ✅ `npm run typecheck` passes
- ✅ `npm run lint` passes
- ✅ `npm run build` passes
- ✅ `npm test` — Vitest money-math unit suite (17 tests), wired into CI
- ⬜ Broaden test coverage (loyalty/giftcards/stock/schedule; concurrency;
  Playwright E2E) — see TechnicalDebt.md

## Correctness (money path) — verify in staging
- ⬜ Discounted order mirrors to a **Square sandbox** and the payment posts (C1)
- ⬜ GST on a discounted receipt + BAS report equals the true component of the
  charged total (C2)
- ⬜ Two concurrent applies of the **same gift card** never over-redeem (C3)
- ⬜ A stocktake "set" racing an order depletion reconciles to the counted value (C4)
- ⬜ Discounted **confirmation email** line items reconcile to the Total (C5 — not
  yet fixed)

## Security
- ✅ Tenant isolation, webhook signatures, admin gate, money recompute verified
- ⬜ Owner magic-link rate limiting enforced at the provider/edge (S2)
- ⬜ Client-IP source hardened for the deploy target (S3)
- ⬜ Dependency CVE scan (`npm audit` / Snyk)
- ⬜ Secret-scan of git history; confirm no secrets in the repo
- ⬜ `.env` completeness vs `.env.example`; production secrets set

## Accessibility
- ✅ Dialog focus trap / Escape / restoration (7/8), Segmented + Field ARIA
- ⬜ Screen-reader pass (VoiceOver / NVDA / TalkBack) on the core flows
- ⬜ Contrast sampling across representative tenant brand colours
- ⬜ Reduced-motion verification
- ⬜ `detail-drawer` dialog semantics (A1 remainder)

## Responsive — device matrix
- ⬜ iPhone SE / 16, Pixel, iPad Mini / Pro, Android tablet
- ⬜ 13" / 15" / 24" / 27" / 32" / ultrawide, portrait + landscape, foldables
- ⬜ No overflow / clipped content; wide-monitor fill (no center gutters)

## Performance
- ⬜ Lighthouse (LCP / CLS / INP) on landing, storefront, checkout, orders board
- ⬜ Bundle analysis (concierge/Stripe/QR code-split)
- ⬜ DB query plans + latency under realistic row counts (orders board, reports)

## Data / migrations
- ✅ CI applies additive-only migrations to prod on merge to `main`
- ⬜ Destructive migrations (if any) run manually + backed up first
- ⬜ Confirm no pending un-generated schema drift (`db:generate` clean)

## Mobile app (if shipping native)
- ⬜ Magic-link deep links (universal/app links) wired in `ios/`+`android/`
- ⬜ Push (APNs/FCM) credentials configured
- ⬜ Store metadata + min-functionality (Apple 4.2) satisfied
