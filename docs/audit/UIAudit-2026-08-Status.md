# UI audit 2026-08 — status

Tracks the 26 findings in `UIAudit-2026-08.md` (5 P0, 11 P1, 10 P2). The audit
was taken against `main @ 2eda5748`; several of its recommendations had already
landed independently by the time work started, and those are marked below rather
than re-done.

| # | Sev | Finding | Status |
| --- | --- | --- | --- |
| RC-1 | — | No z-index scale; six components share `z-40` | ✅ Fixed |
| RC-2 | — | `env(safe-area-inset-*)` returns 0 (no `viewportFit`) | ✅ Fixed |
| RC-3 | — | Fixed overlays reserve no scroll space | ✅ Fixed |
| RC-4 | — | Controls below the iOS zoom floor and touch floor | ✅ Fixed |
| RC-5 | — | Five unrelated sticky magic numbers | ✅ Fixed |
| RC-6 | — | Toast system built, never mounted | ✅ Fixed |
| P0-1 | P0 | Support FAB overlaps the mobile nav drawer *(reported)* | ✅ Fixed |
| P0-2 | P0 | Support FAB covers both mobile bottom action bars | ✅ Fixed |
| P0-3 | P0 | No bottom reserve on any dashboard page | ✅ Fixed |
| P0-4 | P0 | Safe-area insets dead | ✅ Fixed |
| P0-5 | P0 | Every text input triggers iOS auto-zoom | ✅ Fixed |
| P1-1 | P1 | Concierge FAB covers the storefront footer at `lg` | ✅ Fixed |
| P1-2 | P1 | Mobile category anchors land under the sticky strip | ✅ Fixed |
| P1-3 | P1 | Desktop menu cards have ragged bottoms | ✅ Fixed |
| P1-4 | P1 | Marketing nav has no mobile treatment | ✅ Fixed |
| P1-5 | P1 | `Segmented` is ~30px on the checkout path | ✅ Fixed |
| P1-6 | P1 | `PageHeader` crushes the title on narrow phones | ✅ Fixed |
| P1-7 | P1 | Admin console has no mobile layout | ✅ Fixed |
| P1-8 | P1 | No save feedback anywhere (toasts unmounted) | ✅ Fixed |
| P1-9 | P1 | Account nav: 36px targets, no scroll affordance | ✅ Fixed |
| P1-10 | P1 | Tables board unusable at 360–390px | ✅ Fixed |
| P1-11 | P1 | Kitchen fullscreen hides all notifications | ✅ Fixed |
| P2-1 | P2 | 362 instances of 9–11px type | ✅ Fixed |
| P2-2 | P2 | Emoji used as UI iconography | ✅ Fixed |
| P2-3 | P2 | Unify the sticky offsets | ✅ Fixed |
| P2-4 | P2 | `AnnouncementBar` gutter double the diner surface | ✅ Fixed |
| P2-5 | P2 | `useDialog` scroll lock doesn't hold on iOS | ✅ Fixed |
| P2-6 | P2 | Chat inputs override the global focus ring | ✅ Fixed |
| P2-7 | P2 | Checkout container 900px vs storefront 1440px | ✅ Fixed |
| P2-8 | P2 | Nested `min-h-dvh` on sign-in | ✅ Fixed |
| P2-9 | P2 | Three dead social "links" in the marketing footer | ✅ Fixed |
| P2-10 | P2 | Logo upload bypasses the brand-contrast gate | ✅ Fixed |

## Corrections to the audit

**The z-scale patch as written would not have worked.** §1.1 and §5 both give the
scale as `--z-raised: 10` etc., and state "Tailwind v4 exposes these as
`z-raised`". It does not: Tailwind v4 keys the `z-*` utilities off the
`--z-index` namespace. `--z-raised` defines a variable that generates no utility,
so every `z-raised` / `z-chrome` / `z-scrim` class would have been an unknown
class emitting nothing — leaving all 39 layers at `z-index: auto`. That is
strictly worse than the ties it replaces, and it fails **silently**: no build
error, no type error, only a visibly broken stacking order.

Adopted as `--z-index-*`, verified against the built CSS (all eight utilities
emit, all eight variables resolve), and pinned by
`test/z-layer-scale.test.ts` so the wrong namespace fails a test rather than a
page.

**Six z sites the audit's table missed**, found by enumerating rather than
trusting the list: a click-away catcher and its dropdown in `storefront.tsx`,
two menus in `studio-client.tsx`, one in `square-card.tsx`, and the marketplace
full-screen cart sheet. Each was given the name matching its role, preserving the
existing ordering.

**Already landed before this work started**, so not re-done: the shared
`<MarketingHeader>` that PR4 suggests extracting from four copies (done under
design-audit D4), and `controlClass`'s `padding` / `width` parameters that PR2's
diff assumes are absent.

