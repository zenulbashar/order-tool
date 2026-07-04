# Handoff: Prompt2Eat — Product UI & Design System

## Overview
Prompt2Eat is an AI-assisted product for restaurants, with two primary surfaces — an **Owner** dashboard (menu building / management) and a **Diner** experience — plus a shared **component system**, a **brand/identity** page, and a **roadmap**. This package documents the visual system and each screen so it can be rebuilt faithfully in a real codebase.

## About the Design Files
The files in this bundle are **design references authored in HTML** — interactive prototypes that show the intended look, states, and behavior. They are **not production code to copy directly**. Each `*.dc.html` file is a "Design Component" that renders through a small runtime (`support.js`) using **inline styles** (no CSS classes, no token variables yet).

Your task is to **recreate these designs in the target codebase's existing environment** (React + your `@theme` tokens, Vue, SwiftUI, etc.), mapping the values below onto your shared primitives and tokens. If no environment exists yet, pick the most appropriate framework and implement there. **Lift the inline values below into your token layer** rather than hardcoding them per component.

## Fidelity
**High-fidelity (hifi).** Colors, typography, spacing, radii, shadows, and interaction states are final and exact (see Design Tokens). Rebuild pixel-faithfully using your codebase's primitives. The one caveat: values live **inline** in the prototypes, so there is no pre-made token file — this README is the token source of truth.

---

## Design Tokens

### Typography
Three Google Fonts:
- **Bricolage Grotesque** (400–800) — display / headings / logo / marketing CTAs. Tight tracking (`-0.02em` to `-0.035em`).
- **Hanken Grotesk** (400–800) — body, UI labels, buttons. This is the default `body` font.
- **Space Mono** (400/700) — eyebrows, micro-labels, column headers, code/placeholders. Uppercase, wide tracking (`0.1em`–`0.2em`).

Import: `https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Hanken+Grotesk:wght@400;500;600;700;800&family=Space+Mono:wght@400;700&display=swap`

Type scale observed (px): logo 36 · section/card title 19 (Bricolage 800) · body 15 · button 13 (md, Hanken 700) · helper 12 · micro-label 9–11 (Space Mono 700). `-webkit-font-smoothing: antialiased`.

### Color
| Role | Hex |
|---|---|
| Ink / primary text & primary button bg | `#16241C` |
| Ink hover | `#21342A` |
| Ink muted text on dark | `#F7F3EA`, disabled `#cdd6cf` |
| **Amber accent** (the "2", focus, highlights) | `#F4B43C` |
| Amber CTA gradient | `linear-gradient(180deg,#F6BE4A,#EFA82C)` |
| Amber focus ring | `rgba(244,180,60,0.32–0.40)` |
| Destructive | `#E2553A` (hover `#cf4527`) |
| Card / surface (warm white) | `#FFFDF8` |
| Alt surface / hover fill | `#FBF8F1`, `#F1EAD9` |
| Page/body neutral text | `#6E756B`, `#8a9384`, `#86907f` |
| Micro-label / tertiary text | `#a0987f`, `#b6ab92`, `#b0a890` |
| Card border | `#EFE7D6` |
| Input / control borders | `#e6ddcb`, `#d8cbb0`, `#c6b793`, `#dfe4d8` |
| Disabled primary bg / text | `#e7dcc4` / `#b0a890` |

Overall palette = **deep forest-green ink + warm cream surfaces + single amber accent**, with a warm-coral destructive.

### Radius
- Buttons: `9px` (sm) · `11px` (md) · `13px` (lg)
- Inputs: `12px`
- Cards / panels: `22px`
- Pills / badges / tabs: `999px`

### Shadow
- Card: `0 1px 3px rgba(20,30,25,.05), 0 20px 40px -20px rgba(20,30,25,.14)`
- Button hover lift: `0 9px 18px -8px rgba(22,36,28,.55)` + `translateY(-1px)`
- Focus ring: `0 0 0 4px rgba(244,180,60,.32–.40)` (amber, used across all variants)
- CTA: `0 12px 22px -10px rgba(239,168,44,.55)`

### Spacing
Card padding `24px 26px`; grid/flex gaps `12–15px`; button padding md `9px 16px`, sm `6px 12px`, lg `12px 22px`.

---

