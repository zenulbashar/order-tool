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

11. **Discounted receipt email (C5).** Add a subtotal + discount breakdown to
    `order-email.ts` so the line items reconcile to the Total.

12. **Tables empty state (R4).** Add a first-run empty message.

13. **Automated tests — remaining gaps.** No longer "no unit tests": the suite is
    269 tests across 31 files, and the money path (including the discount
    re-price call site), refunds, authz, invitations, tenant scoping and both
    webhook contracts are covered. The gap that remains is **loyalty**
    (`lib/loyalty/*` has no direct unit tests — earn/redeem are exercised only
    through the webhook handler's mocks) and the stock depletion path. See
    TechnicalDebt.md.

14. **Owners with 2+ venues cannot add another.** Found while reviewing the
    2026-08 security fixes; pre-existing and unrelated to them (`main` behaves
    identically), so recorded rather than fixed here. `app/dashboard/sidebar.tsx`
    renders the "＋ Add location" link — the one that points at
    `/onboarding/details`, which actually creates a venue — only when the owner
    has a single venue (`hasMultiple ? null : …`). Everyone else gets
    `app/dashboard/venue-switcher.tsx`'s "＋ Add another location", which points
    at `/onboarding`, and that redirects to `/dashboard` whenever the selected
    venue is complete (`app/onboarding/page.tsx`). So a two-venue owner has no
    working path to a third. Fix: point the switcher link at
    `/onboarding/details` too, or drop the `hasMultiple` condition on the sidebar
    link. Worth confirming the intended multi-location product story first —
    this may be a deliberate cap that outgrew its comment.

## Out of static scope (need a runtime environment)

- Screen-reader passes (VoiceOver/NVDA/TalkBack), real contrast sampling across
  tenant brand colours, reduced-motion verification.
- Responsive verification across the device matrix (see Responsive.md).
- Lighthouse/bundle analysis, N+1 query profiling under load (see Performance.md).
- Dependency CVE scan, secret-scanning of git history, live pen-test.
