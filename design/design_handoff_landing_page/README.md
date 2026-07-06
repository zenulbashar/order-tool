# Handoff: Prompt2Eat Marketing Landing Page

## Overview
The flagship marketing landing page for **Prompt2Eat** (prompt2eat.com) — an AI-native
restaurant platform. The page is diner-first: its centerpiece is an interactive, auto-playing
**AI Concierge** phone demo where a diner talks to order in natural language. Secondary
narrative covers the owner platform ("For Restaurants") and a hardware **Shop**.

Page flow (top → bottom): sticky nav → forest-dark hero + concierge demo → trust strip →
concierge deep-dive (4 feature rows) → How it works (Scan/Chat/Eat) → For Restaurants (bento) →
Hardware Shop (filterable grid) → social proof (animated metrics + testimonials) →
pricing (3 tiers) → final CTA band → footer.

## About the Design Files
The files in `code/` are **design references authored in HTML** — working prototypes that show
the intended look, motion, and behavior. They are **not** production code to paste in. They use a
lightweight in-house component runtime (`support.js`, the `<x-dc>` / `dc-import` tags). **Do not
ship that runtime.** Your task is to **recreate these designs in the target codebase's existing
environment** (React/Next, Vue, Astro, SwiftUI, etc.) using its established patterns, component
library, and styling approach. If no codebase exists yet, the natural fit is **Next.js + Tailwind**
(a `tailwind.theme.js` and `tokens.css` already exist in the sibling `design_handoff_prompt2eat/`
design-system bundle — reuse them).

The prototypes are the source of truth for **animation and interaction**. Open
`code/Prompt2Eat-Landing.dc.html` in a browser (it fetches its sibling `.dc.html` files +
`support.js` from the same folder) to watch the concierge stream, the scroll reveals fire, and the
counters run. Everything is documented below so you can rebuild it from this README alone.

## Fidelity
**High-fidelity (hifi).** Final colors, typography, spacing, radii, shadows, copy, and interactions.
Recreate pixel-accurately. All hex values, font sizes, and easings below are exact.

---

## Design Tokens

### Color
| Token | Hex | Use |
|---|---|---|
| Ink (forest) | `#16241C` | Primary text on light, dark buttons, wordmark |
| Forest deep | `#0F281E` | Dark section base |
| Forest darkest | `#0C1C15` | Trust strip / footer / deepest bg |
| Forest mid | `#143228` / `#14352A` | Gradient partners, dark cards |
| Forest tint | `#1D4636` | Top of hero radial |
| Cream 0 | `#FFFDF8` | Page background, light cards |
| Cream 1 | `#FBF6EC` / `#FBF8F1` | Section gradient partner |
| Panel | `#F6F0E2` / `#F6EAD0` | Inset tiles, icon tiles |
| Amber (accent) | `#F4B43C` | Primary CTA, highlights, the "2" in wordmark |
| Amber deep | `#EAA62B` / `#E79A24` | CTA gradient/hover |
| Amber ink | `#B08A30` | Eyebrow labels on light |
| Coral | `#E2553A` | Rare highlight (reserved; used sparingly) |
| Sage | `#7FA890` | Muted text/labels on dark |
| Green (success) | `#3FA66A` | "online" dot, picked/confirmed states |
| Muted text (light) | `#6E756B` / `#7C8579` / `#8A9384` | Body/secondary on cream |
| Muted text (dark) | `#9FB0A2` / `#C9D4CB` | Body/secondary on forest |
| Border (light) | `#EDE4D2` / `#EFE7D6` / `#E0D6C1` | Card borders on cream |
| Border (dark) | `rgba(247,243,234,.08–.18)` | Card/nav borders on forest |
| Cream text on dark | `#F7F3EA` | Headings/labels on forest |

Amber focus ring: `outline: 3px solid rgba(244,180,60,.55); outline-offset: 2px;`

### Typography (Google Fonts)
- **Display / headings / wordmark** — `Bricolage Grotesque`, weight **800**, tight tracking
  `letter-spacing: -0.02em to -0.035em`. (weights 400–800 loaded)
- **Body / UI** — `Hanken Grotesk`, weights 400/500/600/700/800.
- **Eyebrows / labels / mono** — `Space Mono`, weight 700, UPPERCASE, `letter-spacing: .14–.2em`.

