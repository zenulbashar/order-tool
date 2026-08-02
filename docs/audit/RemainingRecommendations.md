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

5. **`X-Forwarded-For` source (S3) — ✅ done.** The platform question this
   entry told us to answer first was settled by the 2026-08 review: Vercel is the
   only deploy target the repo documents. `clientIpFromHeaders` now prefers the
   edge-set `x-vercel-forwarded-for` / `x-real-ip` and keeps left-most XFF only as
   the off-platform fallback — so the spoofable header is no longer the primary
   source, and behaviour off Vercel is unchanged because those headers do not
   exist there. Not a blind change: the reorder cannot regress any host.

6. **Design-system consolidation (D2–D5) — D3 done, D5 partial, D2/D4 open.**
   The two groups whose visual equivalence can be PROVEN were done; the rest
   still wants the per-group PR with a visual review the original entry asks for.

   **D3 ✅** — added `--text-2xs: 9px` and replaced all 124 `text-[9px]` across 66
   files. Provably identical: Tailwind emits font-size only unless a paired
   `--text-2xs--line-height` is declared, and deliberately none was, so nothing
   moves. The wider family (8/10/11/13/15px, ~375 occurrences) is left alone —
   turning those into a scale is a design decision, not a rename.

   **D5 ◑** — replaced 84 of 230 literal-hex utilities in shop/landing: every
   literal that EXACTLY equals a token (`#16241c`→forest, `#f7f3ea`→surface,
   `#fffdf8`→surface-elevated, `#3fa66a`→success, plus accent/accent-deep).
   Verified safe rather than assumed: those tokens are only overridden under
   `[data-domain="diner"]` and `.admin-dark`, and shop/landing sit in neither
   scope, so they always resolve to the light values the literals hard-coded.

   **D5 second pass — the finding's own scope was too small.** "Shop/landing
   surfaces" left three route groups unscanned, and a derived check found **27
   more** token-duplicating literals in them: `/for/[segment]` (10), `/learn` and
   `/learn/[slug]` (16), plus one in `_landing/landing.tsx`. All 27 are
   converted, over 5 utilities proven to exist elsewhere in the app
   (`text-forest`, `bg-forest`, `text-surface`, `bg-surface-elevated`) — with
   `outline-` kept in `outline-[var(--color-forest)]` form because no
   `outline-forest` exists anywhere in the codebase to confirm Tailwind emits it,
   and an unknown utility fails SILENTLY (no class, no error, wrong colour).

   `test/token-hex-drift.test.ts` now enforces the rule instead of the next
   person re-deriving the scope: **no Tailwind arbitrary value may spell out a
   hex a domain-neutral token already names.** Read from `globals.css`, so a new
   token extends the rule automatically — which matters because the usual way
   this regresses is someone defining a token and pasting the hex anyway, and any
   hand-written list of banned hexes would miss exactly that.

   The carve-out is derived too, not an allowlist. `#7fa890` is held by
   `--color-sidebar-muted` AND `--color-concierge-thinking`; `#3a2a08` only by
   `--color-concierge-amber-ink`. Both colours are used on marketing pages, and
   `text-sidebar-muted` in a landing footer trades an honest literal for a name
   that raises the question of why the sidebar is involved. So a colour counts as
   NAMED only when some token names it without claiming a domain.

   Two things the original entry got wrong, both worth knowing before the next
   pass. Its example mapping is **incorrect** — `#16241C` is `--color-forest`;
   `--color-ink` is `#0e1f18`, so following it literally would have darkened text
   across both surfaces. And this is not simple laziness: the remaining **146
   occurrences span 56 distinct colours that the design system does not define at
   all** (`#9fb0a2`, `#856819`, `#ede4d2`, …). Those cannot be "converted" — they
   need either new tokens or a decision to fold them into existing ones, which is
   a design call. Three more were skipped on purpose: `#7fa890` matches
   `--color-sidebar-muted` exactly, but naming a marketing-page colour after the
   dashboard rail trades a literal for a misleading name.

   **D2 ✅ done.** The 21 hand-written copies had drifted from the recipe:
   `px-2.5` instead of `px-3`, and missing `placeholder:text-muted`,
   `read-only:bg-sand/40` and both `disabled:` rules — so those controls gave no
   feedback when disabled or read-only. (That half shipped separately, since
   state-prefixed utilities cannot change the default rendering.)

   The duplication is now gone too. `controlClass` gained `padding` and `width`
   parameters, which is what made it adoptable without resizing anything: `cx` is
   a plain joiner, not tailwind-merge, so passing `px-2 py-1` through `className`
   would emit it *alongside* the default and leave stylesheet order to pick. The
   app has three deliberate sizes (compact inline, standard, comfortable) and the
   recipe only ever encoded one.

   Equivalence was checked mechanically rather than by eye — every call site's
   emitted class SET was diffed against the literal it replaced. **Nothing is
   removed at any site.** 14 gain `placeholder:text-muted`, 3 gain that plus
   `shadow-sm`, 1 gains `shadow-sm` — all of them the recipe's own values that the
   copies had dropped.

   That diff also caught something a blanket swap would have broken: **8 of the
   27 matches were `<div>`, `<li>` and `<form>` containers merely BORROWING the
   input look**, not controls. They would have silently gained `text-sm`,
   `text-ink` and `shadow-sm`. Left as literals on purpose.

   **D4 open — and the "arbitrary radii where tokens exist" half is mostly a
   false lead.** I checked it for a provable subset like D3/D5 had. There are 13
   distinct arbitrary radii in use (3, 5, 7, 8, 10, 14, 15, 18, 22, 32, 35, 44px
   …) and only five have a token with the same VALUE:

   | Literal | Same-value token | Fits the element? |
   | --- | --- | --- |
   | `rounded-[6px]` | `--radius-sm` | ✅ neutral name — **converted** |
   | `rounded-[9px]` | `--radius-control-sm` | ✘ used on badges, not small buttons |
   | `rounded-[11px]` | `--radius-control` | ✘ used on 40px icon tiles |
   | `rounded-[12px]` | `--radius-input` | ✘ used on a storefront footer block |
   | `rounded-[13px]` | `--radius-control-lg` | ✘ used on cards |

   The radius tokens are named for CONTROL ROLES (control / control-sm /
   control-lg / input / card), so using them on a badge or an icon tile trades an
   honest literal for a misleading name — the same trap as `--color-sidebar-muted`
   on a marketing page in D5. So this is not a rename: the scale is
   under-specified for the shapes actually in use, and deciding what it should be
   is design work.

   **D4 page headers ✅ and segmented controls ✅.** Both turned out far smaller
   than "hand-rolled … bypass `<PageHeader>`/`<Segmented>`" suggests, once
   counted rather than assumed.

   *Page headers:* 35 of the 36 owner pages already used `<PageHeader>`. The one
   holdout was the tables board, and it is converted — the live status line
   (`● N seated · M open`) is the header's `description` slot and both controls
   its `action` slot. Visual delta, small and deliberate: the title picks up the
   shared `font-semibold` (it was `font-extrabold`) and the header gains the
   `border-b` rule the other 35 pages have. `test/page-header-coverage.test.ts`
   now pins the rule DERIVED — *no owner page renders its own `<h1>`* — plus the
   converse, that `PageHeader` still emits one, so "no `<h1>` anywhere" can't be
   satisfied by having no page heading at all. Both mutation-verified.

   *Segmented controls:* the app has exactly ONE hand-rolled single-choice
   group — the billing monthly/annual toggle. (A search for the shape finds 11
   `aria-pressed` sites, but 8 are genuine boolean toggles, where `aria-pressed`
   is correct, and one is a card-style radio list `<Segmented>` cannot render.)
   Converting it fixed an accessibility defect the design finding didn't mention:
   `aria-pressed` on a single-choice group announces "pressed / not pressed" per
   button instead of "1 of 2 selected", which is precisely the role-model bug A4
   fixed inside `<Segmented>` itself. Visual delta: the track becomes a pill and
   the active segment takes the `var(--action)` fill instead of white-on-sand.

   **D4 buttons — open, and now measured rather than asserted.** A script
   extracted all 90 `<button>` / `<Link>` class literals in `app/` and diffed each
   as a SET against all 24 `buttonStyles(variant, size, {pill})` combinations. The
   CLOSEST match differs by **14 utilities**; there is no zero-visual-change
   subset anywhere in the range, so the D2 treatment does not transfer.

   The reason is structural, not laziness. `buttonStyles` sizes by HEIGHT
   (`h-9`/`h-11`/`h-12`) and sets `font-medium`; the call sites size by PADDING
   (`py-1.5`/`py-2`/`py-2.5`) and use `font-bold` or `font-semibold`. Every
   conversion therefore changes both geometry and weight. Several of the matches
   aren't `buttonStyles` candidates at all — `cart-review.tsx:75` (`h-11 w-11`),
   `order-card.tsx:121` (`h-6 w-6`) and `storefront.tsx:380` (`h-10 w-10`) are
   square ICON buttons, and the recipe has no icon size.

   So this is the same shape as the radii above and the containers in D2: the
   recipe is under-specified for what the app actually renders. Closing it means
   deciding whether `buttonStyles` should grow a padding-based size and an icon
   variant — design work, not a rename.

