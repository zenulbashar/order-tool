# Remaining Recommendations

Verified items not fixed in this pass, with the reason and the concrete fix.
Ordered by priority. Nothing here is Critical.

## High priority

1. **Gift-card / stocktake concurrency — verify in staging.** The locking fixes
   (C3, C4) are correct by construction and pass CI, but they change money-path
   locking. Run a concurrency test (two simultaneous applies of one gift card;
   a stocktake racing a depletion) in staging before merge.

2. **Square mirror — verify against a sandbox.** C1's discount-line fix should be
   exercised against a Square sandbox order with a promo + gift card to confirm
   `total_money` reconciles and the payment posts.

3. **Owner magic-link rate limiting (S2) — ✅ done.** Limited at the send itself
   (`sendVerificationRequest` in `lib/auth.ts` via `lib/auth-send-limit.ts`),
   which is the one point every path that mails a link goes through — so neither
   suggested seam was needed and no edge dependency remains. Separate, looser
   buckets keep the form's stricter gate tripping first, so the owner still gets
   the friendly inline error.

4. **Pin `AUTH_URL` in production — ✅ the code no longer depends on it.**
   Investigated during the 2026-08 security review and **dropped as a finding**
   (3/10 confidence), not as a task: `getBaseUrl()` derived the origin from
   `x-forwarded-host` when `AUTH_URL` was unset, and that origin builds the diner
   magic-link, whose token is a pure bearer credential. Not exploitable on
   Vercel, which sets that header itself — but the code did not *enforce* the
   assumption, and `AUTH_URL` is commented out in `.env.example`.

   Rather than restate the assumption or fail fast (which would take down a
   working deployment), `lib/url.ts` now resolves through a trust ladder:
   `AUTH_URL` → `VERCEL_PROJECT_PRODUCTION_URL` (production) → `VERCEL_URL`
   (previews) → the request Host. Every rung above the last is an ENVIRONMENT
   value set by project configuration, so the header is reached only where no
   deployment env exists at all — local development, which is exactly where it is
   needed. The ordering is unit-tested and mutation-verified.

   Setting `AUTH_URL` is still recommended, but now purely so links use the
   custom domain rather than the Vercel one — not for safety. **Still worth
   revisiting** if the app is ever self-hosted behind a proxy that is neither
   Vercel nor configured with `AUTH_URL`.

## Medium priority

5. **`X-Forwarded-For` source (S3).** Switch `clientIpFromHeaders` to a
   proxy-controlled header for the deploy target (e.g. `x-vercel-forwarded-for`).
   Verify against the platform first — changing it blindly can make limiting
   worse.

6. **Design-system consolidation (D2–D5).** One focused PR per group, each with a
   visual review: control-recipe → primitives; `text-[9px]` → a scale token;
   one-off buttons/segmented/headers → primitives; shop/landing literal hex →
   tokens. Fully specified in DesignSystemCompliance.md.

7. **Firewall CTAs (D1).** Convert the remaining amber functional CTAs
   (admin promotions, marketplace) to `<Button variant="primary">`.

8. **Dialog `detail-drawer` (A1 remainder).** The Square activity drawer is
   navigation-based (closes via `<Link>`), so it didn't fit the callback hook.
   Give it a router-based close and apply `useDialog` for parity.

9. **Removal-policy convergence (R3).** Pick one policy (recommend archive +
   confirm everywhere) and add edit paths for value-bearing entities. Product
   decision.

10. **Dashboard read surfaces gated on membership — ✅ done for the money and
    PII pages.** Investigated during the 2026-08 security review and scored
    7/10 — below that report's bar, but real, and the same root cause as S6.
    `/dashboard/reports`, `/customers`, `/billing`, `/payments` and `/discounts`
    now gate on the permission their own actions already required
    (`reports:view`, `billing:manage`, `promotions:manage`), so a `staff` login
    can no longer read 30-day revenue and GST, the diner directory (names, phone
    numbers, lifetime spend — real PII), payout and invoice state, or promo
    codes. `reports:view` was declared in `lib/authz.ts` and enforced nowhere;
    it is enforced now. Sidebar entries carry the same permission and are hidden
    when the viewer lacks it, and `test/authz-coverage.test.ts` derives the nav
    expectations from the pages, so the two cannot drift apart.

    **Still open, deliberately:** the remaining ~20 dashboard pages (menu,
    stock, media, tables, seo, integrations, marketplace, apps, and most of
    settings) are still on bare `requireVenue()`. They are operational config
    rather than money or PII, and tightening them is a product decision about
    what a kitchen login should see day to day — not a security fix to slip in
    unannounced. `orders:view` is still declared and unenforced for the same
    reason: the orders board is the one page staff must keep, and a test now
    pins that so any future tightening pass has to make that call deliberately.