Import:
```
https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Hanken+Grotesk:wght@400;500;600;700;800&family=Space+Mono:wght@400;700&display=swap
```
Fallbacks: display → system serif-free sans; body → system-ui, sans-serif.

**Type scale (exact, uses CSS `clamp()` for fluid responsiveness):**
| Role | Size | Family / weight | Tracking / leading |
|---|---|---|---|
| H1 hero | `clamp(40px,6.2vw,74px)` | Bricolage 800 | `-.035em` / `0.98` |
| H2 section | `clamp(30px,4.4vw,52px)` | Bricolage 800 | `-.03em` / `1.03` |
| H3 feature | `clamp(24px,3vw,34px)` | Bricolage 800 | `-.02em` / `1.08` |
| Card title | `16px` (`15.5px` shop) | Bricolage 800 | `-.015em` |
| Big number/price | `44–60px` | Bricolage 800 | `-.03em` |
| Lead paragraph | `clamp(16px,1.7vw,20px)` | Hanken 400 | `1.55` |
| Body | `15–16px` | Hanken 400 | `1.5–1.6` |
| Small / card body | `13.5px` | Hanken 400 | `1.5` |
| Eyebrow | `10.5–11px` | Space Mono 700 | `.16–.2em`, UPPERCASE |
| Nav link | `13.5px` | Hanken 600 | — |

### Spacing / layout
- Content container: `max-width: 1240px` (nav/hero/proof) or `1080–1180px` (most sections),
  `margin: 0 auto`, horizontal padding `clamp(18px,4vw,48px)`.
- Section vertical padding: `clamp(72px,10vw,128px)` (light content sections),
  `clamp(72px,10vw,120px)` (dark).
- Grid/flex gaps: cards `16–18px`; feature rows `clamp(28px,4vw,64px)`; hero columns `clamp(36px,5vw,72px)`.
- **Responsiveness uses no media queries** — fluid `clamp()` + `flex-wrap` + `grid auto-fit/auto-fill minmax()`.
  Reproduce with the same technique OR the codebase's breakpoints; behavior must match: columns
  collapse to a single stack below ~640px, card grids reflow from 3→2→1.

### Radii
Cards `20–24px` · large CTA panel `32px` · buttons `10–13px` · inputs `12px` ·
pills / chips `999px` · phone frame outer `44px`, screen `35px` · icon tiles `12–18px`.

### Shadows
- Card rest: `0 1px 3px rgba(20,30,25,.04)` (+ light border).
- Card hover lift: `translateY(-4px)`, `0 24px 46px -24px rgba(20,30,25,.3)`.
- Elevated light card: `0 30px 56px -28px rgba(20,30,25,.22)`.
- Dark card: `0 30px 56px -28px rgba(13,29,22,.5)`.
- Amber CTA: `0 14px 30px -12px rgba(244,180,60,.65)`; hover `0 18px 36px -12px rgba(244,180,60,.8)`.
- Phone: `0 40px 80px -34px rgba(13,29,22,.75)` + `0 0 0 1px rgba(244,180,60,.08)`.

### Motion
- Standard transitions: **150–250ms ease-out** on hover/press (color, background, transform, box-shadow).
- Scroll-reveal: opacity 0→1 + `translateY(26px)→0`, **700ms** `cubic-bezier(.2,.7,.2,1)`, staggered
  via per-element delay (`data-delay` 40/60/70/80/90/120/130/140/160/180/200/210/260 ms).
- Count-up: **1400ms**, cubic ease-out (`1 - (1-t)^3`).
- Concierge chat: typing dots, word-by-word streaming (~55ms/word), message-in
  `translateY(12px)→0` 340ms, dish tiles stagger 300ms, cart pop scale.
- Ambient: hero aurora blobs `18s`/`22s` drift; amber glow pulse `6s`; mark float `5s`; success dot pulse.
- **All motion gated behind `prefers-reduced-motion: reduce`** — animations disabled, reveals shown
  immediately, counters snap to final value. Honor this.

---

## Screens / Views

> Single long-scroll page. "Views" below = sections in document order. See `screenshots/`.

