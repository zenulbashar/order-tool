# PATCHES — Prompt2Eat UI audit

Paste-ready changes, grouped into five PRs. Every hunk cites the file and the
current class string so you can locate it without guessing. Findings referenced
as P0-1 etc. map to `UI-AUDIT-HANDOVER.md`.

Nothing here changes behaviour, data, or the money path — these are layout,
stacking, and sizing changes plus one provider mount and one contrast gate.

---

## PR 1 — Stacking, safe areas, and bottom reserves

Clears **P0-1, P0-2, P0-3, P0-4, P1-1** and root causes **RC-1, RC-2, RC-3**.
Do this one first; it is the reported bug plus four more.

### 1.1 Add the z-index scale

`app/globals.css` — inside the existing `@theme` block:

```css
/* Layering scale. Every fixed/sticky/absolute layer picks a NAME, never a
   number. Ties are what caused the support FAB to paint over the nav drawer. */
--z-raised:  10;   /* controls layered on a card                */
--z-sticky:  20;   /* in-page sticky headers                    */
--z-chrome:  30;   /* app bars, cart bar, FABs, banners         */
--z-scrim:   50;   /* modal + drawer backdrops                  */
--z-modal:   60;   /* dialog panels, sheets, the nav drawer     */
--z-popover: 70;   /* menus anchored inside a modal             */
--z-toast:  100;   /* notifications                             */
--z-skip:   110;   /* skip link — always on top                 */
```

Tailwind v4 exposes these as `z-raised`, `z-sticky`, `z-chrome`, `z-scrim`,
`z-modal`, `z-popover`, `z-toast`, `z-skip`.

### 1.2 Turn on safe-area insets

`app/layout.tsx`:

```diff
 export const viewport: Viewport = {
   themeColor: "#16241C",
+  // Without this every env(safe-area-inset-*) resolves to 0 on iOS, which
+  // silently disabled the insets already written in shop-client/studio-client.
+  viewportFit: "cover",
 };
```

### 1.3 Support FAB — off the tie, above bottom bars, clear of the home indicator

`app/dashboard/support-widget.tsx`, the launcher button (~line 274):

```diff
-        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-pill py-3 pl-4 pr-5 text-sm font-semibold text-white shadow-lift print:hidden"
-        style={{ background: "linear-gradient(110deg,#13301f,#1d4a35)" }}
+        className="fixed right-6 z-chrome flex items-center gap-2 rounded-pill py-3 pl-4 pr-5 text-sm font-semibold text-white shadow-lift print:hidden"
+        style={fabStyle}
```

Above the `return`, in the same component:

```ts
// Sits above any page-level bottom bar (which sets --p2e-bottom-bar-h) and
// above the iOS home indicator.
const fabStyle: React.CSSProperties = {
  background: "linear-gradient(110deg,#13301f,#1d4a35)",
  bottom:
    "calc(1.5rem + env(safe-area-inset-bottom) + var(--p2e-bottom-bar-h, 0px))",
};
```

Same file, the open panel wrapper (~line 286):

```diff
-        className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center lg:items-end lg:justify-end lg:bg-black/15 lg:p-6 print:hidden"
+        className="fixed inset-0 z-scrim flex items-end justify-center bg-black/40 sm:items-center lg:items-end lg:justify-end lg:bg-black/15 lg:p-6 print:hidden"
```

And the panel's input footer:

```diff
-      <div className="border-t border-sand p-3">
+      <div className="border-t border-sand p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
```

### 1.4 Sidebar — scrim above the FAB, drawer above the scrim

`app/dashboard/sidebar.tsx`:

