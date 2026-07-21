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

## Medium priority

4. **`X-Forwarded-For` source (S3).** Switch `clientIpFromHeaders` to a
   proxy-controlled header for the deploy target (e.g. `x-vercel-forwarded-for`).
   Verify against the platform first — changing it blindly can make limiting
   worse.

5. **Design-system consolidation (D2–D5).** One focused PR per group, each with a
   visual review: control-recipe → primitives; `text-[9px]` → a scale token;
   one-off buttons/segmented/headers → primitives; shop/landing literal hex →
   tokens. Fully specified in DesignSystemCompliance.md.

6. **Firewall CTAs (D1).** Convert the remaining amber functional CTAs
   (admin promotions, marketplace) to `<Button variant="primary">`.

7. **Dialog `detail-drawer` (A1 remainder).** The Square activity drawer is
   navigation-based (closes via `<Link>`), so it didn't fit the callback hook.
   Give it a router-based close and apply `useDialog` for parity.

8. **Removal-policy convergence (R3).** Pick one policy (recommend archive +
   confirm everywhere) and add edit paths for value-bearing entities. Product
   decision.

## Low priority

9. **Discounted receipt email (C5).** Add a subtotal + discount breakdown to
   `order-email.ts` so the line items reconcile to the Total.

10. **Tables empty state (R4).** Add a first-run empty message.

11. **Automated tests.** The pure `lib/` money/loyalty/stock logic is highly
    testable and currently has no unit tests — see TechnicalDebt.md.

## Out of static scope (need a runtime environment)

- Screen-reader passes (VoiceOver/NVDA/TalkBack), real contrast sampling across
  tenant brand colours, reduced-motion verification.
- Responsive verification across the device matrix (see Responsive.md).
- Lighthouse/bundle analysis, N+1 query profiling under load (see Performance.md).
- Dependency CVE scan, secret-scanning of git history, live pen-test.