### 1. Sticky Nav
- **Layout:** `position: sticky; top:0; z-index:50`. Full-width bar, translucent forest
  `rgba(15,36,27,.82)` + `backdrop-filter: saturate(140%) blur(14px)`, bottom border
  `rgba(247,243,234,.08)`. Inner: `max-width:1240px`, flex row, `padding:13px clamp(18px,4vw,48px)`.
- **Left:** P2E mark (glow variant, 30px) + wordmark "Prompt**2**Eat" (Bricolage 800, 21px, `-.035em`,
  cream `#F7F3EA`, the "2" amber). Links to `#top`.
- **Center:** links (Hanken 600 13.5px, `#C9D4CB`): Concierge, For Restaurants, Shop, Pricing →
  anchors `#concierge #restaurants #shop #pricing`. Hover: color `#F7F3EA`, bg `rgba(247,243,234,.07)`,
  radius 9px. `flex-wrap` so they wrap on narrow screens.
- **Right:** "Sign in" ghost (cream text, hover bg `rgba(247,243,234,.08)`) + "Start free" amber
  button (`#16241C` on `#F4B43C`, radius 11px, amber shadow, hover `translateY(-2px)`).

### 2. Hero  (`#top`)
- **Background:** radial gradient `120% 90% at 78% -8%` through
  `#1D4636 → #143228 → #0F281E → #0C1C15`. Two blurred radial "aurora" blobs (amber `.20`,
  sage `.16`) animating `p2e-aurora`. Faint dot grid overlay: `radial-gradient(rgba(247,243,234,.05) 1px, transparent 1px)`, `26px` tile, `.5` opacity.
- **Layout:** `max-width:1240px`, flex-wrap, `gap:clamp(36px,5vw,72px)`, vertical padding
  `clamp(48px,7vw,88px)` top / `clamp(60px,7vw,96px)` bottom.
  - **Left column** `flex:1 1 420px`:
    - Eyebrow pill: green pulse dot + "AI CONCIERGE · NOW LIVE" (Space Mono 700 10.5px amber),
      bg `rgba(247,243,234,.06)`, border `rgba(244,180,60,.28)`, pill.
    - **H1:** "Just say what / you're hungry for." (line break before "you're"). Cream.
    - Subhead (Hanken 400, `#B9C6BB`, max 520px): *"Prompt2Eat is the AI-native way to order.
      Scan the table, **talk** to the concierge — "something spicy under $20, no dairy" — and it
      recommends, customizes, and places your order. No app to download."* ("talk" = cream 600 weight, not italic).
    - CTAs: **"Start free →"** (amber, `padding:15px 26px`, radius 12px) + **"See it order for you"**
      (ghost, `rgba(247,243,234,.06)`, border `.18`). Both anchor `#concierge`.
    - "ORDER WITH" mono label + Gemini chip (conic-gradient dot) + " Pay / G Pay / PayTo" text
      *(TODO-LOGO: replace with real Gemini + Apple/Google Pay + PayTo marks)*.
  - **Right column** `flex:1 1 380px`: the **Concierge Demo** component (see below).

### 3. Trust Strip
- Full-width `#0C1C15`, `padding:22px`. Centered flex-wrap row.
- Mono label "WORKS EVERYWHERE YOU ALREADY ARE" (`#5F7568`) + four chips (pill, bg
  `rgba(247,243,234,.05)`, border `.1`, Hanken 600 13px `#C9D4CB`): "Order from Google Gemini"
  (conic-gradient dot), "Apple Pay & Google Pay", "PayTo · pay by bank", and **"No app needed"**
  (amber-filled, ink text). *TODO-LOGO on the payment marks.*

### 4. Concierge Deep-Dive  (`#concierge`)
- Section bg `linear-gradient(180deg,#FFFDF8,#FBF6EC)`. Centered header: eyebrow "THE CONCIERGE"
  (`#B08A30`), H2 **"Ordering, reinvented by AI."**, lead sub.