```diff
   {/* scrim, ~line 269 */}
-        className="fixed inset-0 z-40 bg-black/40 lg:hidden"
+        className="fixed inset-0 z-scrim bg-black/40 lg:hidden"

   {/* drawer aside, ~line 279 */}
-        className="fixed inset-y-0 left-0 z-50 w-[264px] …"
+        className="fixed inset-y-0 left-0 z-modal w-[264px] …"

   {/* mobile header, ~line 253 */}
-      <header className="sticky top-0 z-30 flex items-center gap-3 … lg:hidden">
+      <header className="sticky top-0 z-chrome flex items-center gap-3 … pt-[calc(0.75rem+env(safe-area-inset-top))] lg:hidden">
```

**Belt-and-braces** — hide the FAB entirely while the drawer is open. The
sidebar already owns `open`; reflect it on the document so the FAB can react
without lifting state:

```ts
// sidebar.tsx
useEffect(() => {
  document.body.toggleAttribute("data-nav-open", open);
  return () => document.body.removeAttribute("data-nav-open");
}, [open]);
```

```diff
 // support-widget.tsx launcher
-        className="fixed right-6 z-chrome flex items-center …"
+        className="fixed right-6 z-chrome flex items-center [body[data-nav-open]_&]:hidden …"
```

### 1.5 Bottom bars declare their height

`app/dashboard/marketplace/shop-client.tsx` and
`app/dashboard/studio/studio-client.tsx` — on the page root wrapper:

```diff
-  <div className="…">
+  <div className="…" style={{ "--p2e-bottom-bar-h": "72px" } as React.CSSProperties}>
```

72px = 12px pad + 44px control + 12px pad + 1px border. Both bars are
`lg:hidden`; if the variable leaks to desktop, clear it with
`lg:[--p2e-bottom-bar-h:0px]`.

Same two files, the bar itself:

```diff
-        className="fixed inset-x-0 bottom-0 z-40 … lg:hidden"
+        className="fixed inset-x-0 bottom-0 z-chrome … lg:hidden"
```

### 1.6 Bottom reserves

```diff
 // app/dashboard/layout.tsx
-      <main id="main-content" className="min-w-0 flex-1 overflow-y-auto">
+      <main
+        id="main-content"
+        className="min-w-0 flex-1 overflow-y-auto pb-24 lg:pb-20 print:pb-0"
+      >
```

```diff
 // app/[slug]/storefront.tsx — reserve must SURVIVE at lg (concierge FAB is fixed there)
-        className="min-h-dvh bg-surface pb-24 lg:pb-0"
+        className="min-h-dvh bg-surface pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-24"
```

### 1.7 Diner concierge + cart bar

```diff
 // app/[slug]/concierge-launcher.tsx:58
-          className={`fixed bottom-6 right-6 z-40 hidden items-center gap-2 …`}
+          className={`fixed bottom-6 right-6 z-chrome hidden items-center gap-2 …`}

 // app/[slug]/concierge/concierge-panel.tsx:207
-        className="fixed inset-0 z-40 …"
+        className="fixed inset-0 z-scrim …"

 // app/[slug]/cart-bar.tsx:20
-      className="fixed inset-x-0 bottom-0 z-30 … pb-4 lg:hidden"
+      className="fixed inset-x-0 bottom-0 z-chrome … pb-[calc(1rem+env(safe-area-inset-bottom))] lg:hidden"
```

### 1.8 Remaining z-value swaps

Mechanical; no behaviour change.