7. **Firewall CTAs (D1) — named scope ✅ done; wider sweep itemised below.**
   Converted: admin *Create promotion* and *Save*, marketplace *Checkout* and
   *＋ Add*, and the tables *Print* button. Server-rendered CTAs use
   `buttonStyles("primary", "md")` — the pure recipe exists so a server component
   can take the shared styling without pulling the client `<Button>` across the
   boundary — and client ones use `<Button variant="primary">`, with the
   marketplace checkout's ad-hoc pending text swapped for the primitive's
   `loading` / `loadingLabel`.

   **The audit's list was incomplete**, which a grep for CTA-shaped amber fills
   (`rounded-control` + an accent background) makes plain. The remainder, split
   by whether the firewall actually applies:

   *Legitimately amber — these ARE the AI affordances the colour is reserved for.
   Leave them:* `menu/import`, `menu/descriptions`, `stock/scan`, `studio`, and
   the `dashboard/page.tsx` top-suggestion CTA.

   *~~Genuinely non-AI, so still violations~~ — **retracted**, this list is
   empty.* It named `dashboard/stock/page.tsx:117`,
   `stock/overview/page.tsx:173` and `stock/suggestions/page.tsx:39`. All three
   are the same "✦ Scan invoice" link, and all three point at
   `/dashboard/stock/scan` — whose own docblock reads *"The AI vision flow …
   the ONLY AI surface in Stock, so amber is sanctioned here."* They carry the
   ✦ spark that marks every other AI affordance in the app. They are ENTRY
   POINTS into the sanctioned surface, so the firewall permits them.

   The original classification went wrong by reading the page a link SITS ON
   (stock, not an AI surface) rather than where it GOES. Worth remembering: for
   a navigational CTA, the firewall question is about the destination.

   *Judgement call:* `app/[slug]/account/order-history.tsx:117` (the "↻ Reorder"
   button). It sits inside a concierge-styled block (`text-concierge-sage`) and
   "your usuals" is a personalisation feature, so the amber may well be
   deliberate. Worth a decision rather than a sweep.

   Not touched anywhere: amber *tints* (`bg-accent/10`) on informational
   callouts, selection states (category chips, admin nav), badges, and data-viz
   fills. None of those are CTA fills and the firewall does not speak to them.

8. **Dialog `detail-drawer` (A1 remainder) — ✅ done.** The Square activity
   drawer closes by navigation rather than a callback, which is why it did not
   fit the hook originally; it now passes `useDialog(() => router.push(closeHref))`
   and has the same focus trap, Escape and focus restoration as the other seven.
   A1/A2 are 8/8.

   Verified by derivation rather than by re-reading the eight files:
   `test/dialog-a11y.test.ts` finds every component declaring `role="dialog"` and
   requires a `useDialog(...)` CALL, `aria-modal`, and an accessible name. A ninth
   dialog cannot ship without them — which matters more than the eighth, since the
   ninth is the one nobody remembers to check.

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

12. **Tables empty state (R4) — ✅ done.** `tables-board.tsx` renders a
    "No tables yet" card explaining that a table generates the QR code diners
    scan to order from their seat. The add form still auto-opens alongside it,
    which was the other half of the complaint — but it renders INLINE in the card
    grid rather than as a modal, so the explanation and the action are both
    visible at once. That reads as the right first-run behaviour, so it was left
    as-is deliberately rather than overlooked.

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
