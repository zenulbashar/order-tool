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
| RC-6 | — | Toast system built, never mounted | ⬜ PR5 |
| P0-1 | P0 | Support FAB overlaps the mobile nav drawer *(reported)* | ✅ Fixed |
| P0-2 | P0 | Support FAB covers both mobile bottom action bars | ✅ Fixed |
| P0-3 | P0 | No bottom reserve on any dashboard page | ✅ Fixed |
| P0-4 | P0 | Safe-area insets dead | ✅ Fixed |
| P0-5 | P0 | Every text input triggers iOS auto-zoom | ✅ Fixed |
| P1-1 | P1 | Concierge FAB covers the storefront footer at `lg` | ✅ Fixed |
| P1-2 | P1 | Mobile category anchors land under the sticky strip | ✅ Fixed |
| P1-3 | P1 | Desktop menu cards have ragged bottoms | ⬜ PR5 |
| P1-4 | P1 | Marketing nav has no mobile treatment | ⬜ PR4 |
| P1-5 | P1 | `Segmented` is ~30px on the checkout path | ✅ Fixed |
| P1-6 | P1 | `PageHeader` crushes the title on narrow phones | ⬜ PR5 |
| P1-7 | P1 | Admin console has no mobile layout | ⬜ PR4 |
| P1-8 | P1 | No save feedback anywhere (toasts unmounted) | ⬜ PR5 |
| P1-9 | P1 | Account nav: 36px targets, no scroll affordance | ✅ Fixed |
| P1-10 | P1 | Tables board unusable at 360–390px | ⬜ PR5 |
| P1-11 | P1 | Kitchen fullscreen hides all notifications | ⬜ PR5 |
| P2-1 | P2 | 362 instances of 9–11px type | ⬜ PR6 |
| P2-2 | P2 | Emoji used as UI iconography | ⬜ PR6 |
| P2-3 | P2 | Unify the sticky offsets | ✅ Fixed |
| P2-4 | P2 | `AnnouncementBar` gutter double the diner surface | ⬜ PR6 |
| P2-5 | P2 | `useDialog` scroll lock doesn't hold on iOS | ⬜ PR6 |
| P2-6 | P2 | Chat inputs override the global focus ring | ⬜ PR6 |
| P2-7 | P2 | Checkout container 900px vs storefront 1440px | ⬜ PR6 |
| P2-8 | P2 | Nested `min-h-dvh` on sign-in | ⬜ PR6 |
| P2-9 | P2 | Three dead social "links" in the marketing footer | ⬜ PR6 |
| P2-10 | P2 | Logo upload bypasses the brand-contrast gate | ⬜ PR6 |

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