## Low priority

11. **Discounted receipt email (C5) — ✅ done.** The Subtotal + Discount
    breakdown had in fact shipped with the customer-email work, and
    `lib/customer/notify.ts` was already passing both figures — the finding was
    stale rather than open. What was genuinely missing was the assertion: the
    test checked only that the words "Subtotal" and "Discount" appeared, so a
    wrong figure, or a breakdown present in the HTML but absent from the
    plain-text part, would have passed. The tests now assert the arithmetic in
    both parts, and one real defect was fixed alongside them — a caller passing
    `discountCents` without `subtotalCents` rendered "Subtotal $32.00 / Discount
    −$8.00 / Total $32.00", a breakdown that contradicts itself. The subtotal is
    now derived so the three figures always reconcile.

12. **Tables empty state (R4).** Add a first-run empty message.

13. **Automated tests — ✅ the flagged gaps are closed.** The suite is 312 tests
    across 36 files. The two gaps this item named are now covered:

    - **Loyalty.** `earnedPointsFor` is unit-tested directly: whole-dollar
      flooring (and that it floors the DOLLARS, not the final points — 250c at
      rate 3 is 6, not 7), the zero/negative subtotal and rate guards, and
      linearity, so the ledger cannot drift from the subtotal. Earning is
      re-derived by the cron sweep for any order the webhook missed, so
      determinism is load-bearing rather than cosmetic.
    - **Stock depletion.** The arithmetic was reachable only through two DB
      round-trips and a transaction, so it was extracted VERBATIM to
      `lib/stock/depletion-plan.ts` — the same move `lib/payments/line-plan.ts`
      made for the checkout recompute. Both summations are covered: quantity per
      menu item (several order lines share one item when variants differ) and
      consumption per ingredient (several dishes share an ingredient). Both
      under-deplete *silently* when wrong, which is why they earn tests.

    **Still uncovered, deliberately:** the DB-bound halves —
    `earnPointsForOrder` / `redeemPointsForOrder` / `applyDepletionForOrder` and
    their cron sweeps. Their idempotency rests on unique indexes and
    `ON CONFLICT DO NOTHING`, which a mock cannot honestly exercise: a test
    against a fake would assert the mock's behaviour, not Postgres's. Those want
    an integration test against a real database, which belongs with the staging
    items at the top of this file.

14. **Owners with 2+ venues cannot add another — ✅ fixed.** Found while
    reviewing the 2026-08 security fixes; pre-existing and unrelated to them.
    `app/dashboard/venue-switcher.tsx`'s "＋ Add another location" pointed at
    `/onboarding`, which is the RESUME router — it sends a venue whose onboarding
    is complete straight to `/dashboard`. Since that link only appears once an
    owner already has a venue, and that venue is normally live, an owner with two
    locations simply bounced and had no path to a third. The sidebar's
    single-venue "Add location" pointed at `/onboarding/details` all along, so
    the two affordances disagreed.

    Checked before changing it that this was a bug rather than a deliberate cap:
    there is no plan-based location limit anywhere in the codebase, and the
    switcher's own label promises the capability. The fix is the one-line href;
    `test/navigation-links.test.ts` now fails any add-a-location link pointing at
    the resume router, with the reason in the message.

## Out of static scope (need a runtime environment)

- Screen-reader passes (VoiceOver/NVDA/TalkBack), real contrast sampling across
  tenant brand colours, reduced-motion verification.
- Responsive verification across the device matrix (see Responsive.md).
- Lighthouse/bundle analysis, N+1 query profiling under load (see Performance.md).
- Dependency CVE scan, secret-scanning of git history, live pen-test.
