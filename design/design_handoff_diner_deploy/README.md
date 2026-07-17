# Handoff: Prompt2Eat — Diner storefront surfaces (D1–D7)

## Overview
This package is everything needed to ship the **diner-facing storefront** of Prompt2Eat
to the real app. It covers the full diner path:

1. **Storefront landing** (hero + category tiles)
2. **Menu** (category nav, dietary filter, search, item cards, loading skeleton)
3. **Item modifier sheet** (size/required/optional modifiers, stepper, gated Add CTA)
4. **Concierge panel** (forest-dark AI conversation surface)
5. **Checkout** (card + Pay-by-bank/PayTo, order summary, success)
6. **Order status** (placed → prep → ready, plus the forest-dark bank-approval wait)
7. **Account** (YOUR USUAL hero, points, history + one-tap reorder, details,
   notifications, saved mandate)
8. **Utility surfaces** (per-venue sign-in, check-inbox, 404, empty-search)

The target repo is **github.com/zenulbashar/order-tool** (Next.js App Router + Tailwind v4).
These surfaces already exist as React components — **this is a responsive + motion + firewall
refinement of existing components, not net-new UI.** Each screen below names the exact source
files to edit.

---

## About the design files (read this first)
The files in `prototypes/` are **design references authored in plain HTML/CSS** — they show the
intended look, layout, responsive reflow, and motion. **Do not ship the HTML directly.** Recreate
each design in the app's existing environment (React components + Tailwind utilities + the token
layer already in `app/globals.css`), following the codebase's established patterns.

The prototypes are **self-contained**: fonts load from Google Fonts, and every color/radius/shadow
is copied 1:1 from `app/globals.css`, so they render standalone in any browser. CSS gradients and
letter monograms stand in for photography — the real app uses uploaded venue imagery.

## Fidelity: **High-fidelity (hifi)**
Final colors, typography, spacing, radii, shadows, responsive breakpoints, and motion are all
production values lifted from the live token layer. Recreate pixel-for-pixel using the app's
existing token-backed Tailwind utilities (`bg-surface`, `text-ink`, `rounded-card`,
`shadow-card`, `var(--action)`, etc.) — do **not** hardcode hex where a token exists.

---

## What's in this bundle
```
design_handoff_diner_deploy/
├─ README.md                       ← this file (self-sufficient implementation guide)
├─ prototypes/                     ← the 9 hifi HTML design references
│  ├─ storefront-landing.html
│  ├─ diner-home.html
│  ├─ menu.html
│  ├─ item-sheet.html
│  ├─ concierge.html               (forest-dark AI surface)
│  ├─ checkout.html
│  ├─ order-status.html
│  ├─ account.html                 (incl. forest-dark YOUR USUAL hero)
│  └─ signin-empty.html
├─ reference/
│  ├─ globals.css                  ← THE token + p2e-* motion source of truth (app/globals.css)
│  ├─ tokens.css                   ← standalone token export (same values, no Tailwind)
│  ├─ tailwind.theme.js            ← the theme mapping (colors/radii/shadows/fonts)
│  └─ design-system-CLAUDE.md      ← the design-system rules (firewall, motion, naming)
└─ screenshots/                    ← one reference capture per screen (01–09)
```

### Exhaustive per-tile screenshots (already in the repo)
Every tile is already captured at **5 breakpoints** — mobile / tablet / laptop / desktop /
native — under:
```
design/design_handoff_prompt2eat/blocks/diner/*.png     (589 files)
```
Naming: `<screen>-<tile>-<breakpoint>.png` (e.g. `account-account-history-mobile.png`,
`account-your-usual-desktop.png`). The numbered `01-…`–`11-…` PNGs are the original authored
board tiles. Use these as the exhaustive visual reference; `screenshots/` here holds one hero
capture per screen for quick orientation.

---

## The firewall (most important rule — do not violate)
Prompt2Eat uses **one CSS variable, `--action`, as an owner↔diner firewall** (see the block
comment in `reference/globals.css`). Every functional accent references `var(--action)` +
`var(--action-contrast)`:

| Context | `--action` resolves to | Set by |
|---|---|---|
| Owner / product surfaces | forest `#16241c` | `:root` default |
| **Diner storefront** | the per-tenant **venue `--brand`** | `[data-domain="diner"]` + inline `--brand` |
| Platform Admin | amber `#f4b43c` | `.admin-dark` |

**Amber (`--color-accent` `#f4b43c`) is reserved for AI affordances only** and must never read
`--action`. On the diner surfaces that means:

- **Every functional accent = the venue brand** (`--action`): CTAs, active nav, selected option
  rows, steppers, toggles, progress fills, order-status active node.