- **4 alternating feature rows**, each a `grid auto-fit minmax(300px,1fr)`, `align-items:center`.
  Text block = eyebrow + H3 + body (`#6E756B`, max 440px); visual block = a live mini-mock.
  Alternate visual left/right on desktop via `order:1/2`.
  1. **Natural-language ordering** — H3 "Just say what you're hungry for." + 3 pills (Dairy-free
     aware `#e7f4ea`/`#2f7a4f`, Budget-smart `#fbf0d8`/`#b07f1e`, Allergen-safe `#eef0ea`/`#5d655b`).
     Visual: white card with an amber diner bubble + cream reply bubble.
  2. **Order via Google Gemini** — H3 "Order from the assistant you already use." Visual: forest
     card, Gemini pill (conic dot), a user-request bubble + amber "✓ Placed" confirmation bubble.
  3. **QR dine-in** — H3 "Scan the table. Order & pay from your seat." Visual: white card with a
     **CSS-built QR** (5×5 grid of amber/cream `span`s in an ink tile), "Table 12 / SCAN TO ORDER".
  4. **Reorder & upsell** — H3 ""Your usual," one tap away." Visual: white card, a "Your usual"
     reorder row (amber Reorder button) + a dashed "SMART UPSELL — Add miso soup? +$4" row.

### 5. How It Works
- Bg `#16241C`, faint amber radial top-center. Centered header eyebrow "HOW IT WORKS" (amber),
  H2 **"Scan. Chat. Eat."** (cream).
- 3 centered cards (`grid auto-fit minmax(240px,1fr)`): numbered tile (64px, radius 18px,
  `rgba(247,243,234,.06)`, amber numeral) + H3 (cream) + body (`#9FB0A2`, max 280px).
  1 **Scan the table** · 2 **Chat your craving** · 3 **Pay & eat**.

### 6. For Restaurants  (`#restaurants`)
- Bg `linear-gradient(180deg,#FBF6EC,#FFFDF8)`. Left-aligned header: eyebrow "FOR RESTAURANTS",
  H2 **"One platform to run the whole venue."**, lead sub.
- **Bento grid** `grid auto-fill minmax(250px,1fr)`, gap 16px. 9 cards. Each: 42px icon tile
  (radius 12px, `#F6EAD0` bg) with a **simple line-icon SVG** (amber `#F4B43C` + `#B08A30` strokes) +
  card title (Bricolage 800 16px) + one-line benefit (`#7C8579` 13.5px). Hover lift.
  Cards: **AI menu import · AI descriptions & tags · Kitchen orders board · Tables & QR codes ·
  Design Studio · Food-cost & inventory · Reports & customers · Native iOS & Android · Square +
  Stripe + PayTo** (last card is a forest-gradient "spotlight" variant with cream text).
  *Feel free to add the remaining owner features from the brief (media library, discount codes,
  invoice scan, low-stock nudges) as additional cards — kept to 9 here to avoid clutter.*

### 7. Hardware Shop  (`#shop`)
- Bg `#FFFDF8`. Header row (flex, space-between): eyebrow "THE SHOP", H2 **"Everything your venue
  needs."**, lead sub + a "Browse all →" outline button.
- **Shop component** (see below): category filter pills + product grid.

### 8. Social Proof
- Bg `linear-gradient(180deg,#0F281E,#0C1C15)`, faint amber radial.
- **Metrics row** `grid auto-fit minmax(150px,1fr)`, centered. 4 animated counters (Bricolage 800
  `clamp(38px,5vw,60px)`; first amber, rest cream) + label (`#9FB0A2`). Values *(TODO-METRIC)*:
  **2.4M** orders placed · **12k+** venues onboard · **38%** avg. check uplift · **4.9** diner rating.
  Count-up on scroll (`data-count`, `data-suffix`, `data-decimals`).
- **Testimonials** `grid auto-fit minmax(280px,1fr)`, 3 cards (bg `rgba(247,243,234,.05)`, border
  `.1`, radius 22px): amber `"` mark + quote (`#E4EBE4` 16px) + avatar tile + name/venue
  (`#7FA890`). *TODO-TESTIMONIAL: replace quotes, names, avatars.*

### 9. Pricing  (`#pricing`)
- Bg `linear-gradient(180deg,#FFFDF8,#FBF6EC)`. Centered header eyebrow "PRICING",
  H2 **"Free for 30 days. No card."**
- 3 tier cards `grid auto-fit minmax(260px,1fr)`, `align-items:stretch`, flex-column so CTAs bottom-align:
  - **Starter** — `$0`/mo to start · outline CTA "Start free".
  - **Growth** (featured) — forest-gradient card, amber border, "MOST POPULAR" tab, `$89`/mo (amber),
    amber CTA "Start free trial".
  - **Pro** — `Custom` · outline CTA "Talk to sales".
  - Below: "See full pricing →" link.