**The audit named four inputs bypassing `controlClass`; there are ten.** A check
derived from the source — every `<input>`/`<textarea>` whose own className sets a
size below 16px — found six more: the **sign-in email field** (the very first
input a new owner touches), three in the admin shop overrides, and two in the
recipe editor. One of them is `text-xs`, so a list keyed to `text-sm` would have
missed it either way. Pinned by `test/ios-zoom-floor.test.ts`.

**Vendoring the audit added dead CSS.** Tailwind v4 auto-detects sources from
the project root, which includes `docs/**` — so the `diff` blocks quoting class
strings generated real utilities for code that was never applied, including a
`top-[calc(var(--p2e-header-h)+…)]` variant differing from the shipped one only
by its missing fallbacks. `@source not "../docs"` in `globals.css` fixes it
(~4KB). Dead CSS that looks live is worse than none: the next person greps the
bundle, finds the class, and believes it is in use.

## P2-10 was pointing at the wrong pairing — and the real defect is worse

The finding says `uploadVenueLogo` writes a brand colour "the settings form would
have rejected". Tracing what each value actually renders as says otherwise:

- `brandTextColor` overrides **`--color-ink`** (`app/[slug]/brand-style.ts`) — it
  is the venue's BODY TEXT on the cream page, not the label on a brand fill.
- the label on a brand fill is `--brand-contrast`, which `readableOn()` derives,
  so that pairing is safe by construction.

So `updateBrandTheme` was gating body text against the **brand** — a surface text
is never painted on. That inversion waved through precisely the worst case. With
the schema's default brand `#111827`, a near-white body text scores:

| Pairing | Ratio | |
| --- | --- | --- |
| text vs brand — what the gate measured | **16.22:1** | passes AA comfortably |
| text vs cream page — what the diner sees | **1.01:1** | invisible |

The gate now measures the text colour against both diner page surfaces and takes
the worse. The logo path is gated too — the derived colour becomes `--action`,
which IS painted as a foreground, and the only guard there was a luminance band
that is not a contrast check against anything.

## Deliberately left

- **`text-[8px]` (29) and `text-[13px]` (24)** — outside the finding's 9–11px
  range and not part of the micro scale it defines.
- **The `0063_discount_revision` migration** could be made tolerant of a missing
  column (option 3 in `docs/ops/Migrations.md`). Not done: adding a fallback to
  the money path to work around one deploy-sequencing decision is the wrong
  trade. It is flagged in the release checklist instead.
- **The "↻ Reorder" amber CTA** in the account order history, carried over from
  design-audit D1 as a judgement call. Resolved as legitimate: `globals.css`
  names the account "YOUR USUAL" hero as one of the two sanctioned forest-dark
  AI surfaces, alongside the concierge panel. Amber belongs there.

## Round 2 — four findings, all confirmed against source

A re-audit at `c7e96cb` verified 24 of the 26 above as genuinely closed, and
found **two that did not take effect** — including the originally reported bug.
Both are the same class: the fix was written, and the CSS custom property it
depends on never reached the element that reads it.

| # | Sev | Finding | Status |
| --- | --- | --- | --- |
| R2-1 | **P0** | FAB still overlaps the mobile bottom bar — `--p2e-bottom-bar-h` set on a node that is not an ancestor of the FAB | ✅ Fixed |
| R2-2 | P1 | `lg:` reset for that variable is dead — an inline style outranks it at every breakpoint | ✅ Fixed |
| R2-3 | P1 | Toast still lands on the sticky mobile dashboard header — nothing published `--p2e-header-h` there | ✅ Fixed |
| R2-4 | P2 | `support-widget.tsx` carried two conflicting `sm:` font sizes | ✅ Fixed |

**The mistake, stated plainly.** `<SupportWidget>` is a *sibling* of `<main>` in
`app/dashboard/layout.tsx`. The page's `<section>` — inside `<main>` — declared
`--p2e-bottom-bar-h: 72px` with an inline style. Custom properties inherit DOWN,
so it never arrived; `var(…, 0px)` always took the fallback and the FAB kept
sitting on the bar it was supposed to clear. On `/dashboard/marketplace` and
`/dashboard/studio` the reported overlap was unchanged.

`--p2e-header-h` failed the same way in the other direction: only the diner
storefront published it, so the toast viewport read `0px` on every owner page and
landed on the sticky mobile header that its own comment cites as its reason to
exist.

Both are now measured and published on `documentElement` via `useStickyMetric`,
which also removes two things the hard-coded version needed: the `lg:` reset (a
`lg:hidden` bar measures 0) and the manual `0px` guess (an unmounted bar clears
the property). The safe-area inset moved into the `var()` fallback — a measured
bar's height already includes its own inset, so adding both double-counted the
notch.

**Why four static guards missed it.** They check that the right tokens appear in
the right files. R2-1 and R2-3 are tree-reachability failures: the right string
is in the right file and does nothing, because the element setting it is not an
ancestor of the element reading it. `test/css-var-reach.test.ts` inverts that
into something static — these metrics are PUBLISHED, never DECLARED on a
component node; anything read must have a publisher; and a measured height is
never added to the inset it already contains. Three mutations verified.