| File | From | To |
|---|---|---|
| `[slug]/item-card.tsx` | `z-10` | `z-raised` |
| `[slug]/category-nav.tsx` | `z-10` | `z-raised` |
| `dashboard/venue-switcher.tsx` | `z-10` | `z-raised` |
| `[slug]/storefront.tsx:505` | `z-20` | `z-sticky` |
| `admin/admin-nav.tsx` | `z-20` | `z-sticky` |
| `[slug]/storefront.tsx:279` | `z-30` | `z-chrome` |
| `dashboard/layout.tsx:68` (impersonation) | `z-30` | `z-chrome` |
| `dashboard/integrations/detail-drawer.tsx:55` | `z-40` | `z-scrim` |
| `[slug]/item-modifier-sheet.tsx` | `z-50` | `z-modal` |
| `[slug]/cart-review.tsx` | `z-50` | `z-modal` |
| `[slug]/concierge/multi-item-picker.tsx` | `z-50` | `z-modal` |
| `dashboard/orders/ticket-drawer.tsx` | `z-50` | `z-modal` |
| `_landing`, `learn`, `shop`, `for` headers | `z-50` | `z-sticky` |
| `[slug]/recommendations.tsx:280` | `z-[60]` | `z-popover` |
| `_components/toast.tsx` | `z-[100]` | `z-toast` |
| `_components/skip-link.tsx` | `z-[100]` | `z-skip` |

Every sheet/drawer CTA footer listed under P0-4 also gets
`pb-[calc(1rem+env(safe-area-inset-bottom))]`.

---

## PR 2 — The 16px input floor

Clears **P0-5** / **RC-4**. Highest user-visible mobile win; touches the whole
checkout flow.

`app/_components/field.tsx`:

```diff
 export function controlClass(opts?: { invalid?: boolean; className?: string }): string {
   return cx(
-    "w-full rounded-input border bg-surface-elevated px-3 py-2 text-sm text-ink shadow-sm",
+    // 16px on mobile: iOS Safari zooms the viewport for any focused input
+    // under 16px and never zooms back. sm: restores desktop density.
+    "w-full rounded-input border bg-surface-elevated px-3 py-2.5 text-base sm:py-2 sm:text-sm",
+    "min-h-11 text-ink shadow-sm sm:min-h-0",
     opts?.invalid ? "border-danger" : "border-sand",
     opts?.className,
   );
 }
```

Same swap on the four inputs that don't route through `controlClass`:

```diff
 // app/[slug]/menu-search.tsx:110
-        className="… text-sm …"
+        className="… text-base sm:text-sm …"
```

…and identically in `app/[slug]/concierge/concierge-panel.tsx` (chat input),
`app/dashboard/support-widget.tsx` (chat input), and
`app/_landing/landing.tsx` (final-CTA email input).

**Touch targets** — `app/_components/segmented.tsx` (P1-5):

```diff
-              "rounded-pill px-4 py-1.5 text-sm font-medium transition",
+              "flex min-h-11 items-center rounded-pill px-4 text-sm font-medium transition sm:min-h-9",
```

**Account nav** — `app/[slug]/account/account-nav.tsx` (P1-9):

```diff
-        <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:gap-0.5">
+        <ul className="-mx-5 flex snap-x gap-1 overflow-x-auto px-5 [scrollbar-width:none] lg:mx-0 lg:flex-col lg:gap-0.5 lg:px-0 [&::-webkit-scrollbar]:hidden">
…
-                  className={`block whitespace-nowrap rounded-control px-3 py-2 text-sm font-medium transition …`}
+                  className={`flex min-h-11 snap-start items-center whitespace-nowrap rounded-control px-3 text-sm font-medium transition …`}
```

Add a right-edge fade so the overflow is discoverable:

```
[mask-image:linear-gradient(90deg,#000_calc(100%-28px),transparent)] lg:[mask-image:none]
```

---

## PR 3 — One sticky offset, measured not guessed

Clears **P1-2** and **P2-3** / **RC-5**.

`app/[slug]/storefront.tsx` — publish the real strip height:

```ts
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

Attach `ref={stickyRef}` to the sticky strip wrapper (~line 505), then:

```diff
 // category sections
-      <section className="scroll-mt-32">
+      <section className="scroll-mt-[calc(var(--p2e-sticky-h,128px)+12px)]">

 // storefront.tsx:606