### 10. Final CTA  (`#cta`)
- Full-bleed padded; inner rounded panel (radius 32px) with amber radial
  `120% 140% at 85% 0%` `#F6C258 → #F4B43C → #E79A24`, dark radial accent bottom-left.
  H2 **"Start free — your menu's live in minutes."** (ink) + sub + **email capture form**
  (email input, radius 12px + ink "Start free →" button). Microcopy: "30-day trial · no credit card
  · cancel anytime". Form `preventDefault` (wire to real signup).

### 11. Footer
- Bg `#0C1C15`. `grid auto-fit minmax(140px,1fr)`. Brand block (mark + wordmark + tagline + App
  Store / Play badge placeholders *TODO-LOGO*) spanning full first row, then columns **Product /
  Restaurants / Shop / Company** (Space Mono labels `#5F7568`, Hanken 500 links `#C9D4CB`).
  Bottom bar: "© 2026 Prompt2Eat. All rights reserved." + social links (X / Instagram / LinkedIn).

---

## Components (reusable)

### P2E Mark (logo symbol) — `code/P2EMark.dc.html`
A 72×72 SVG "spark leaf": a forest/amber leaf body with a 4-point spark ("AI" motif). Props:
`variant` (amber | forest | cream | **glow** — glow adds `drop-shadow(0 0 16px rgba(244,180,60,.55))`),
`aimark` (spark4 | twin | burst | orbit | wave | dots | node | rings — different spark glyphs),
`size` (px). Used at 30px in nav/footer and 38px in the demo header. Recreate as an SVG component
with the same variant color maps (see file: amber body `#F4B43C`, forest `#143228`, cream `#F7F3EA`).

### Concierge Demo (hero centerpiece) — `code/ConciergeDemo.dc.html`
Auto-playing, re-runnable chat inside a phone frame. **This is the delight moment — build it faithfully.**
- **Phone frame:** ink `#0C1C15` bezel, radius 44px outer / 35px screen, `aspect-ratio:9/18.6`,
  max-width 388px, centered.
- **Header:** forest gradient, amber glow blob, "9:41" status, P2E mark (glow, 38px, floating),
  "Maple & Thyme", green pulse dot + "AI Concierge · online", amber "TABLE 12" pill.
- **Message flow (scripted timeline):**
  1. Diner bubble (right, amber gradient, radius `16 16 5 16`) with the prompt text.
  2. After ~500ms: typing dots (3 dots, `cd-think` bounce) for ~900ms.
  3. Concierge reply streams **word by word** (~55ms/word) into a white bubble (radius `16 16 16 5`)
     with a blinking amber caret while streaming.
  4. 3 **dish tiles** reveal, staggered 300ms — each: 52px gradient thumb ("DISH" label), name
     (Bricolage 800 13px), tag (grey), price (Bricolage 800 14px). Tiles are tappable.
  5. First dish auto-selects (~650ms later): green border `#3FA66A`, green tint bg, "✓ PICKED".
  6. Follow-up question bubble + two chips: an amber "Yes, extra chilli" and a "No thanks".
  7. On "Yes" (auto or click): chip turns green, then a **cart bar** slides up (forest gradient,
     amber "1" badge with pop, "View order", live total).
- **"Try it" chips** below the phone (3 canned prompts) — clicking re-runs the whole timeline with
  that script. Active chip = amber. Scripts live in a `SCRIPTS` array in the component (label, prompt,
  reply, question, yes-label, 3 dishes each with name/tag/price/gradient). Prompts:
  "Warming & veg, ~$18" · "Spicy, no dairy, <$20" · "Light & high-protein".
- **State:** `p` (active script), `thinking`, `replyText`, `caret`, `dishesShown`, `selected`,
  `showQuestion`, `answered`, `showCart`. Timeline via `setTimeout` chain; clear on re-run/unmount.
  Auto-scroll the message list to bottom on each step. Honor `prefers-reduced-motion` (snap, no stream).

### Hardware Shop — `code/HardwareShop.dc.html`
- **Category filter pills** row: `['All','QR & Signage','Stands','Hardware','Packaging','Consumables']`.
  Active = amber fill/ink; inactive = cream fill, border `#E0D6C1`, `#4A5248` text. Click sets category.
