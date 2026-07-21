# Design System Compliance

The design system (`app/globals.css` `@theme` tokens + `app/_components/`
primitives) is mature and mostly well-adhered-to. The rules that matter:

- Colour by **token intent** (`bg-surface`, `text-ink`, `text-muted`,
  `border-line`, …), never raw hex.
- Functional accents read **`var(--action)`** (owner forest / diner brand);
  **amber (`--color-accent`) is reserved for AI affordances** and must never be a
  functional fill (the owner↔diner firewall).
- Controls go through `<Button>`, `<Input>`/`<Select>`/`<Textarea>`/`<Field>`,
  `<Card>`, `<PageHeader>`, `<Segmented>`, `<StatusBadge>`.

## Fixed

- **Firewall (partial):** the "Add table" CTA hardcoded `bg-forest`/`text-white`;
  it now uses `var(--action)`/`var(--action-contrast)` — identical on owner
  surfaces, but routed through the token so it can never leak the wrong accent.

## Recommended (verified violations, deferred for visual QA)

These are mechanical but touch many files and change rendered pixels, so they
want a visual pass in a running app before merge — batch them separately.

### D1 — Amber/forest functional CTAs (firewall)
Amber as a non-AI CTA fill: `admin/promotions` "Create promotion",
`dashboard/marketplace/shop-client` checkout/add. Sibling owner forms already use
`<Button variant="primary">` for the same action — inconsistent. Fix: adopt
`<Button variant="primary">` (or `bg-[var(--action)]`). Genuinely-amber AI
affordances (menu import/publish, description generation, studio, vision scan)
are correct and were **not** flagged.

### D2 — Control-recipe duplication (highest leverage)
~12 files copy the `controlClass` string onto raw `<input>/<select>/<textarea>`
(discounts, admin product form, admin promotions, gift-cards, payments forms, tax,
brand, stock fields, studio), defeating the primitives' invalid/locked/error
handling. Fix: use `<Input>/<Select>/<Textarea>` wrapped in `<Field>`.
`stations-editor` and `table-form` already do this correctly — proof the
primitives cover these cases.

### D3 — Missing sub-`text-xs` token
`text-[9px]` (and `8/10/11px`) micro-label string is redefined as
`microLabel`/`eyebrow` in ~20 files. Fix: add a `--text-2xs`/`--text-3xs` scale
token (or a `<MicroLabel>` primitive) and reference it.

### D4 — One-off components
- One-off `<button>` re-implementing `buttonStyles("secondary","sm")`
  (discounts/promotions/admin-marketplace/tables/gift-cards) → `<Button>`.
- Hand-rolled segmented/tab controls (`rounded-[10px] bg-sand p-1`) in
  stock/studio/payments/billing → `<Segmented>`.
- Hand-rolled `<header>/<h1 font-extrabold>` instead of `<PageHeader>` (which is
  `font-semibold`) across admin + tables — a visible title-weight mismatch.
- Arbitrary radii (`rounded-[14px]`, `rounded-[10/11/13px]`, `rounded-[5/6/8px]`)
  where `rounded-card`/`rounded-control`/`rounded-sm` exist.

### D5 — Literal token hex in shop/landing
`app/shop/**` and `app/_landing/**` write token values as literal hex
(`text-[#16241C]` → `text-ink`, `bg-[#FFFDF8]` → `bg-surface-elevated`, …). Fix:
swap for the token utilities. (SVG `fill`/`stroke`, the OG image, the wordmark,
the Stripe brand `#635bff`, and per-tenant `--brand` style props are legitimately
literal and excluded.)

## Why deferred, not auto-migrated
D2–D5 are dozens of files of pixel-affecting changes. Without a running app to
diff before/after, a blind sweep risks silent visual regressions (sizing shifts
from `text-sm`→`text-xs`, padding changes when adopting fixed-height primitives).
The safe path is one focused PR per group with a visual review — scoped and
listed above so it's turnkey.