-        className="… scroll-mt-[124px]"
+        className="… scroll-mt-[calc(var(--p2e-sticky-h,128px)+12px)]"
```

`app/[slug]/category-nav.tsx:47` — read the same value:

```diff
-      { rootMargin: "-120px 0px -70% 0px", threshold: 0 },
+      {
+        rootMargin: `-${
+          (parseInt(
+            getComputedStyle(document.documentElement).getPropertyValue(
+              "--p2e-sticky-h",
+            ),
+            10,
+          ) || 128) + 8
+        }px 0px -70% 0px`,
+        threshold: 0,
+      },
```

Do the same for the desktop app bar (`--p2e-header-h`), then `cart-rail.tsx`
stops hard-coding:

```diff
-        className="sticky top-[136px] max-h-[calc(100dvh-156px)] …"
+        className="sticky top-[calc(var(--p2e-header-h,64px)+var(--p2e-sticky-h,56px)+16px)] max-h-[calc(100dvh-var(--p2e-header-h,64px)-var(--p2e-sticky-h,56px)-36px)] …"
```

This is also what finally makes `AnnouncementBar` participate.

---

## PR 4 — Mobile nav for marketing and admin

Clears **P1-4** and **P1-7**.

`app/_landing/landing.tsx` — split the two competing `ml-auto` groups:

```diff
-          <div className="ml-auto flex flex-wrap items-center gap-1 md:ml-4">
+          <div className="ml-auto hidden flex-wrap items-center gap-1 md:ml-4 md:flex">
             {NAV_LINKS.map((l) => (
-              <Link … className="rounded-[9px] px-3 py-1.5 text-[13.5px] …">
+              <Link … className="flex min-h-11 items-center rounded-[9px] px-3 text-[13.5px] md:min-h-9 …">
             ))}
           </div>

-          <div className="ml-auto flex items-center gap-2 md:ml-0">
+          <div className="ml-auto flex items-center gap-2">
             <Link href="/signin" className="… hidden sm:inline-flex">Sign in</Link>
             <Link href="/signin" className="… inline-flex min-h-11 items-center">Start free</Link>
+            <MobileNavDisclosure links={NAV_LINKS} />
           </div>
```

New client component, `app/_landing/mobile-nav-disclosure.tsx` — keep the
boundary small; the rest of the page stays a server component:

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";

export function MobileNavDisclosure({
  links,
}: {
  links: { href: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="marketing-mobile-nav"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((v) => !v)}
        className="flex size-11 items-center justify-center rounded-control border border-sand"
      >
        <span className="flex flex-col gap-[3px]">
          <span className="block h-px w-4 bg-ink" />
          <span className="block h-px w-4 bg-ink" />
          <span className="block h-px w-4 bg-ink" />
        </span>
      </button>
      {open ? (
        <div
          id="marketing-mobile-nav"
          className="absolute inset-x-0 top-full border-b border-sand bg-surface-elevated p-3 shadow-lift"
        >
          <ul className="flex flex-col gap-1">
            {links.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="flex min-h-11 items-center rounded-control px-3 text-[15px] font-medium text-ink"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
```

The header needs `relative` for the panel to anchor. Apply the same treatment to
the duplicated headers in `app/learn/page.tsx:25`, `app/learn/[slug]/page.tsx:67`,
`app/shop/page.tsx:30`, `app/for/[segment]/page.tsx:69` — or better, extract the
one shared `<MarketingHeader />` those four are copies of.

**Admin** — `app/admin/layout.tsx`:

```diff
-    <div className="admin-dark min-h-screen bg-surface text-ink">
+    <div className="admin-dark min-h-dvh bg-surface text-ink">
```

`app/admin/admin-nav.tsx`:

```diff
-      <nav className="flex items-center gap-1">
+      <nav className="-mx-1 flex w-full items-center gap-1 overflow-x-auto px-1 [scrollbar-width:none] md:w-auto md:overflow-visible [&::-webkit-scrollbar]:hidden">
         {TABS.map((tab) => (
-          <Link … className={cx("rounded-control px-3 py-1.5 text-sm font-semibold transition", …)}>
+          <Link … className={cx("flex min-h-11 shrink-0 items-center rounded-control px-3 text-sm font-semibold transition sm:min-h-9", …)}>
```