- **Product grid** `grid auto-fill minmax(230px,1fr)`, gap 18px. Card: `#FFFDF8`, border `#EDE4D2`,
  radius 22px, hover lift. Image = `aspect-ratio:4/3` gradient tile with a "PRODUCT SHOT" mono label
  and optional amber badge (BEST SELLER / NEW / STRIPE-READY / ECO). Body: category (mono `#A99A78`),
  name (Bricolage 800 15.5px), price (Bricolage 800 18px) + amber "＋ Add" button (hover `#EAA62B`).
- **⚠ LIVE PRODUCT FEED HOOK** — in the component the products come from a static `PRODUCTS` array
  marked `// === LIVE PRODUCT FEED — replace PRODUCTS with fetch() later ===`. To wire a real feed:
  fetch in `componentDidMount`/`useEffect`, set `products` state to objects
  `{name, price, category, imageUrl, badge}`, and render `img: url(${imageUrl}) center/cover` instead
  of the gradient placeholder. Filtering/rendering logic (`renderProducts()`) is unchanged.

---

## Interactions & Behavior
- **Nav anchors** smooth-scroll to sections (`html { scroll-behavior: smooth }`, disabled under reduced-motion).
- **Hover:** buttons lift/darken; cards lift `-4px` + deepen shadow; nav links tint. All 150–250ms ease-out.
- **Scroll reveal:** `IntersectionObserver` (threshold .12, rootMargin `0 0 -7% 0`) on every
  `[data-reveal]` element — applies hidden state via JS (progressive enhancement: no-JS shows content),
  then fades/slides in with per-element `data-delay` stagger; unobserve after firing.
- **Count-up:** `IntersectionObserver` (threshold .6) on `[data-count]` — `requestAnimationFrame`
  ease-out over 1400ms, formatted with `data-decimals`/`data-suffix`/`data-prefix`; reduced-motion snaps.
- **Concierge demo:** auto-plays on mount; re-runs on "Try it" chip or dish tap; see component above.
- **Final CTA form:** currently `preventDefault` — wire email to your signup endpoint.
- **Focus:** visible amber focus ring on all interactive elements (`:focus-visible`).

## State Management
- **Landing (page shell):** effectively stateless — only mount-time `IntersectionObserver` setup for
  reveals + counters. It intentionally never re-renders (so imperative reveal styles persist).
- **ConciergeDemo:** local state machine (fields listed above) driven by a `setTimeout` timeline.
- **HardwareShop:** `{ cat }` filter selection; later `{ products }` from fetch.
- No global store or routing needed for a single page. Data-fetch requirement: the product feed only.

## Assets
- **Fonts:** Bricolage Grotesque, Hanken Grotesk, Space Mono (Google Fonts — link above).
- **Logo:** P2E mark is pure SVG (`code/P2EMark.dc.html`) — no bitmap asset.
- **All imagery is placeholder** (CSS `repeating-linear-gradient` tiles + mono labels). Replace:
  - `TODO-SCREENSHOT` — dish thumbnails, product shots, testimonial avatars.
  - `TODO-LOGO` — Google Gemini, Apple Pay, Google Pay, PayTo marks; App Store / Google Play badges.
  - `TODO-METRIC` — the 4 social-proof figures.
  - `TODO-TESTIMONIAL` — the 3 quotes + names + venues.
- **No external network calls** beyond Google Fonts. The CSS-built QR and conic-gradient brand dots
  are decorative stand-ins.

## Files
- `code/Prompt2Eat-Landing.dc.html` — the full page (all sections, reveal/counter JS). **Start here.**
- `code/ConciergeDemo.dc.html` — hero chat component + `SCRIPTS` data.
- `code/HardwareShop.dc.html` — product grid + filters + **LIVE PRODUCT FEED hook**.
- `code/P2EMark.dc.html` — logo symbol SVG + variants.
- `code/support.js` — the in-house runtime (**reference only — do not ship**).
- `screenshots/01–08` — rendered sections for visual reference.

> Sibling bundle `design_handoff_prompt2eat/` (if included) holds the full design system —
> `tokens.css`, `tailwind.theme.js`, and all product screens. Reuse those tokens directly.