- **Amber appears ONLY on AI moments**: the concierge panel (its whole surface), the concierge
  launcher/FAB, the "Ask the concierge" nudge on empty-search, and the AI sparkle (`✦`).
- **Status colors are semantic, not brand**: dietary tags → `--color-success` green;
  required hints / life-safety notes / destructive → `--color-warm` terracotta;
  paid/confirmed → success green.
- The one **amber-on-light exception** is the **focus ring** (`--focus-ring`, a keyboard-focus
  affordance) and the loyalty **points-redeem checkbox** in Stripe's payment step
  (`accent-[--color-accent]`) — both affordances, never fills.

### Two sanctioned forest-dark diner surfaces
These two — and only these — are dark and may use amber as their on-dark accent:
1. **Concierge panel** (`concierge.html`) — the AI conversation surface.
2. **Account "YOUR USUAL" hero** (`account.html`) — the most-repeated-order reorder card.
   Its Reorder button is **amber (`bg-accent` + `text-forest`)**, matching `order-history.tsx`.
   (The rest of account — points, history list, forms — stays light + venue-brand.)

The dark surfaces use the `--color-concierge-*` token family (mint/sage/thinking/glow/etc.),
defined verbatim in `reference/globals.css`.

---

## Design tokens (from `reference/globals.css` `@theme`)
Use the token-backed Tailwind utilities; the raw hex is here for reference only.

**Color**
- Forest (dark surfaces): `--color-forest #16241c`, `--color-forest-deep #13301f`, `--color-forest-deepest #0e1f18`
- Amber (AI only): `--color-accent #f4b43c`, `--color-accent-deep #b07f1e`
- Warm (alerts/destructive): `--color-warm #e2553a`, `--color-warm-deep #cf4527`
- Success: `--color-success #3fa66a`, `--color-success-deep #2f8a55`
- Surfaces: `--color-surface #f7f3ea` (page), `--color-surface-elevated #fffdf8` (cards), `--color-sand #efe7d6`
- Lines: `--color-line #e6ddcb`, `--color-line-strong #d8cbb0`
- Text: `--color-ink #0e1f18`, `--color-muted #6e756b`, `--color-label #a0987f`
- Concierge (forest-dark): glow `#1c4231`, mint `#7fd6a0`, sage `#a9c3b1`, thinking `#7fa890`,
  input `#88a896`, ai-text `#eaf3ec`, amber-ink `#3a2a08`, amber-from `#f6be4a`, amber-to `#efa82c`
  (plus the `color-mix` ai-bg/ai-border/card-bg/card-border/pill-bg/pill-border — see globals)
- Sample venue brand used in the prototypes: **terracotta `#a6572e`** on cream `#fffdf8`
  (this is only a *sample* tenant brand to prove the firewall; the real value is per-venue
  `venue.brandColor`, set inline as `--brand` alongside `data-domain="diner"`).

**Radius**: `--radius-pill 999px`, `--radius-card 16px`, `--radius-control 11px`,
`--radius-control-sm 9px`, `--radius-control-lg 13px`, `--radius-input 12px`, `--radius-sm 6px`

**Shadow**: `--shadow-card 0 1px 3px rgb(20 30 25/.05), 0 20px 40px -20px rgb(20 30 25/.14)`;
`--shadow-lift 0 9px 18px -8px rgb(22 36 28/.55)`; `--shadow-cta 0 12px 22px -10px rgb(239 168 44/.55)`

**Focus rings**: `--focus-ring` (amber 38%), `--focus-ring-danger` (warm 30%), `--focus-ring-input` (amber 16%)

**Type**: display = **Bricolage Grotesque** (headlines/wordmark), body = **Hanken Grotesk** (UI/body),
mono = **Space Mono** (labels, eyebrows, AI-prompt, data). Set on `<html>` via next/font in `layout.tsx`.
Minimum interactive hit target = **44px** (documented floor in `button-variants.ts`).

---

## Motion library (`p2e-*` — all defined in `reference/globals.css`)
Every animation in the prototypes is a **real `p2e-*` keyframe copied verbatim** from
`globals.css`, and each is **reduced-motion guarded** (`@media (prefers-reduced-motion: reduce)`
holds it steady). Do not invent keyframes. Exact bodies/durations live in `globals.css`; the
brief's explicit ask is to **finally wire the "foundation" keyframes that nothing referenced yet.**

**Already wired in the app today** (keep): `p2e-spark` (concierge/AI twinkle), `p2e-glow`
(YOUR USUAL hero glow, connected states), `p2e-ring` (order-status active step), `p2e-think`
(thinking dots), `p2e-scan` (invoice scan), `p2e-toastin` (toasts).

