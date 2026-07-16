# Design Brief — Prompt2Eat (order-tool)

**For:** Claude (design mode) working directly in this repository.
**Repo:** `github.com/zenulbashar/order-tool` (public — you can read every file here).
**Goal:** Extend the existing Prompt2Eat design across **every screen and every
breakpoint** — mobile, tablet, laptop, desktop, and the native app shell —
keeping the current design language, adding motion, and producing a per-tile
screenshot for every block so the work can be committed to GitHub.

> This is a **brief**, not a spec you invent from scratch. A complete, high-fidelity
> design system and screen catalog already exist in this repo. Your job is to **read
> them, honour them, and extend them** to full responsive coverage with animation —
> never to restyle from zero.

---

## 0. TL;DR — what to deliver

1. **Read the sources in §2 first.** The design system is already defined; do not
   re-derive tokens, colours, or type.
2. For **every surface in §4**, produce the design at **four responsive widths + the
   native shell** (§5): mobile 390, tablet 768, laptop 1280, desktop 1536, and the
   Capacitor WebView.
3. **Extend, don't replace.** New screens must reuse the existing primitives
   (`app/_components/*`) and tokens (`app/globals.css`). Every functional accent goes
   through `--action` (the owner↔diner firewall); amber (`--color-accent`) is **AI-only**.
4. **Animate.** Apply the existing `p2e-*` motion library (§6) to every interactive
   and state transition. Add new keyframes only when an affordance isn't covered, in
   the same file, reduced-motion-guarded.
5. **Screenshot every tile of every block** (§7) into `design/design_handoff_prompt2eat/blocks/<board>/`
   using the existing `NN-name-theme.png` naming convention, light **and** dark where the
   board has both.
6. **Commit + push** to the working branch with the screenshots and any design-comp
   or component changes (§8).

---

## 1. Product in one paragraph

**Prompt2Eat** is AI-assisted, branded online ordering for hospitality venues.
It is **multi-tenant — a venue is the tenant**. There are two primary personas and
three secondary surfaces:

- **Owner** — a restaurant operator managing menu, orders, stock, storefront branding,
  payments, and integrations from a dashboard (also shipped as a native iOS/Android app).
- **Diner** — a guest browsing a venue's branded storefront, using an AI **Concierge**
  to build an order, and paying via Stripe (card + PayTo pay-by-bank).
- **Platform Admin** — Zale-it operators running the back-office console (dark "ops" theme).
- **Supplies Marketplace / Shop** — owners order restaurant supplies on invoice-later terms.
- **Onboarding + Marketing** — the wizard that stands a venue up, and the public landing page.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 ·
Drizzle ORM + Neon Postgres · Auth.js v5 (magic-link) · Stripe Connect · Anthropic
(Opus menu-import / Haiku concierge) · Cloudflare R2 · Upstash rate-limit · Capacitor
(native owner shell).

---

## 2. Read these first (the design sources of truth)

Do not start designing until you've read these. They already contain the exact
tokens, states, and screen catalog.

| Path | What it is |
|---|---|
| `design/design_handoff_prompt2eat/README.md` | **Full design spec** — tokens, type, colour, radius, shadow, motion, per-screen catalog. The token source of truth. |
| `design/design_handoff_prompt2eat/CLAUDE.md` | Implementation guide + reference Button/Input/Card. |
| `design/design_handoff_prompt2eat/tokens.css` | Paste-ready CSS custom properties + keyframes. |
| `design/design_handoff_prompt2eat/tailwind.theme.js` | Paste-ready Tailwind `theme.extend`. |
| `design/design_handoff_prompt2eat/*.dc.html` | Interactive design comps (Identity, Components, Owner, Diner, Studio, Shop, Admin, Refresh, Roadmap + shared Sidebar/Mark/AdminBar). Open in a browser via `support.js`. **These are references, not shippable code.** |
| `design/design_handoff_prompt2eat/blocks/**` | ~108 per-tile PNGs already captured — the style bar your new screenshots must match. |
| `app/globals.css` | The **live** token layer + the full `p2e-*` animation library actually shipping in the app. |
| `app/_components/*` | The **live** primitive kit you must reuse (button, card, input, select, textarea, field, segmented, selection-controls, spinner, status-badge, stepper, thinking-dots, toast, page-header). |
| `README.md` · `PLAN.md` | Product/feature ground truth — what each surface does and why. |
| `mobile/README.md` · `mobile/capacitor.config.ts` | The native app shell (what "app" means here). |