## Components (from P2E-Components.dc.html — the source of truth for states)
- **Buttons** — 4 variants (Primary, Secondary, Ghost, Destructive) × 5 states (Default, Hover, Focus, Loading, Disabled). Amber focus ring on every variant. Loading = 13px spinner (amber top on primary; ink top otherwise, `p2e-spin .7s linear infinite`). Plus an amber gradient marketing CTA, 3 sizes, and icon buttons (`＋`, `✦ Ask AI`).
- **Inputs & selects** — text fields with Default / Focus / Filled / Error / Disabled states; Space Mono placeholder text `#b6ab92`; focus = amber ring; radius 12px.
- Additional patterns in the file: badges/pills, toasts (`p2e-toastin`), empty states, AI "thinking" dots (`p2e-think`), shimmer/skeleton (`p2e-shimmer`), and other animated states. **Read the file directly** for exact per-state styling.

### Named animations (keyframes, in every file's `<helmet>`)
`p2e-glow`, `p2e-spark`, `p2e-think` (staggered dot bounce), `p2e-shimmer` (skeleton), `p2e-spin` (loaders `.7s`), `p2e-blink` (cursor), `p2e-toastin` (slide-in), `p2e-pop` (badge), `p2e-float`, `p2e-ring` (amber pulse).

---

## Screens / Views
All screens are **freeform canvas layouts** (`design_doc_mode: canvas`) — panels are absolutely positioned on a large board, not a single responsive flow. Treat them as a catalog of the intended surfaces/components; apply your app's real responsive layout when implementing.

- **Identity** — `Prompt2Eat.dc.html` — brand/logo, color, type, and voice. Logo lockup: `Prompt` + amber `2` + `Eat` in Bricolage 800, `-0.035em`.
- **Components** — `P2E-Components.dc.html` — the reusable kit (buttons, inputs, all states). Primary reference for interaction states.
- **Owner** — `P2E-Owner.dc.html` — restaurant-owner dashboard / menu management surface.
- **Diner** — `P2E-Diner.dc.html` — diner-facing experience.
- **Roadmap** — `P2E-Roadmap.dc.html` — product roadmap.

Cross-links: each screen has a pill nav (Identity · Components · Owner · Diner · Roadmap); the active pill is amber `#F4B43C` on ink text.

## Shared pieces
- `P2ESidebar.dc.html`, `P2EMark.dc.html` — shared sidebar and logo mark, imported by the screens.

## Interactions & Behavior
- **Focus:** amber ring `0 0 0 4px rgba(244,180,60,.32–.40)` on all interactive elements.
- **Hover:** buttons lift `translateY(-1px)` + shadow; ghost gets `#F1EAD9` fill; secondary darkens border/bg.
- **Loading:** inline spinner replaces/precedes label; `.7s linear` spin.
- **Disabled:** desaturated warm greys, no shadow, no pointer.
- **Toasts:** slide in from right (`p2e-toastin`).
- Transitions are short (~150–250ms) ease-out; match the keyframe durations above.

## State Management
Prototypes are largely presentational. For implementation you'll need: form field state + validation (error state shown), async action state (idle/loading/success/error for Save/Delete), toast queue, and menu/data models for Owner (menu items) and Diner surfaces. Derive exact fields from the Owner/Diner files.

## Assets
No raster images or custom SVG icon set — icons are Unicode glyphs (`→ ＋ ✦ ✕`) and CSS-drawn shapes. Fonts are Google Fonts (see import). Replace glyphs with your icon library's equivalents.

## Screenshots
- `screenshots/` — one full-resolution PNG per board (identity, components, owner, diner, roadmap), captured at native 1:1.
- `blocks/` — **each individual card/screen cropped as its own PNG**, organised by board (`blocks/identity/`, `blocks/components/`, `blocks/owner/`, `blocks/diner/`, `blocks/roadmap/`). Each file is named for its caption (e.g. `04-logo-dark.png`, `01-menu-management-compact-item-editor.png`). Use these as per-component visual references.

## Ready-to-paste code (start here)
- `CLAUDE.md` — implementation guide + Button/Input/Card reference components for Claude Code.
- `tokens.css` — framework-agnostic CSS custom properties + all keyframes (paste into global CSS).
- `tailwind.theme.js` — Tailwind `theme.extend` (colors, fonts, radii, shadows, animations).

## Files (in this bundle)
- `Prompt2Eat.dc.html` — Identity
- `P2E-Components.dc.html` — Component system (state reference)
- `P2E-Owner.dc.html` — Owner dashboard
- `P2E-Diner.dc.html` — Diner experience
- `P2E-Roadmap.dc.html` — Roadmap
- `P2ESidebar.dc.html`, `P2EMark.dc.html` — shared sidebar + logo mark
- `support.js` — runtime required to open the `.dc.html` files in a browser

### How to open the references
Open any `.dc.html` in a browser (they load `support.js` from the same folder and fonts from Google Fonts). They're for **viewing**; rebuild the UI in your framework using the tokens above.