**Newly wired by this handoff** (were foundation-only — wire them into the named components):
| Keyframe | Where to wire | Prototype reference |
|---|---|---|
| `p2e-shimmer` | menu loading skeleton; checkout Payment-Element mount skeleton | `menu.html` `.skelcard`, `checkout.html` `.skcard` |
| `p2e-fly` + `p2e-cartpulse` | add-to-cart + one-tap reorder (ghost arcs to cart, button pulses) | `menu.html` / `account.html` `.js-reorder` handler |
| `p2e-slidein` | staggered cart-line / list entrances (`animation-delay` .04/.10/.16s) | cart rails, `account.html` history, `order-status.html` steps |
| `p2e-rise` | card/section entrances | `order-status.html` cards, `signin-empty.html` surfaces |
| `p2e-count` | points balance count-in, concierge "found N matches" | `account.html` `.p2e-count`, concierge status |
| `p2e-progress` | checkout pay progress; order bank-approval wait bar (slowed to ~9s) | `checkout.html` `.progress-track`, `order-status.html` `.bank-bar` |
| `p2e-checkloop` + `p2e-draw` | success tick (ring loop + check draw) on checkout + order-ready | `checkout.html` `.success`, `order-status.html` `.ready-mark` |
| `p2e-blink` | concierge trailing caret | `concierge.html` `.caret` |
| `p2e-spin` | inline button spinner (processing) | `checkout.html` `.spinner` |