**Precedence when they disagree:** `app/globals.css` + `app/_components/*` (the live
code) win over the `.dc.html` comps, which win over prose. The comps use inline styles
on an absolutely-positioned canvas — treat their **values** as truth and their
**layout** as illustrative; implement real responsive flow.

---

## 3. Design language (quick reference — full detail in the sources above)

- **Palette:** deep forest-green ink `#16241C` + warm cream surfaces
  (`#F7F3EA` page / `#FFFDF8` elevated) + a single **amber** accent `#F4B43C`;
  destructive is warm coral `#E2553A`. Success `#3FA66A`.
- **Type:** **Bricolage Grotesque** (display/headings/wordmark, tight tracking
  −0.02…−0.035em) · **Hanken Grotesk** (body/UI, default) · **Space Mono** (uppercase
  eyebrows/micro-labels/data, wide tracking 0.1–0.2em). Fonts wired in `app/layout.tsx`
  via `next/font` → `--font-display/-body/-mono`.
- **Radius:** buttons 9/11/13px (sm/md/lg) · inputs 12px · cards 16px (`--radius-card`;
  the comps show 22px — follow the live `--radius-card`) · pills 999px.
- **Shadow:** `--shadow-card`, `--shadow-lift` (hover), `--shadow-cta` (amber CTA),
  `--shadow-toast`. Focus = amber ring `--focus-ring` (danger + input variants exist).
- **The `--action` firewall (critical):** shared components reference `var(--action)` for
  every functional accent. Owner/product surfaces resolve it to **forest**; the diner
  storefront resolves it to the **per-venue `--brand`** on `[data-domain="diner"]`.
  **Amber is reserved for AI affordances only** and must never read `--action`.
- **Themed surfaces:** the **Admin** console recolours everything to a dark ops theme via
  the `.admin-dark` wrapper; the diner **Concierge** panel and the account "YOUR USUAL"
  hero are the two forest-dark diner surfaces (see the `--color-concierge-*` tokens).
- **Icons/assets:** no raster icon set — Unicode glyphs (`→ ＋ ✦ ✕`) and CSS shapes in
  the comps; the app uses inline SVG. Keep icons lightweight and monochrome-tintable.

---

## 4. Surface & feature inventory (design every one of these)

The app has **56 routes**. Group them by persona. For each surface, design the full
responsive set (§5) and animate the interactions (§6).

### 4A. Diner storefront — `/[slug]` (per-venue, `data-domain="diner"`, brand-tinted)
- **Storefront home** — branded hero, announcement bar, category tiles, recommendation
  rows, live menu search, sticky cart rail (desktop) / cart bar (mobile).
- **Menu** — full category-navigated menu with dietary filters.
- **Item selection & modifier sheet** — modifier groups with min/max; renders as a
  **bottom sheet on mobile** (`items-end`, `rounded-t-card`, `max-h-[90dvh]`) and a
  centered modal on `sm+`.
- **Concierge** (AI) — forest-dark conversation panel; "reading the menu" thinking state,
  proposed-item cards, multi-item picker, "found N matches" status. Amber AI affordances.
- **Cart review → Checkout** — Stripe Payment Element (card + **PayTo** pay-by-bank),
  discount codes, gift cards, schedule picker (ASAP / scheduled).
- **Order status** — `/[slug]/order/[token]` opaque-token order tracking with a
  live payment-status poller (card = fast; bank/PayTo = slow out-of-band approval screen).
- **Account** — overview + points/"your usual" hero, order history, details form,
  notification prefs, saved payment mandate (one-tap returning checkout), per-venue sign-in.

### 4B. Owner dashboard — `/dashboard` (forest sidebar chrome; `--action` = forest)
Two-level nav (see `app/dashboard/sidebar.tsx`): collapsible categories, 76px rail-collapse
on desktop, hamburger drawer on mobile, venue switcher, live order-count badge.
- **Home** — overview.
- **Menu & photos** — Menu editor (compact item editor, has-sizes/variants, modifier
  options, menu-health panel) · **Import menu from photo** (AI/Opus) · **Write
  descriptions** (AI, single + bulk) · Photo library (R2 upload) · **Design studio**
  (print & promo generator — menu mode + banner mode + AI generate).
- **Orders & customers** — **Live orders / kitchen board** (auto-refresh, elapsed timers,
  status controls, printable ticket + drawer, kitchen sound) · Tables & QR codes (per-table
  QR) · Sales reports · Customers.
- **Stock & supplies** — Ingredients library (inline add/edit) · Stock overview (levels,
  low-stock flags) · Reorder suggestions (AI inbox) · **Scan invoice** (AI vision import →
  review gate) · Shop supplies (marketplace).
