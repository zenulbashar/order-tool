# Responsive design prototypes

Living, **responsive** rebuilds of the Prompt2Eat surfaces, authored against the
**live** token layer (`app/globals.css`) and the real components — the extension
work described in `design/CLAUDE-DESIGN-BRIEF.md`. Unlike the canvas
`*.dc.html` comps in `design_handoff_prompt2eat/` (absolutely-positioned, single
width), these reflow for real across every breakpoint and wire the `p2e-*`
motion library, so they can be screenshotted per-tile.

## What's here

| Path | What |
|---|---|
| `diner/storefront-landing.html` | Diner storefront **landing** (front door) — announcement, app bar / mobile header, full-bleed desktop hero + mobile brand-tint banner, big category tiles (primary nav), footer, concierge launcher. |
| `diner/diner-home.html` | Diner storefront **home** (menu view) — announcement, app bar / mobile header, hero, sticky category strip, category tiles, item cards (photo · monogram · choose · added), cart rail, mobile cart bar, concierge launcher, plus skeleton + AI-thinking states. |
| `diner/item-sheet.html` | Diner **item modifier sheet** — mobile bottom-sheet ↔ `sm` centered modal ↔ `lg` two-column modal. Hero image, size picker, life-safety note, required/optional modifier groups (radio + at-cap checkbox), "goes well with", 44px stepper + gated Add CTA. |
| `capture.mjs` | Playwright harness — renders a prototype at each breakpoint and crops every `[data-tile]`. Usage: `node design/prototypes/capture.mjs <html> <board> <prefix>`. |

## Fidelity rules honoured

- Tokens are copied 1:1 from `app/globals.css`; nothing is hardcoded off-palette.
- `data-domain="diner"` maps `--action` → the venue `--brand` (sample: a warm
  terracotta, deliberately unlike the product's forest/amber so the **firewall**
  is visibly working). Amber (`--color-accent`) appears **only** on AI affordances
  (concierge nudge/launcher, announcement spark). The cart-rail Checkout CTA is
  **ink**, never the brand — matching `cart-rail.tsx`.
- The `lg` (1024px) switch flips item cards from mobile rows → desktop cards and
  swaps the mobile cart bar for the sticky 336px cart rail, exactly as source.
- Every animation is `prefers-reduced-motion` guarded (captures run reduced).

## Breakpoints captured

`mobile 390 · tablet 768 · laptop 1280 · desktop 1536 · native 390 (Capacitor
status bar + safe-area)`.

## Motion proof (`-motion.png`) + animated wordmark

Animation-heavy tiles are captured a **second way** — live, with animations
running (not reduced-motion) — as `<screen>-<tile>-motion.png`, so the PNGs show
the motion in progress: the `p2e-scan` menu read, `p2e-checkloop`/`p2e-draw`
success tick, `p2e-ring` order pulse, `p2e-think`/`p2e-shimmer`/`p2e-glow`, and
the **animated Prompt2Eat wordmark** (amber "2" with a `p2e-glow` halo, per the
identity handoff) on the AI processing states + the concierge header. Regenerate
with `scratchpad/pw/capture-live.mjs <html> <board> <prefix> "<tile,tile>" <ms>`.

## Regenerate the screenshots

Screenshots land in `design/design_handoff_prompt2eat/blocks/<board>/` as
`<prefix>-<tile>-<breakpoint>.png` (+ `-full-` / `-viewport-` overviews).

```bash
# from a dir where playwright-core resolves (Chromium is pre-installed):
npm i playwright-core
node design/prototypes/capture.mjs design/prototypes/diner/diner-home.html diner home
```

The harness points at the pre-installed Chromium (`/opt/pw-browsers/...`); override
with `P2E_CHROMIUM=/path/to/chrome`. Do **not** run `playwright install`.

## Diner path progress

- [x] storefront landing (front door) — `diner/storefront-landing.html`
- [x] storefront home (menu view) — `diner/diner-home.html`
- [x] item modifier sheet — `diner/item-sheet.html`
- [x] menu page (category-nav / dietary filter / search / skeleton) — `diner/menu.html`
- [x] concierge (forest-dark AI panel) — `diner/concierge.html`
- [x] checkout (card + PayTo states) — `diner/checkout.html`
- [x] order status (placed → prep; bank-approval waiting) — `diner/order-status.html`
- [x] account (overview / YOUR USUAL / history / saved mandate) — `diner/account.html`
- [x] sign-in / check-inbox / not-found / empty-search — `diner/signin-empty.html`

**Diner path complete.** Next: owner dashboard (gated behind O0 sidebar chrome), then onboarding / admin / marketplace / native, plus the cross-cutting sweeps.

## Owner path

Owner root — `--action = forest` (no `data-domain="diner"`). The sidebar is the
owner's one dark chrome surface where **amber is the sanctioned signature**
(active nav, plan badge, order-count pills); the cream content uses forest
`--action`, amber only for AI (support widget, import/descriptions).

- [x] O0 sidebar chrome + support widget — `owner/o0-chrome.html` (rail · collapsed · mobile drawer · home hub · support)
- [x] O1 home overview — covered by O0's content shell (hub tiles + PageHeader)
- [x] O3 orders & customers — `owner/o3-orders.html` (kitchen board: new p2e-ring · columns · notes · docket split · elapsed/late · status controls · ticket drawer)
- [x] O2 menu editor + health (core) — `owner/o2-menu.html` (master-detail list/detail · item form + AI suggest · sizes/modifier editors · radial menu-health)
  - [x] O2 AI: import-from-photo + write-descriptions — `owner/o2-ai.html` (animated Prompt2Eat wordmark + p2e-scan/think/shimmer/spark; `-motion` frames captured live)
  - [x] O2 AI: Design studio — `owner/o2-studio.html` (Menu + Banner modes, size presets, AI generate-copy panel, venue-branded artwork previews, animated-wordmark generating state)
  - **O2 complete.**
- [ ] O4 stock · O5 storefront settings · O6 payments & billing · O7 connections

Each becomes a `<surface>/<name>.html` prototype here + a per-tile block set.
