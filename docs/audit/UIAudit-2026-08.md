# Prompt2Eat — UI/UX Audit & Fix Handover

**Repo:** `zenulbashar/order-tool` @ `main`
**Date:** 2 August 2026
**Surfaces audited:** diner storefront (`app/[slug]`), owner dashboard (`app/dashboard`), marketing (`app/_landing`, `/learn`, `/shop`, `/for`), platform admin (`app/admin`), onboarding + sign-in
**Breakpoints reasoned about:** 360 / 390 / 430 (phone), 768 / 834 (tablet), 1024 / 1280 / 1440 / 1920 (desktop), plus the Capacitor WKWebView shell
**Method:** static read of the App Router tree, Tailwind v4 token layer (`app/globals.css`), and every shared primitive.

> This complements `docs/audit/Responsive.md`, which explicitly deferred device
> rendering ("requires a browser and is listed as a release gate, not verified
> here"). Everything below is a defect derivable from the source, not a guess.

---

## How to use this document

Work top-down. The **six root causes** in §1 are what actually generate most of
the individual defects — fixing them collapses ~15 findings into 6 patches. Then
work P0 → P1 → P2.

Severity:

| | Meaning |
|---|---|
| **P0** | Blocks or obscures a task a real user is trying to complete. Ship-blocking. |
| **P1** | Visibly broken, off-spec, or unusable at a common viewport. |
| **P2** | Consistency, polish, and design-system debt. |

---

## 1. Root causes

These six are the upstream source of most findings. Fix these first.

### RC-1 — There is no z-index scale

Twelve distinct z values are hand-picked across the app (`z-10`, `z-20`, `z-30`,
`z-40`, `z-50`, `z-[60]`, `z-[100]`), and **four different components sit on
`z-40` simultaneously**: the support FAB, the support panel, the diner concierge
FAB + panel, the sidebar drawer scrim, the integrations detail drawer, and two
mobile bottom action bars. When two things share a z value, DOM order decides —
and `<SupportWidget>` is rendered last in `app/dashboard/layout.tsx`, so it wins
every tie. **This is the direct cause of the reported support-icon overlap.**

### RC-2 — `env(safe-area-inset-*)` returns `0` everywhere

`app/layout.tsx` exports `viewport` with only `themeColor`. Without
`viewportFit: "cover"`, iOS Safari and WKWebView report **0px** for every safe
area inset. Two files already try to use them
(`dashboard/marketplace/shop-client.tsx:244`, `dashboard/studio/studio-client.tsx:661`)
— that code is currently dead. Combined with the Capacitor shell
(`mobile/capacitor.config.ts`, `ios.contentInset: "always"`), every fixed bottom
layer sits under the iOS home indicator in the native owner app.

### RC-3 — Fixed overlays reserve no space in the page

The diner storefront reserves `pb-24` for the mobile cart bar and then
`lg:pb-0` — but the desktop concierge FAB is also fixed. The dashboard `<main>`
reserves nothing at all while a persistent FAB floats over it. Any fixed layer
needs a matching scroll reserve.

### RC-4 — Form controls sit below both the iOS zoom floor and the touch floor

`controlClass()` in `app/_components/field.tsx` sets `text-sm` (14px) with
`py-2` → ~38px tall. iOS Safari **zooms the viewport on focus for any input
under 16px** and does not zoom back. Every text field in the product —
including the whole checkout — does this. `Segmented` (~30px) and the account
nav (~36px) are under the 44px target floor that `Button` correctly meets.

### RC-5 — Sticky offsets are five unrelated magic numbers

`cart-rail.tsx` `top-[136px]` / `max-h-[calc(100dvh-156px)]`, `storefront.tsx`
`scroll-mt-[124px]` and `lg:top-16`, sections `scroll-mt-32` (128px),
`category-nav.tsx` `rootMargin: "-120px"`. All five describe the same sticky
stack, none of them account for the `AnnouncementBar`, and none match the real
mobile strip height (~150–170px).

### RC-6 — The toast system was built and never mounted

`app/_components/toast.tsx` says so in its own docstring: *"Ships UNUSED —
nothing mounts `<ToastProvider>` yet."* Every owner save action across settings,
menu, stock, staff, stations and tables completes with **no visible
confirmation**.

---

## 2. P0 — ship-blocking

### P0-1 · Support FAB overlaps the mobile navigation drawer  ← the reported bug

**Where**
- `app/dashboard/support-widget.tsx:274` — FAB: `fixed bottom-6 right-6 z-40`
- `app/dashboard/sidebar.tsx:269` — drawer scrim: `fixed inset-0 z-40 bg-black/40 lg:hidden`
- `app/dashboard/layout.tsx` — `<Sidebar>` renders **before** `<SupportWidget>`

**Why it breaks.** Equal `z-40` + later in DOM = the FAB paints on top of the
scrim. Open the hamburger on a phone and the green "Support" pill floats over
the dimmed overlay, still tappable, and can open the support panel *underneath*
the nav drawer (`aside` is `z-50`).

**Fix.** Adopt the scale in §5, then:

```diff
// app/dashboard/support-widget.tsx  (launcher FAB)
-  className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-pill py-3 pl-4 pr-5 text-sm font-semibold text-white shadow-lift print:hidden"
+  className="fixed right-6 z-30 flex items-center gap-2 rounded-pill py-3 pl-4 pr-5 text-sm font-semibold text-white shadow-lift print:hidden"
+  style={fabStyle}

// …with, above the return:
+ const fabStyle: React.CSSProperties = {
+   background: "linear-gradient(110deg,#13301f,#1d4a35)",
+   bottom: "calc(1.5rem + env(safe-area-inset-bottom)"
+         + " + var(--p2e-bottom-bar-h, 0px))",
+ };
```

```diff
// app/dashboard/support-widget.tsx  (open panel wrapper)
-  className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center lg:items-end lg:justify-end lg:bg-black/15 lg:p-6 print:hidden"
+  className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center lg:items-end lg:justify-end lg:bg-black/15 lg:p-6 print:hidden"
```

```diff
// app/dashboard/sidebar.tsx  (scrim)
-  className="fixed inset-0 z-40 bg-black/40 lg:hidden"
+  className="fixed inset-0 z-50 bg-black/40 lg:hidden"
// (the <aside> stays z-[60] — see §5)
```

Belt-and-braces: also hide the FAB while the drawer is open. The sidebar already
owns `open` state; lift it, or expose it as a `data-nav-open` attribute on
`<body>` and add `[body[data-nav-open]_&]:hidden` to the FAB.

---

### P0-2 · Support FAB covers the mobile bottom action bars

**Where**
- `app/dashboard/marketplace/shop-client.tsx:244` — `fixed inset-x-0 bottom-0 z-40 … lg:hidden` (cart / checkout bar)
- `app/dashboard/studio/studio-client.tsx:661` — `fixed inset-x-0 bottom-0 z-40 … lg:hidden` (save / export bar)

**Why it breaks.** Same z, later DOM → the FAB sits directly on the right-hand
end of both bars, which is exactly where the primary action lives. On a 390px
phone the FAB (~150px wide) covers roughly 40% of the bar.

**Fix.** Introduce a page-level offset variable that any bottom bar sets, and
have the FAB respect it (the `bottom` calc in P0-1 already reads it):

```tsx
// in shop-client.tsx and studio-client.tsx, on the page root wrapper:
<div style={{ "--p2e-bottom-bar-h": "72px" } as React.CSSProperties}>
```

Set it only at the breakpoint the bar exists (`lg:` unsets it), or compute it
from a ref. 72px = 12px pad + 44px control + 12px pad + border.

---

### P0-3 · No bottom reserve on any dashboard page

**Where** `app/dashboard/layout.tsx` — `<main className="min-w-0 flex-1 overflow-y-auto">`

**Why it breaks.** The support FAB is ~46px tall at `bottom-6`, so ~70px of the
bottom-right of *every* dashboard page is permanently occluded — the last table
row, the last card in a grid, the footer of a long form.

**Fix.**

```diff
-      <main id="main-content" className="min-w-0 flex-1 overflow-y-auto">
+      <main
+        id="main-content"
+        className="min-w-0 flex-1 overflow-y-auto pb-24 lg:pb-20 print:pb-0"
+      >
```

Do the same on the diner storefront root, which currently drops its reserve at
`lg` while the concierge FAB stays fixed:

```diff
// app/[slug]/storefront.tsx
-        className="min-h-dvh bg-surface pb-24 lg:pb-0"
+        className="min-h-dvh bg-surface pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-24"
```

---

### P0-4 · Safe-area insets are dead — add `viewport-fit=cover`

**Where** `app/layout.tsx`

**Why it breaks.** Every fixed bottom layer (cart bar, both FABs, every bottom
sheet's CTA row, both mobile action bars) sits under the iOS home indicator and
under the Android gesture bar. In the Capacitor owner app this is worse:
`ios.contentInset: "always"` insets the *scroll view*, not fixed-position
elements.

**Fix — one line unlocks the rest:**

```diff
 export const viewport: Viewport = {
   themeColor: "#16241C",
+  viewportFit: "cover",
 };
```

Then apply insets to each fixed layer:

| File | Element | Add |
|---|---|---|
| `app/[slug]/cart-bar.tsx:20` | mobile cart bar | `pb-[calc(1rem+env(safe-area-inset-bottom))]` (replaces `pb-4`) |
| `app/[slug]/item-modifier-sheet.tsx` | CTA footer | `pb-[calc(1rem+env(safe-area-inset-bottom))]` |
| `app/[slug]/cart-review.tsx` | CTA footer | same |
| `app/[slug]/concierge/concierge-panel.tsx` | input footer | same |
| `app/[slug]/concierge/multi-item-picker.tsx` | CTA footer | same |
| `app/dashboard/support-widget.tsx` | input footer | same |
| `app/dashboard/orders/ticket-drawer.tsx` | action row | same |
| `app/_components/toast.tsx:88` | viewport | `top-[calc(1rem+env(safe-area-inset-top))]` |
| `app/dashboard/sidebar.tsx` | mobile header | `pt-[calc(0.75rem+env(safe-area-inset-top))]` |

---

### P0-5 · Every text input triggers iOS auto-zoom

**Where**
- `app/_components/field.tsx` → `controlClass()` — `text-sm` (14px). Used by `Input`, `Search`, `Select`, `Textarea` → **every form in the product**.
- `app/[slug]/menu-search.tsx:110` — `text-sm`
- `app/[slug]/concierge/concierge-panel.tsx` — chat input `text-sm`
- `app/dashboard/support-widget.tsx` — chat input `text-sm`
- `app/_landing/landing.tsx` — final-CTA email input `text-sm`

**Why it breaks.** iOS Safari zooms the whole viewport when a focused input is
below 16px, and does not zoom back out. Tapping the Name field at checkout on an
iPhone leaves the diner in a horizontally-scrolled, scaled layout for the rest of
the flow. It is the single most visible mobile defect on the money path.

**Fix — 16px on mobile, keep 14px density on desktop:**

```diff
// app/_components/field.tsx
 export function controlClass(opts?: { invalid?: boolean; className?: string }): string {
   return cx(
-    "w-full rounded-input border bg-surface-elevated px-3 py-2 text-sm text-ink shadow-sm",
+    "w-full rounded-input border bg-surface-elevated px-3 py-2.5 text-base sm:py-2 sm:text-sm",
+    "min-h-11 text-ink shadow-sm sm:min-h-0",
```

Apply the same `text-base sm:text-sm` swap to the four inputs listed above.
(`sm:` is 640px — above every phone, below every tablet, so desktop density is
untouched.)

---

## 3. P1 — visibly broken

### P1-1 · Diner desktop: concierge FAB covers the storefront footer

`app/[slug]/concierge-launcher.tsx:58` — `fixed bottom-6 right-6 z-40`, shown
`lg:flex`. The storefront root drops its bottom reserve at `lg` (`lg:pb-0`), so
the FAB sits permanently over the last row of `StorefrontFooter` and the bottom
edge of the sticky `CartRail`. Fixed by the `lg:pb-24` in P0-3, plus:

```diff
-          className={`fixed bottom-6 right-6 z-40 hidden items-center gap-2 rounded-pill py-3 pl-4 pr-5 … ${panelOpen ? "" : "lg:flex"}`}
+          className={`fixed bottom-6 right-6 z-30 hidden items-center gap-2 rounded-pill py-3 pl-4 pr-5 … ${panelOpen ? "" : "lg:flex"}`}
```

Also raise the concierge panel wrapper (`concierge-panel.tsx:207`) from `z-40`
to `z-50` so it clears the cart bar and the sticky strip cleanly.

---

### P1-2 · Mobile category anchors land *under* the sticky strip

**Where**
- `app/[slug]/storefront.tsx:505` — sticky strip: search row + dietary chips + disclaimer + pill nav ≈ **150–170px** on mobile
- `app/[slug]/storefront.tsx:606` — `scroll-mt-[124px]`
- `app/[slug]/storefront.tsx` — category `<section className="scroll-mt-32">` = 128px
- `app/[slug]/category-nav.tsx:47` — `rootMargin: "-120px 0px -70% 0px"`

**Why it breaks.** All three offsets under-shoot the real strip. Tap a category
chip on a phone and the heading you asked for scrolls to ~25–45px *behind* the
sticky bar. Scroll-spy also flips the active chip one section early.

**Fix — measure it once, derive everything:**

```tsx
// storefront.tsx — on the sticky strip wrapper
const stickyRef = useRef<HTMLDivElement>(null);
useEffect(() => {
  const el = stickyRef.current;
  if (!el) return;
  const ro = new ResizeObserver(([entry]) => {
    document.documentElement.style.setProperty(
      "--p2e-sticky-h",
      `${Math.round(entry.contentRect.height)}px`,
    );
  });
  ro.observe(el);
  return () => ro.disconnect();
}, []);
```

Then `scroll-mt-[calc(var(--p2e-sticky-h,128px)+12px)]` on the sections, and in
`category-nav.tsx` read the same value for `rootMargin`:

```ts
const stickyH = parseInt(
  getComputedStyle(document.documentElement).getPropertyValue("--p2e-sticky-h"),
  10,
) || 128;
// rootMargin: `-${stickyH + 8}px 0px -70% 0px`
```

---

### P1-3 · Desktop menu cards have ragged bottoms

`app/[slug]/item-card.tsx` — the card root is
`<div className="relative overflow-hidden rounded-card …">` with no `h-full`. In
`lg:grid-cols-3 2xl:grid-cols-4` the `<li>` stretches but the card does not, so
each card is only as tall as its own content. The "Add +" pill is
`absolute bottom-2.5`, so it lands at a **different height in every card of a
row** — the most visible layout defect on the desktop menu.

```diff
// item-card.tsx root
-    <div className="relative overflow-hidden rounded-card border border-sand bg-surface-elevated text-left shadow-card transition hover:border-muted/40 hover:shadow-lift">
+    <div className="relative flex h-full flex-col overflow-hidden rounded-card border border-sand bg-surface-elevated text-left shadow-card transition hover:border-muted/40 hover:shadow-lift">
```

```diff
// the desktop <button> body
-        className="hidden w-full flex-col text-left lg:flex"
+        className="hidden w-full flex-1 flex-col text-left lg:flex"
```

---

### P1-4 · Marketing nav has no mobile treatment at all

**Where** `app/_landing/landing.tsx:74–107`, and the same header pattern in
`app/learn/page.tsx:25`, `app/learn/[slug]/page.tsx:67`, `app/shop/page.tsx:30`,
`app/for/[segment]/page.tsx:69`.

**Verified:** there is **not a single** `sm:hidden` / `md:hidden` / `lg:hidden`
/ `hidden md:` in the whole of `app/_landing/`.

**Why it breaks.** Six nav links + "Sign in" + "Start free" in one `flex-wrap`
row, inside a `sticky top-0` header. At 390px that wraps to 3–4 rows ≈ 140–160px
of header that never scrolls away — a third of the viewport, permanently, on the
top of the acquisition funnel. The two competing `ml-auto` divs make the wrap
order unpredictable. Link targets are `px-3 py-1.5` ≈ 30px tall.

**Fix.**

```diff
-          <div className="ml-auto flex flex-wrap items-center gap-1 md:ml-4">
+          <div className="ml-auto hidden flex-wrap items-center gap-1 md:flex md:ml-4">
             {NAV_LINKS.map((l) => (
               <Link … className="rounded-[9px] px-3 py-1.5 text-[13.5px] …">
```

```diff
-          <div className="ml-auto flex items-center gap-2 md:ml-0">
+          <div className="ml-auto flex items-center gap-2">
             <Link href="/signin" className="… hidden sm:inline-flex">Sign in</Link>
             <Link href="/signin" className="… min-h-11 items-center">Start free</Link>
+            <MobileNavDisclosure links={NAV_LINKS} />   {/* md:hidden */}
```

`MobileNavDisclosure` should be a `<details>`-based or state-based sheet — the
page is otherwise a server component, so keep the client boundary small.

Bump every nav link to `min-h-11` while you are in there.

---

### P1-5 · `Segmented` is ~30px tall — on the checkout money path

`app/_components/segmented.tsx` — segments are `px-4 py-1.5 text-sm` ≈ 30px.
Used for **Order type (Pickup / Dine-in)** at
`app/[slug]/checkout/checkout-client.tsx:301` and for the kitchen board filter.
Both are high-frequency touch targets; `Button` correctly ships `h-11`.

```diff
-              "rounded-pill px-4 py-1.5 text-sm font-medium transition",
+              "flex min-h-11 items-center rounded-pill px-4 text-sm font-medium transition sm:min-h-9",
```

---

### P1-6 · `PageHeader` crushes the title on narrow phones

`app/_components/page-header.tsx` — `flex items-start justify-between gap-4`
with a `shrink-0` action slot. `app/dashboard/page.tsx` passes
*"Good afternoon, {firstName}"* plus a "View storefront ↗" button. At 360–390px
the `<h1>` gets ~180px and breaks to 2–3 lines beside the button. This component
is the header of **every** owner page.

```diff
-      <div className="flex items-start justify-between gap-4">
+      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
         <div className="min-w-0">
```

Also: `px-5` at every width while pages are `max-w-[1600px]` — add `lg:px-8` so
the header aligns with the content rhythm on large monitors.

---

### P1-7 · The admin console has no mobile layout

- `app/admin/admin-nav.tsx:30` — brand + 5 tabs + env pill + avatar in one
  `flex-wrap` header, zero breakpoints. Wraps to 3 rows at 390px.
- `app/admin/layout.tsx` — `min-h-screen`, while the rest of the app correctly
  uses `min-h-dvh`. Produces the classic 100vh jump under mobile browser chrome.
- Admin pages (`page.tsx`, `stats`, `promotions`, `marketplace/shop`) are dense
  data lists at a flat `px-5 py-8`.

```diff
// app/admin/layout.tsx
-    <div className="admin-dark min-h-screen bg-surface text-ink">
+    <div className="admin-dark min-h-dvh bg-surface text-ink">
```

```diff
// app/admin/admin-nav.tsx
-      <nav className="flex items-center gap-1">
+      <nav className="-mx-1 flex w-full items-center gap-1 overflow-x-auto px-1 [scrollbar-width:none] md:w-auto md:overflow-visible [&::-webkit-scrollbar]:hidden">
         {TABS.map((tab) => (
-          <Link … className={cx("rounded-control px-3 py-1.5 text-sm font-semibold transition", …)}>
+          <Link … className={cx("flex min-h-11 shrink-0 items-center rounded-control px-3 text-sm font-semibold transition sm:min-h-9", …)}>
```

---

### P1-8 · Toast system built, never mounted — no save feedback anywhere

`app/_components/toast.tsx` is complete and on-brand but nothing renders
`<ToastProvider>`. Every owner mutation (settings save, menu edit, stock
adjust, staff invite, station reorder, table create) returns silently.

**Fix.** Mount at both roots, then wire the existing server-action results:

```diff
// app/dashboard/layout.tsx
-    <div className="lg:flex lg:h-dvh">
+    <ToastProvider>
+      <div className="lg:flex lg:h-dvh">
   …
-    </div>
+      </div>
+    </ToastProvider>
```

Same inside `Storefront` (`app/[slug]/storefront.tsx`) so the diner gets
add-to-cart / stale-cart feedback. Then also fix the viewport, which currently
lands on top of the sticky mobile dashboard header (`z-30` vs toast `z-[100]`):

```diff
// toast.tsx:88
-        className="pointer-events-none fixed inset-x-4 top-4 z-[100] flex flex-col items-end gap-2 print:hidden sm:inset-x-auto sm:right-4"
+        className="pointer-events-none fixed inset-x-4 z-[100] flex flex-col items-end gap-2 pt-[calc(1rem+env(safe-area-inset-top))] print:hidden sm:inset-x-auto sm:right-4"
+        style={{ top: "var(--p2e-header-h, 0px)" }}
```

---

### P1-9 · Account nav: 36px targets, no scroll affordance

`app/[slug]/account/account-nav.tsx` — mobile is
`<ul className="flex gap-1 overflow-x-auto">` with `px-3 py-2 text-sm` links
(~36px). Four items overflow at 360px with no fade or arrow, so "Notifications"
is invisible and undiscoverable.

```diff
-        <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:gap-0.5">
+        <ul className="-mx-5 flex snap-x gap-1 overflow-x-auto px-5 [scrollbar-width:none] lg:mx-0 lg:flex-col lg:gap-0.5 lg:px-0 [&::-webkit-scrollbar]:hidden">
…
-                  className={`block whitespace-nowrap rounded-control px-3 py-2 text-sm font-medium transition …`}
+                  className={`flex min-h-11 snap-start items-center whitespace-nowrap rounded-control px-3 text-sm font-medium transition …`}
```

Add a right-edge gradient mask so the overflow is visible.

---

### P1-10 · Tables board is unusable at 360–390px

`app/dashboard/tables/tables-board.tsx`

1. `grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3` — two QR cards
   side by side at 360px gives each ~150px to hold a label, a status pill, a
   square QR, a session line and a Print link.
2. The add-table affordance renders a **whole `<TableForm />`** inside a
   `min-h-[13rem]` grid cell — a form squeezed into a 150px column.
3. Each card is `div[role="button"]` **containing** a nested `<button>` (Print)
   — nested interactive controls; the outer keydown handler and the inner click
   compete.

```diff
-          <div className="grid auto-rows-min grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
+          <div className="grid auto-rows-min grid-cols-1 gap-4 xs:grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
```

Move add-table into a dialog opened by a real button in the header row, and
restructure each card as a `<button>` for selection with the Print control as a
sibling positioned over it (the pattern `item-card.tsx` already uses correctly).

---

### P1-11 · Kitchen fullscreen hides all notifications

`app/dashboard/orders/orders-board.tsx` — `toggleFullscreen()` calls
`boardRef.current.requestFullscreen()`. The toast viewport, the support FAB and
the sidebar are all fixed on `<body>`, **outside** that element, so the browser
renders none of them in fullscreen. A kitchen running the board fullscreen — the
intended usage — sees zero system feedback.

```diff
-    if (document.fullscreenElement) void document.exitFullscreen();
-    else void el.requestFullscreen?.();
+    if (document.fullscreenElement) void document.exitFullscreen();
+    else void document.documentElement.requestFullscreen?.();
```

…and add a `board-fullscreen` class on `<html>` that hides the sidebar, or
portal `<ToastProvider>`'s viewport into `document.fullscreenElement` when one
exists.

Also worth revisiting: `xl:grid-cols-4` means the four-column board only appears
at ≥1280px. With the 256px sidebar, a 1024–1279px kitchen tablet in landscape
gets **two** columns. Consider `lg:grid-cols-4` with `min-w-0` cards, or
collapsing the rail automatically on `/dashboard/orders`.

---

## 4. P2 — consistency and design-system debt

### P2-1 · 362 instances of 9–11px type

`text-[9px]` / `[10px]` / `[11px]` appears **362 times** across `app/`. The 9px
uppercase Space Mono eyebrow is the label idiom on every owner page, every admin
page, and the diner footer. At 9px with `tracking-wider` on a phone this is
decorative, not readable — and `docs/audit/DesignSystemCompliance.md` already
flagged it as D3 without a fix landing.

**Fix.** Add a two-step token pair in `@theme` and replace the arbitrary values:

```css
--text-eyebrow: 11px;   /* mono uppercase labels — desktop */
--text-micro:   12px;   /* smallest body-adjacent text     */
```

Floor everything body-adjacent at 12px. Keep 11px only for genuine mono eyebrows
and bump those to 12px below `sm`. Highest-value first: the diner storefront
(`cart-rail.tsx`, `storefront-footer.tsx`, `order/[token]/page.tsx`) and the
owner overview KPI cards.

### P2-2 · Emoji used as UI iconography

`🖨` (tables, ×2), `🔔`/`🔕` (kitchen sound), `🖥️ 💬 🧾` (support departments),
`👍 👎` (CSAT), plus `✦ ＋ ✕ « » ▲ ▼ ●` as glyph-icons across the sidebar,
dashboard and admin. These render as a different typeface on Windows and
Android, break vertical rhythm, and cannot inherit `currentColor`. The design
brief specifies no emoji. Replace with the existing inline-SVG idiom
(`sidebar.tsx` has a good pattern).

### P2-3 · Unify the sticky offsets (see RC-5)

One `--p2e-header-h` set by the diner app bar and one `--p2e-sticky-h` set by
the category strip. `cart-rail.tsx` then becomes
`top-[calc(var(--p2e-header-h)+var(--p2e-sticky-h)+16px)]` and the
`AnnouncementBar` finally participates.

### P2-4 · `AnnouncementBar` gutter is double the rest of the diner surface

`app/[slug]/announcement-bar.tsx:44` — `px-10` at every breakpoint, while every
other diner surface is `px-5` (mobile) / `px-6` (desktop). 40px gutters on a
375px phone.

### P2-5 · `useDialog` scroll lock does not hold on iOS

`app/_components/use-dialog.ts` sets `document.body.style.overflow = "hidden"`.
iOS Safari still rubber-band scrolls the page behind a `position: fixed`
overlay. Add `overscroll-behavior: contain` to each panel's scrollable region,
and use the position-fixed-with-scroll-restore technique in the hook.

### P2-6 · Concierge / support inputs override the global focus ring with a weaker one

`focus:outline-none focus:ring-1 focus:ring-accent` replaces the design system's
`0 0 0 4px` amber glow (`--focus-ring`) with a 1px ring — the two AI surfaces are
the only places in the app with a different focus treatment.

### P2-7 · Checkout container is 900px while the storefront is 1440–1680px

`checkout-client.tsx:221` `lg:max-w-[900px]` vs `storefront.tsx`
`max-w-[1440px] 2xl:max-w-[1680px]`. A narrow form column is right, but the
*page header and back-link* should stay in the storefront container so the
transition doesn't read as a different site.

### P2-8 · Nested `min-h-dvh` on sign-in

`app/signin/page.tsx` — `<main className="min-h-dvh lg:grid lg:grid-cols-2">`
with an inner `<section className="flex min-h-dvh …">`. If the form column ever
exceeds the viewport the brand aside won't match its height. Drop the inner to
`min-h-dvh lg:min-h-0`.

### P2-9 · Marketing footer has three dead social "links"

`landing.tsx` renders `X`, `Instagram`, `LinkedIn` as inert `<span>`s. Link them
or remove them — an unclickable social row reads as a broken page.

### P2-10 · The contrast gate is bypassed by logo upload

**Where** `app/dashboard/settings/actions.ts` (`updateBrandTheme` ~line 76,
`uploadVenueLogo` / `deriveBrandColorFromLogo`), `lib/contrast.ts`,
`app/globals.css`

`lib/contrast.ts` itself is correct — pure WCAG 2.x maths, well tested, and it
fails closed on an unparseable colour. The problem is entirely in how it is
called.

`updateBrandTheme` runs `contrastRatio(textColor, brandColor)` **only when the
owner picks a custom text colour**; "auto" skips the gate by design (the comment
says auto "derives a readable ink/cream automatically and is safe by
construction"). That leaves two holes:

1. **`uploadVenueLogo` writes `brandColor` with no contrast check at all.**
   `deriveBrandColorFromLogo()` takes sharp's dominant colour and the action
   sets it directly:

   ```ts
   const derivedBrand = await deriveBrandColorFromLogo(buffer);
   await db.update(venues).set({
     logoUrl: publicUrl,
     ...(derivedBrand ? { brandColor: derivedBrand } : {}),
   })
   ```

   The only guard is a luminance band (`lum > 0.88 || lum < 0.06`), which is not
   a contrast check against anything. **A logo upload can therefore set a brand
   colour that the settings form would have rejected**, and the owner is never
   told. Route the derived colour through the same gate and fall back to the
   existing brand when it fails.

2. **The gate is theme-blind.** `contrastRatio` takes two hex strings and no
   theme, so it only ever sees the stored value — while `globals.css` under
   `@media (prefers-color-scheme: dark) [data-domain="diner"]` lightens `--brand`
   with `color-mix(in oklab, var(--brand) 60%, #ffffff)`. The colour actually
   rendered in dark mode is not the colour that was gated. Either evaluate both
   themes at save time, or compute `--brand-contrast` per theme.

Note also that the gate compares text against **brand**, not against the page
background — correct for text sitting on a brand-filled surface, but it means
nothing validates brand-on-cream or brand-on-`#0e1f18` for the many places
`--brand` is used as a foreground.

---

## 5. The z-index scale to adopt

Add to `@theme` in `app/globals.css` and replace every hand-picked value.

```css
--z-raised:  10;   /* controls layered on a card (item-card add pill)      */
--z-sticky:  20;   /* in-page sticky headers (category strip, admin nav)   */
--z-chrome:  30;   /* app bars, cart bar, FABs, impersonation banner       */
--z-scrim:   50;   /* modal + drawer backdrops                             */
--z-modal:   60;   /* dialog panels, sheets, the nav drawer itself         */
--z-popover: 70;   /* menus anchored inside a modal                        */
--z-toast:  100;   /* notifications                                        */
--z-skip:   110;   /* skip link — always first and always on top           */
```

**Current → target**

| Component | File | Now | Target |
|---|---|---|---|
| Item-card add buttons | `[slug]/item-card.tsx` | 10 | `raised` |
| Category-nav arrows | `[slug]/category-nav.tsx` | 10 | `raised` |
| Venue switcher menu | `dashboard/venue-switcher.tsx` | 10 | `raised` |
| Diner category strip | `[slug]/storefront.tsx:505` | 20 | `sticky` |
| Admin nav | `admin/admin-nav.tsx` | 20 | `sticky` |
| Diner desktop app bar | `[slug]/storefront.tsx:279` | 30 | `chrome` |
| Dashboard mobile header | `dashboard/sidebar.tsx:253` | 30 | `chrome` |
| Impersonation banner | `dashboard/layout.tsx:68` | 30 | `chrome` |
| Mobile cart bar | `[slug]/cart-bar.tsx` | 30 | `chrome` |
| Marketplace / studio bottom bars | 2 files | 40 | `chrome` |
| **Support FAB** | `dashboard/support-widget.tsx:274` | **40** | **`chrome`** |
| **Concierge FAB** | `[slug]/concierge-launcher.tsx:58` | **40** | **`chrome`** |
| **Sidebar drawer scrim** | `dashboard/sidebar.tsx:269` | **40** | **`scrim`** |
| Support panel | `dashboard/support-widget.tsx:286` | 40 | `scrim` |
| Concierge panel | `[slug]/concierge/concierge-panel.tsx:207` | 40 | `scrim` |
| Integrations drawer | `dashboard/integrations/detail-drawer.tsx:55` | 40 | `scrim` |
| Sidebar `<aside>` | `dashboard/sidebar.tsx:279` | 50 | `modal` |
| Item modifier sheet | `[slug]/item-modifier-sheet.tsx` | 50 | `modal` |
| Cart review | `[slug]/cart-review.tsx` | 50 | `modal` |
| Multi-item picker | `[slug]/concierge/multi-item-picker.tsx` | 50 | `modal` |
| Ticket drawer | `dashboard/orders/ticket-drawer.tsx` | 50 | `modal` |
| Marketing headers (×4) | `_landing`, `learn`, `shop`, `for` | 50 | `sticky` |
| Pre-checkout upsell | `[slug]/recommendations.tsx:280` | 60 | `popover` |
| Toasts | `_components/toast.tsx` | 100 | `toast` |
| Skip link | `_components/skip-link.tsx` | 100 | `skip` |

Note the marketing headers at `z-50` are only sticky page headers and should
drop to `sticky` — they currently outrank every diner modal, which matters if a
marketing page ever hosts one.

---

## 6. Suggested order of work

1. **RC-1 + RC-2 + P0-1…P0-4** — one PR: z-scale token, `viewportFit: "cover"`,
   FAB offset variable, bottom reserves. This alone clears the reported bug and
   four more.
2. **P0-5** — one PR: `text-base sm:text-sm` across `controlClass` + the four
   standalone inputs. Highest user-visible win on mobile.
3. **P1-2 + P2-3** — the sticky-offset variable. Clears both.
4. **P1-4 + P1-7** — mobile nav for marketing and admin.
5. **P1-8** — mount `ToastProvider`, wire owner saves.
6. **P1-1, P1-3, P1-5, P1-6, P1-9, P1-10, P1-11** — individual, small.
7. **P2** — batch as design-system PRs alongside the existing D2–D5 backlog in
   `docs/audit/DesignSystemCompliance.md`.

---

## 7. Verification matrix

Add to `playwright.config.ts` as a viewport matrix job — the release gate
`docs/audit/Responsive.md` calls for and that this audit could not run.

| Viewport | Check |
|---|---|
| 360 × 640 | Dashboard: open nav drawer → support FAB must **not** be visible. Marketing header ≤ 64px tall. Tables board single column. |
| 390 × 844 (iPhone) | Checkout: focus each field → `visualViewport.scale === 1`. Cart bar clear of the home indicator. |
| 390 × 844, native shell | Support FAB clear of home indicator; marketplace + studio bottom bars fully tappable. |
| 430 × 932 | Diner menu: tap each category chip → heading top ≥ sticky-strip bottom. |
| 768 × 1024 | Orders board column count; menu editor two-pane threshold. |
| 1024 × 768 (kitchen tablet) | Orders board readable; fullscreen still shows toasts. |
| 1280 × 800 | Diner desktop: concierge FAB does not overlap footer or cart rail. Item cards in a row share a bottom edge. |
| 1920 × 1080 | No dead gutters; `PageHeader` aligns with `max-w-[1600px]` content. |

Plus one axe pass per surface with a database seeded — CI currently scans only
the anonymous marketing pages, so the storefront and dashboard have never been
scanned.
