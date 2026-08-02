# Prompt2Eat UI Audit — Round 2 findings

Source: `zenulbashar/order-tool@c7e96cb` (`main`), read directly. 173 files
changed across 50 commits since the round-1 audit at `2eda5748`.

## What verified closed

Checked against source, not against the changelog:

- **RC-1 / P0-1 — z-index scale.** Eight layers under `--z-index-*` in
  `globals.css`, correctly namespaced. Zero raw numeric `z-` classes remain in
  `app/`. `test/z-layer-scale.test.ts` pins both the namespace and the ordering.
- **RC-2 — safe-area.** `viewportFit: "cover"` present in `app/layout.tsx`.
- **RC-4 / P0-5 — 16px floor.** `controlClass()` is `text-base sm:text-sm`;
  the guard is brace-aware and would catch a bare `text-sm` on any control.
- **RC-5 / P1-2 / P2-3 — sticky stack.** All five magic numbers gone, replaced by
  a measured `--p2e-sticky-h` with a ResizeObserver so the dismissible
  AnnouncementBar participates. Every consumer passes a fallback.
- **RC-6 / P1-8 — toast mount.** `ToastProvider` wraps both the owner shell and
  the diner storefront.
- **P1-4 — marketing mobile nav.** Real disclosure island, Escape + outside-click,
  44px targets.
- **P2-10 — contrast gate.** `surfaceContrast()` now measures the text colour
  against both page surfaces and returns the worse of the two. The inversion is
  fixed and documented.
- **P2-1 — micro type.** No `text-[9px]/[10px]/[11px]` left in `app/`.

The four new guards are genuine rules, not snapshots, and two of them carry
useful scar tissue in their docblocks (the comment-stripping trap, the
brace-aware tag scan). Good work.

## What did not take effect

### R2-1 — P0 — the reported bug is still live

`app/dashboard/marketplace/shop-client.tsx:89`,
`app/dashboard/studio/studio-client.tsx:371`,
`app/dashboard/support-widget.tsx:72`

The page sets `--p2e-bottom-bar-h: 72px` on its own `<section>`. That section is
inside `<main>`. `<SupportWidget>` is a **sibling** of `<main>`, so the property
never inherits to it and `var(--p2e-bottom-bar-h, 0px)` always takes the fallback.

The FAB therefore still sits at `bottom: 1.5rem + inset` — on top of the 72px
mobile bottom bar, over the right-hand end where the primary action is. The
original complaint, unchanged, on `/dashboard/marketplace` and `/dashboard/studio`.

Everything else in P0-1/P0-2 did land: the FAB is `z-chrome` under the
`z-scrim` drawer, and `[body[data-nav-open]_&]:hidden` correctly hides it while
the nav drawer is open (`sidebar.tsx:256` sets the attribute). It is specifically
the bottom-bar offset that is inert.

### R2-2 — P1 — the desktop reset is dead code

`lg:[--p2e-bottom-bar-h:0px]` sits on the same element as
`style={{ "--p2e-bottom-bar-h": "72px" }}`. An inline declaration outranks any
stylesheet rule regardless of media query, so the `lg:` reset never applies. Once
R2-1 is fixed in the obvious way (hoisting the variable), the FAB would jump 72px
up on desktop, where there is no bar. Measuring the bar instead of hard-coding it
resolves both at once — a `lg:hidden` bar measures 0.

There is also a latent double-count: the FAB adds `env(safe-area-inset-bottom)`
*and* the bar height, but the bar's own padding already includes that inset.

### R2-3 — P1 — toast still overlaps the dashboard mobile header

`app/_components/toast.tsx:95` reads `var(--p2e-header-h, 0px)`. Only
`app/[slug]/storefront.tsx` publishes that metric. The dashboard's sticky mobile
header at `app/dashboard/sidebar.tsx:340` publishes nothing, so the value is
`0px` on every owner page and toasts render on top of it at ≤1024px.

The component's own comment states this is the case it was written to fix. It
fixes it on the diner storefront only.

### R2-4 — P2 — conflicting font sizes

`app/dashboard/support-widget.tsx:517`: `text-base sm:text-base sm:text-sm`. Two
`sm:` font sizes; the winner is decided by emission order in the built stylesheet.
Tailwind emits the scale in order, so `sm:text-base` wins and the intended
desktop density is dropped. Harmless to the zoom floor, but it is a codemod
artefact and the zoom guard is structurally blind to it.

## Why the guards missed all of this

All four new tests are static token checks — they verify the right strings appear
in the right files. R2-1 and R2-3 are **tree-reachability** failures: the right
string is in the right file, and it still does nothing, because the element that
sets it is not an ancestor of the element that reads it.

Patch 7 converts that into something static and checkable: these metrics must be
*published* on `documentElement` via the hook, never *declared* on a component
node — and any metric that is read must have a publisher.
