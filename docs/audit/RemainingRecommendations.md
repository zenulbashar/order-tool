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

3. **Owner magic-link rate limiting (S2).** Add the limiter to a NextAuth `signIn`
   event in `lib/auth.ts`, or enforce an edge rule on `/api/auth/signin/*` and
   document it as a hard dependency. Today it depends entirely on edge config.

4. **Pin `AUTH_URL` in production.** Investigated during the 2026-08 security
   review and **dropped as a finding** (3/10 confidence), not as a task. Without
   `AUTH_URL`, `getBaseUrl()` (`lib/url.ts`) derives the origin from
   `x-forwarded-host`, and that origin builds the diner magic-link URL — whose
   token is a pure bearer credential. It is not exploitable on Vercel, which sets
   that header itself rather than forwarding a client copy (and the repo's own
   Auth.js config already depends on that being true), and Vercel is the only
   documented deploy target. But the code does not *enforce* the assumption, and
   `.env.example` has `AUTH_URL` commented out. Fix: set it in Production, and
   consider failing fast at startup when it is missing outside development. Revisit
   as a real finding if the app is ever self-hosted behind a different proxy.

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

10. **Dashboard read surfaces gated on membership.** Investigated during the
    2026-08 security review and scored 7/10 — below that report's bar, but real,
    and the same root cause as S6. Page-level `requireVenuePermission` appears on
    only two pages (`settings/staff`, `settings/activity`); `/dashboard/reports`,
    `/customers`, `/billing`, `/payments` and `/discounts` all use bare
    `requireVenue()`, so a `staff` login can read 30-day revenue and GST, the
    diner directory (names, phone numbers, lifetime spend — real PII), plan and
    invoice state, and promo codes. Every *mutation* on those pages is correctly
    gated, and no bearer secret is exposed (that was S6) — this is reads only.
    `reports:view` and `orders:view` are declared in `lib/authz.ts` and enforced
    nowhere. Fix: gate each page on the permission its own actions already use,
    and hide the matching sidebar entries so a staff login doesn't get dead
    links. Extend the `SECRET_PAGES` pin in `test/authz-coverage.test.ts` as you
    go.

## Low priority

11. **Discounted receipt email (C5).** Add a subtotal + discount breakdown to
    `order-email.ts` so the line items reconcile to the Total.

12. **Tables empty state (R4).** Add a first-run empty message.

13. **Automated tests — remaining gaps.** No longer "no unit tests": the suite is
    261 tests across 30 files, and the money path, refunds, authz, invitations,
    tenant scoping and both webhook contracts are covered. The gap that remains is
    **loyalty** (`lib/loyalty/*` has no direct unit tests — earn/redeem are
    exercised only through the webhook handler's mocks) and the stock depletion
    path. See TechnicalDebt.md.

## Out of static scope (need a runtime environment)

- Screen-reader passes (VoiceOver/NVDA/TalkBack), real contrast sampling across
  tenant brand colours, reduced-motion verification.
- Responsive verification across the device matrix (see Responsive.md).
- Lighthouse/bundle analysis, N+1 query profiling under load (see Performance.md).
- Dependency CVE scan, secret-scanning of git history, live pen-test.