---

## PR 5 — Feedback, and the rest of the P1s

### 5.1 Mount the toast provider (P1-8 / RC-6)

`app/dashboard/layout.tsx`:

```diff
+import { ToastProvider } from "@/app/_components/toast";
…
-    <div className="lg:flex lg:h-dvh">
+    <ToastProvider>
+      <div className="lg:flex lg:h-dvh">
       …
-    </div>
+      </div>
+    </ToastProvider>
```

Same wrap inside `Storefront` (`app/[slug]/storefront.tsx`) for add-to-cart and
stale-cart feedback.

`app/_components/toast.tsx:88` — clear the sticky mobile header and the notch:

```diff
-        className="pointer-events-none fixed inset-x-4 top-4 z-[100] flex flex-col items-end gap-2 print:hidden sm:inset-x-auto sm:right-4"
+        className="pointer-events-none fixed inset-x-4 z-toast flex flex-col items-end gap-2 pt-[calc(1rem+env(safe-area-inset-top))] print:hidden sm:inset-x-auto sm:right-4"
+        style={{ top: "var(--p2e-header-h, 0px)" }}
```

Then wire the existing server-action results — settings, menu, stock, staff,
stations, tables all already return `{ success?: boolean; error?: string }`.

### 5.2 Item cards share a baseline (P1-3)

`app/[slug]/item-card.tsx`:

```diff
-    <div className="relative overflow-hidden rounded-card border border-sand bg-surface-elevated text-left shadow-card transition hover:border-muted/40 hover:shadow-lift">
+    <div className="relative flex h-full flex-col overflow-hidden rounded-card border border-sand bg-surface-elevated text-left shadow-card transition hover:border-muted/40 hover:shadow-lift">
…
-        className="hidden w-full flex-col text-left lg:flex"
+        className="hidden w-full flex-1 flex-col text-left lg:flex"
```

### 5.3 PageHeader stacks on phones (P1-6)

`app/_components/page-header.tsx`:

```diff
-      <div className="flex items-start justify-between gap-4">
+      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
         <div className="min-w-0">
```

…and give it the large-screen gutter the content already has:

```diff
-      className="… px-5 …"
+      className="… px-5 lg:px-8 …"
```

### 5.4 Tables board (P1-10)

```diff
-          <div className="grid auto-rows-min grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
+          <div className="grid auto-rows-min grid-cols-1 gap-4 min-[420px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
```

Two structural changes in the same file:

1. Move `<TableForm />` out of the grid into a dialog opened by a real button in
   the header row. A form inside a 150px grid cell cannot be filled in.
2. The card is `div[role="button"]` **containing** a `<button>` (Print) — nested
   interactive controls. Restructure so selection is a `<button>` and Print is a
   sibling positioned over it. `app/[slug]/item-card.tsx` already does this
   correctly; copy that shape.

### 5.5 Kitchen fullscreen keeps its notifications (P1-11)

`app/dashboard/orders/orders-board.tsx`:

```diff
   function toggleFullscreen() {
     if (document.fullscreenElement) void document.exitFullscreen();
-    else void boardRef.current?.requestFullscreen?.();
+    // Fullscreen the document, not the board — toasts, the FAB and the sidebar
+    // are fixed on <body> and are NOT rendered inside a fullscreened subtree.
+    else void document.documentElement.requestFullscreen?.();
   }
```

Add a `:fullscreen` rule that hides the rail, or portal the toast viewport into
`document.fullscreenElement` when one exists.

Also consider `lg:grid-cols-4` (currently `xl:`) so a 1024–1279px kitchen tablet
in landscape gets four columns rather than two.

### 5.6 Close the brand-contrast bypass (P2-10)