- **Storefront setup** — Brand & colours (theme form) · Logo · Photos & hero · Announcement
  bar · Social links · About & description · Opening hours & location · Tax (GST) · Order
  notifications.
- **Payments & billing** — Payments & payouts (Stripe Connect) · Discount codes · Gift
  cards · Plan & billing (data-driven tiers, consolidated subscription).
- **Connections** — Integrations hub (connector cards with every state + detail drawer;
  Square connector) · Apps (Zale suite launcher / SSO handoff).
- Persistent **support widget** (AI support chat).

### 4C. Onboarding wizard — `/onboarding`
Progress-stepped flow: **Details → Service style → Menu (AI import) → Plan → You're live**
(copy-link success). Own minimal chrome; `wizard-progress` stepper.

### 4D. Auth & marketing
- **Sign-in** `/signin` + **check-inbox** (magic-link sent state).
- **Landing** `/` — marketing hero, concierge demo, shop teaser, scroll-reveal animations.

### 4E. Platform Admin console — `/admin` (`.admin-dark` ops theme, minimal top-bar chrome)
Directory (venues) · Stats · Promotions · Venue detail (plan/discount) · Marketplace admin ·
Shop admin · Support.

### 4F. Supplies Marketplace / Shop
- Public **`/shop`** teaser grid + owner **`/dashboard/marketplace`** catalog browse,
  invoice-later cart, and **Your Orders** (requested → confirmed → shipped).

### 4G. Native owner app (Capacitor)
`mobile/` — a native iOS/Android shell that loads the **hosted dashboard** in a WebView
(forest chrome `#0f241b`, splash, status bar, push). Design the **loading/splash** and any
native-only affordances (push-permission prompt, order-ready notification) and ensure every
dashboard screen is **touch-first and safe-area-aware** inside the WebView.

---

## 5. Responsive matrix — design each surface at all of these

The app already leans hard on Tailwind breakpoints (`lg:` heavily, then `sm:`), uses
`dvh`, `env(safe-area-inset-*)`, and mobile bottom-sheets. Match those conventions.