**Rule:** never drive these from inline `animation:` in JSX in a way that resets on re-render —
apply the `.p2e-*` utility class (they're global in `globals.css`), and gate any JS-triggered
motion behind `matchMedia('(prefers-reduced-motion: reduce)')` exactly as the prototypes do.

---

## Screens → source files (what to edit)
All paths are relative to the repo root. Break points to design/capture: **390 / 768 / 1280 / 1536 + native** (Capacitor WebView, `viewport-fit=cover` + `env(safe-area-inset-*)`).

### 1. Storefront landing — `prototypes/storefront-landing.html`
- **Source:** `app/[slug]/storefront-hero.tsx`, `category-tiles.tsx`, `storefront.tsx`, `announcement-bar.tsx`
- **Layout:** sticky ink announcement bar (dismissible, cream text, no amber) → mobile header /
  desktop centered app bar (h-16) → hero band → category tiles grid (2-col → 3 → 4).
- **Motion:** `p2e-rise`/`p2e-slidein` stagger on tile grid; concierge FAB (amber).
- **Firewall:** venue brand throughout; FAB is the only amber.

### 2. Menu — `prototypes/menu.html`
- **Source:** `app/[slug]/menu/page.tsx`, `category-nav.tsx`, `dietary-filter.tsx`,
  `menu-search.tsx`, `item-card.tsx`
- **Layout:** sticky category strip (mobile pill scroll-chips, active = brand fill / desktop
  underline tabs, active = ink + 3px brand underline) + search (pill, Space Mono placeholder,
  focus ring = brand). Body is a 1-col list (mobile) → `[1fr 336px]` grid with a sticky cart
  rail at `lg`. Item cards: **mobile = horizontal row, desktop = vertical card**; 44px round
  Add on mobile, small "Add" pill on desktop.
- **States:** search-active (result count + filtered grid), search-empty (amber `✦` + concierge
  nudge, mirrors `search-empty-state.tsx`), **menu-skeleton (first `p2e-shimmer` wiring)**.
- **Firewall:** dietary active chips = success-green; disclaimer = warm; **cart-rail Checkout CTA
  is deliberately INK**; concierge nudge/FAB = amber.

### 3. Item modifier sheet — `prototypes/item-sheet.html`
- **Source:** `app/[slug]/item-modifier-sheet.tsx`, `item-selection.tsx`,
  `app/_components/selection-controls.tsx` (radio/checkbox `accent-color`), `stepper.tsx` (44px),
  `button-variants.ts`
- **Responsive:** mobile bottom-sheet (`items-end`, rounded top, slide-up) → `sm` centered modal
  (`max-w-lg`, rounded all) → `lg` two-column modal (`flex-row`, image left 44%, `max-w-3xl`).
- **States:** size picker (required), required radio group, optional checkbox group **at cap**
  (remaining rows disabled) with `+$` deltas, 44px stepper, gated CTA
  ("Select a size" → "Add to cart · $X").
- **Firewall:** selected rows + Add CTA = brand; required hints + life-safety = warm; dietary tags
  green/neutral; **no amber** (not an AI surface).

### 4. Concierge panel — `prototypes/concierge.html`  ⚠ forest-dark AI surface
- **Source:** `app/[slug]/concierge/concierge-panel.tsx`, `multi-item-picker.tsx`,
  `concierge-launcher.tsx` + the `--color-concierge-*` tokens
- **Responsive:** mobile full-width bottom sheet (`items-end`) → `sm` centered (`max-w-lg`) →
  `lg` docked bottom-right fixed panel (`w-[420px]`, `h-[min(660px,85dvh)]`).
- **Panel bg (from source):** `radial-gradient(130% 70% at 50% 0%, var(--color-concierge-glow),
  var(--color-forest-deepest) 72%)`. Header wordmark = **"Prompt2Eat"** + amber `AI` badge;
  sub-line toggles "Tell me what you feel like" / mint "● found N matches".
- **Amber (sanctioned here):** title spark, AI badge, diner bubble (amber gradient), thinking
  spark + dots, proposed-card border, Add / Add-all / send buttons, multi-item checkboxes.
  **Non-amber:** mint status, sage descriptions/life-safety, thinking-token labels.
- **Behavior:** suggestion pills + example prompts **prefill only** (the diner still taps send —
  no AI call without explicit action); the concierge never mutates the cart directly (routes
  through the modifier sheet / `addItem`); life-safety disclaimer always present.
- **Motion:** `p2e-spark` (title + thinking), `p2e-slidein` (answer reveal), `p2e-blink` (caret),
  `p2e-count` (found N), `p2e-rise` (proposed cards, staggered), `p2e-think` (dots).

### 5. Checkout — `prototypes/checkout.html`  🔒 design only
- **Source:** `app/[slug]/checkout/checkout-client.tsx`, `payment-step.tsx`, `cart-review.tsx`,
  `schedule-picker.tsx` — **INVARIANT: never touch `checkout/actions.ts` or the Stripe webhook.**
  The order is confirmed ONLY by the signature-verified webhook, never the client.
- **Layout:** mobile single column with a **sticky bottom Pay bar** (safe-area aware) → `lg`
  two columns (form/steps left, sticky order-summary rail right).
- **Fulfilment:** Pickup / Dine-in / Delivery segmented → Pickup shows ASAP vs schedule
  (day chips + slot grid); Dine-in shows table number.
- **Payment:** the Stripe **Payment Element renders in a cross-origin iframe that can't be
  restyled** — represent it as a clearly-labelled placeholder. In the real component Stripe's
  `appearance` API is fed literal hex (the one sanctioned place) with `colorPrimary = venue brand`.
  Card + **Pay-by-bank (PayTo)** states both present; PayTo shows the "approve in your banking
  app" explainer + bank picker + the "save on top of any promotion" callout.
- **Firewall:** **no amber** (payment ≠ AI). Pay CTA / segments / selected states = venue brand;
  success = green; destructive = warm. Amber survives only as the focus-ring token.
- **Motion:** `p2e-shimmer` (Element mount), `p2e-spin` + `p2e-progress` (processing),
  `p2e-checkloop` + `p2e-draw` (confirmed).
- **Scope note:** the real `payment-step.tsx` also has promo-code, gift-card, points-redeem, and
  Express Checkout (Apple/Google Pay) rows not drawn here — add them from the source when wiring.

### 6. Order status — `prototypes/order-status.html`
- **Source:** `app/[slug]/order/[token]/page.tsx`, `payment-status-poller.tsx`
- **Layout:** single-column tracker (mobile-primary — diners keep this open on a phone);
  header + vertical stepper (Placed → Confirmed → Preparing → Ready). Native-safe.
- **Active step:** a **brand-filled node** whose expanding `p2e-ring` pulse is **amber** — this is
  the sanctioned "processing/active" status-signature (`p2e-ring` is hardcoded to `--color-accent`
  in globals.css), not a functional amber accent.
- **Bank/PayTo waiting (forest-dark):** matches `payment-status-poller.tsx` bank variant —
  gentle **~6s poll over a ~10-minute window** ("this page keeps checking for about 10 minutes"),
  reassuring copy ("Waiting for your bank to confirm…", "check with the venue before paying
  again — you won't be charged twice"), amber processing dots + mint progress bar. Never an error,
  never an endless spinner.
- **Motion:** `p2e-ring` (active), `p2e-slidein` (steps), `p2e-progress` (bank bar, slowed),
  `p2e-checkloop`/`p2e-draw` (ready tick).

### 7. Account — `prototypes/account.html`  (incl. forest-dark YOUR USUAL hero)
- **Source:** `app/[slug]/account/{page,points-panel,order-history,account-nav,signin-form}.tsx`,
  `details/`, `notifications/`, `payment/`
- **Layout:** shell `max-w-2xl` → `lg:max-w-[960px]` `[210px 1fr]` grid. `account-nav.tsx` =
  horizontal scroll tabs (mobile) → sticky side-nav (`lg`). **Exactly 4 nav items:** Orders /
  Your details / Saved payment / Notifications (active = `bg-[#f7e7de]` warm-peach wash, NOT amber).
- **YOUR USUAL hero (forest-dark):** `linear-gradient(135deg, forest-deep, concierge-glow)`, amber
  eyebrow + amber radial `p2e-glow`, white title, sage count. **Reorder button = amber
  (`bg-accent` + `text-forest`)** per source — the dark-surface idiom.
- **Points (light, brand):** loyalty is NOT AI → brand fill on the balance `p2e-count` + progress
  `p2e-progress`; never amber.
- **History:** staggered `p2e-slidein` cards; **Reorder = secondary/bordered button**
  (`Button variant="secondary" size="sm"` in source), NOT a brand fill. One-tap reorder fires
  `p2e-fly` + `p2e-cartpulse` (reduced-motion → pulse only). Reorder seeds ids only, re-prices live.
- **Details/Notifications/Saved-mandate:** brand CTAs; toggle (`role="switch"`) active track =
  brand; saved bank mandate → one-tap returning-checkout CTA.

### 8. Utility surfaces — `prototypes/signin-empty.html`
- **Source:** `app/[slug]/account/signin-form.tsx`, `not-found.tsx`, `search-empty-state.tsx`
- Sign-in (magic-link request), check-inbox (venue-branded — **distinct** from the product-level
  forest/amber `app/signin/check-inbox/page.tsx`), venue 404, empty-search (amber `✦` +
  forest-gradient concierge nudge). Brand CTAs; amber only on the empty-search AI sparkle + nudge.

---

## Interactions & behavior (carried in the prototypes)
- **Add-to-cart / reorder:** brand ghost arcs on the `p2e-fly` path toward the cart while the
  button pulses (`p2e-cartpulse`); guarded so reduced-motion users get the pulse only, no ghost.
- **Concierge:** prefill-only pills/prompts; explicit send; never a direct cart write; multi-item
  picker is the only bulk-add path and only after every required choice is valid.
- **Checkout:** fulfilment switches the visible step (pickup→schedule, dine-in→table);
  method switches card↔PayTo block; Pay → idle→processing→(webhook-confirmed) success.
- **Order status:** soft `router.refresh()` poll flips to "Paid" when the webhook lands; bank
  variant polls gently for 10 min then shows a calm "still processing" fallback.
- **Native (Capacitor):** `?native=1` in each prototype shows the status-bar inset + safe-area
  padding; replicate with `env(safe-area-inset-*)` and `viewport-fit=cover`.

## Assets & logo
- **No raster logo ships in this bundle.** Venue identity is a **per-tenant `brandColor` + name
  monogram** (the "F" tile for the sample "Fig & Flour"); real venues may upload a logo image.
  Render the monogram from the venue name initial on a `var(--action)` tile, exactly as the
  prototypes do. The product wordmark is **"Prompt2Eat"** in Bricolage Grotesque (see the
  concierge header + `P2EMark` in the design system).
- **Icons** are inline SVG (stroke `currentColor`) — copy them from the prototypes verbatim.
- **Photography** is represented by CSS gradients / monograms; wire real venue imagery in the app.
- **Fonts** are Google Fonts (Bricolage Grotesque, Hanken Grotesk, Space Mono) — already loaded
  app-side via next/font in `layout.tsx`.

## Accessibility
- All interactive controls ≥ **44px** (round Add, stepper, reorder, toggles, close buttons).
- Keyboard focus ring = amber `--focus-ring` on every interactive element (affordance, not a fill).
- Every `p2e-*` animation is reduced-motion guarded; JS-triggered motion checks `matchMedia`.
- Life-safety: dietary tags are always framed as a venue guide, never a guarantee; the concierge
  never asserts allergen safety.

## Definition of done
- [ ] Each screen recreated in its named source component(s), pixel-matched to the prototype at 390/768/1280/1536 + native.
- [ ] The 9 foundation `p2e-*` keyframes above wired into their listed components, all reduced-motion guarded.
- [ ] Firewall intact: amber only on the AI surfaces + focus ring; venue brand elsewhere; the two forest-dark surfaces correct.
- [ ] No changes to `checkout/actions.ts` or the Stripe webhook; order confirmation stays webhook-only.
- [ ] a11y: 44px targets, focus rings, semantic status colors verified.