`app/dashboard/settings/actions.ts` — `uploadVenueLogo` currently writes a
sharp-derived `brandColor` with no contrast check at all; the only guard is a
luminance band. Route it through the same gate the form uses:

```diff
   const derivedBrand = await deriveBrandColorFromLogo(buffer);
+  // The settings form gates brand/text contrast; a logo upload must not be a
+  // back door that lands a colour the form would have rejected.
+  const safeBrand =
+    derivedBrand && meetsContrastAA("#FFFDF8", derivedBrand, WCAG_AA_LARGE)
+      ? derivedBrand
+      : null;

   await db
     .update(venues)
     .set({
       logoUrl: publicUrl,
-      ...(derivedBrand ? { brandColor: derivedBrand } : {}),
+      ...(safeBrand ? { brandColor: safeBrand } : {}),
     })
```

Pick the pairing that matches how `--brand` is actually used as a surface; the
point is that *some* gate runs. Second half: `lib/contrast.ts` takes no theme,
while `globals.css` lightens `--brand` 60% toward white for the diner dark
theme — so the colour rendered in dark mode is not the colour that was gated.
Evaluate both themes at save time, or compute `--brand-contrast` per theme.

---

## PR 6 (optional) — Design-system debt

Batch with the existing D2–D5 backlog in `docs/audit/DesignSystemCompliance.md`.

- **P2-1** — 362 instances of `text-[9px]`/`[10px]`/`[11px]`. Add
  `--text-eyebrow: 11px` and `--text-micro: 12px`; floor body-adjacent text at
  12px. Start with the diner storefront and the owner KPI cards.
- **P2-2** — replace emoji iconography (`🖨 🔔 🖥️ 💬 🧾 👍 👎`, and the
  `✦ ＋ ✕ « » ▲ ▼ ●` glyph-icons) with the inline-SVG idiom `sidebar.tsx`
  already uses.
- **P2-4** — `announcement-bar.tsx:44` is `px-10` at every breakpoint while the
  diner surface is `px-5`/`px-6`.
- **P2-5** — `use-dialog.ts` sets `body.style.overflow = "hidden"`, which iOS
  ignores for rubber-band. Add `overscroll-behavior: contain` on each scrollable
  panel and use position-fixed with scroll restore.
- **P2-6** — the two chat inputs override the design system's 4px amber focus
  ring with `focus:ring-1`.
- **P2-7** — checkout is `lg:max-w-[900px]` inside a `max-w-[1440px]` store;
  keep the page header and back-link in the storefront container.
- **P2-8** — `signin/page.tsx` nests `min-h-dvh` inside a `min-h-dvh` grid row;
  drop the inner to `lg:min-h-0`.
- **P2-9** — three inert `<span>` social "links" in the marketing footer.

---

## Verification

Add as a viewport-matrix job in `playwright.config.ts` — the release gate
`docs/audit/Responsive.md` defers.

| Viewport | Assertion |
|---|---|
| 360 × 640 | Dashboard: open nav drawer → support FAB not visible. Marketing header ≤ 64px. Tables board single column. |
| 390 × 844 | Checkout: focus each field → `visualViewport.scale === 1`. Cart bar clear of home indicator. |
| 390 × 844 native | Support FAB clear of home indicator; marketplace + studio bars fully tappable. |
| 430 × 932 | Diner menu: tap each category chip → heading top ≥ sticky-strip bottom. |
| 768 × 1024 | Orders board column count; menu-editor two-pane threshold. |
| 1024 × 768 | Kitchen tablet: board readable; fullscreen still shows toasts. |
| 1280 × 800 | Concierge FAB clears footer and cart rail; item cards share a bottom edge. |
| 1920 × 1080 | No dead gutters; PageHeader aligns with the 1600px content column. |

Plus one axe pass per surface **with a seeded database** — CI currently scans
only the anonymous marketing pages, so the storefront and dashboard have never
been scanned.