| Target | Width to design at | Notes |
|---|---|---|
| **Mobile** | 390px (also check 360) | Single column; bottom-sheets for modals; sticky cart **bar**; sidebar → hamburger drawer; sticky bottom CTAs; `env(safe-area-inset-*)` padding. |
| **Tablet** | 768px | 2-col grids; sidebar may stay drawer or show compact; cart transitions toward rail. |
| **Laptop** | 1280px | Full sidebar/rail; sticky cart **rail** on the storefront; multi-column dashboards. |
| **Desktop** | 1536px | Max-width content columns (don't let line-lengths sprawl); denser data tables; kitchen board multi-column. |
| **Native app (WebView)** | 390 × device | Same as mobile **plus**: no browser chrome, forest status bar, splash handoff, `viewport-fit=cover`, `maximum-scale=1`. Touch targets ≥44px. |

**Breakpoint behaviours to preserve/extend:**
- **Sidebar** — desktop persistent rail (collapsible to 76px, choice remembered per device);
  mobile hamburger drawer.
- **Cart** — storefront cart is a **rail** on `lg+`, a sticky **bar + sheet** on mobile.
- **Modals** — item modifier / pickers are **bottom sheets** on mobile, centered modals on `sm+`.
- **Kitchen board** — column count scales with width; cards stay legible at arm's length.
- **Data tables** — collapse to stacked cards on mobile; never horizontal-scroll critical actions.

---

## 6. Motion — the animation requirement

Motion is **not optional** here. `app/globals.css` ships a full, reduced-motion-guarded
`p2e-*` keyframe library. **Apply it everywhere it fits, and extend it where a needed
affordance is missing** (add new keyframes in the same file, grouped by affordance, with a
`@media (prefers-reduced-motion: reduce)` hold).

Existing keyframes (use these — many are defined but not yet wired to screens):

| Affordance | Classes |
|---|---|
| **AI / concierge** | `p2e-spark`, `p2e-glow`, `p2e-think`, `p2e-aurora`, `p2e-drift`, `p2e-float`, `p2e-bob`, `p2e-blink` (cursor), `p2e-scan` (invoice/menu vision) |
| **Loading** | `p2e-shimmer` (skeleton), `p2e-spin` (.7s loaders), `p2e-progress`, `order-loading-dot` |
| **Success / cart** | `p2e-pop` (badge), `p2e-fly` (add-to-cart arc), `p2e-cartpulse`, `p2e-checkloop`, `p2e-draw`, `p2e-ring` (amber pulse) |
| **Entrance** | `p2e-slidein`, `p2e-rise`, `p2e-count` (numbers), `p2e-toastin` (toasts from right) |

**Motion rules:** transitions short (~150–250ms) ease-out; hover buttons lift
`translateY(-1px)` + shadow; loaders spin `.7s linear`; **every animation must be held
steady under `prefers-reduced-motion: reduce`** (follow the existing pattern — never leave a
new keyframe unguarded). Reserve amber-glow/spark motion for **AI** moments only.

Priority motion moments to design: add-to-cart fly + cart pulse; concierge thinking →
answer reveal; order-status live transitions; kitchen new-order arrival (pulse + optional
sound); skeleton→content on every data screen; toast queue; onboarding step advance; landing
scroll-reveal.

---

## 7. Screenshot deliverable — one PNG per tile, per block

Every design must ship as **per-tile screenshots**, matching the existing convention so they
sit alongside the ~108 PNGs already in the repo.

- **Location:** `design/design_handoff_prompt2eat/blocks/<board>/`
  where `<board>` ∈ `identity · components · owner · diner · shop · studio · admin · refresh · roadmap`
  (add a new board folder only if a surface genuinely fits none).
- **Naming:** `NN-kebab-name-theme.png` — zero-padded order, kebab description, and `-light`
  / `-dark` suffix on boards that have both themes (e.g. `admin-stats-dark.png`,
  `diner-saved-mandate-light.png`, `05-orders-live-kitchen.png`).
- **One file per card/tile**, cropped to that tile — **not** one big board screenshot. (Keep
  the full-board captures in `screenshots/` if you produce them, but the per-tile crops in
  `blocks/` are the deliverable.)
- **Themes:** capture **light and dark** for any surface that has both (owner, admin, shop,
  studio, refresh all do). Diner is brand-tinted — capture at least the default brand.
- **Responsive proof:** for each new/changed surface also capture a **mobile** crop
  (suffix `-mobile`, e.g. `shop-mobile-cart-dark.png`, matching the existing shop examples).

**How to capture (repeatable):** Chromium + Playwright are available in this environment
(`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers/chromium`, do **not** run `playwright install`).
Open the relevant `*.dc.html` comp (or the running app screen), set the viewport to the target
width, and screenshot each panel by its `{turn}{letter}` id badge / bounding box. Save into the
`blocks/<board>/` path above. Keep captures at native 1:1 (DPR ≥2 for crispness).

---

## 8. Working agreement — extend, verify, commit

1. **Branch:** commit to the current working branch (`claude/design-repo-brief-7nexso`),
   not `main`.
2. **Extend, never fork the system:** reuse `app/_components/*` and the `app/globals.css`
   tokens. If you must add a token, add it to the `@theme` layer with an intent name (never a
   raw hex in a component) and a one-line comment, exactly like the existing entries.
3. **Respect the invariants** (`PLAN.md` §"Non-negotiable invariants"): the diner order money
   path is byte-for-byte frozen — **design only, do not touch** `app/[slug]/checkout/actions.ts`
   or the Stripe webhook confirm logic. The owner↔diner identity firewall and the amber-for-AI
   rule are design law, not suggestions.
4. **Accessibility:** WCAG AA contrast on every pairing (the tokens are already tuned for this —
   don't regress); visible amber focus ring on all interactives; touch targets ≥44px; full
   reduced-motion coverage.
5. **Deliverables checklist per surface:** ☐ light ☐ dark (if applicable) ☐ mobile 390
   ☐ tablet 768 ☐ laptop 1280 ☐ desktop 1536 ☐ native-safe ☐ motion applied ☐ per-tile PNGs in
   `blocks/`.
6. **Commit:** stage the new/updated `blocks/**` PNGs, any updated `.dc.html` comps, and any
   `globals.css`/`_components` additions. Use a clear message
   (e.g. `design: responsive + motion pass for <surface>, per-tile blocks`) and **push** to the
   working branch. Do **not** open a PR unless explicitly asked.

---

## 9. Definition of done

- Every surface in §4 has a design at all §5 targets, using the §3 system and §6 motion.
- New work is built from the existing primitives and tokens — no parallel design system.
- `--action`/brand firewall and amber-for-AI-only rule hold on every screen.
- Motion is applied and fully reduced-motion-guarded.
- `design/design_handoff_prompt2eat/blocks/<board>/` contains a correctly-named PNG for **each
  tile of each block**, light + dark + mobile where applicable, committed and pushed.
