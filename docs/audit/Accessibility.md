# Accessibility Audit — WCAG 2.2 AA

Scope: every shared primitive in `app/_components/`, all hand-rolled dialogs /
drawers / sheets, toggles/switches, form fields, images, and interactive
elements across the App Router tree.

## Headline

The product is already strong on accessibility fundamentals: icon-only buttons
require an `aria-label` at the **type level** (`IconButton`/`Button`), every
`<img>` carries `alt`, toggles use `role="switch"` + `aria-checked` + a name,
status is never colour-only (`StatusBadge` always renders text), a global
`:focus-visible` ring covers links/buttons, and primary touch targets meet the
44px floor. The defects were concentrated in one place — **modal semantics** —
plus two primitive gaps.

## Findings & remediation

| # | Finding | WCAG | Severity | Status |
| --- | --- | --- | --- | --- |
| 1 | Hand-rolled dialogs (8) had no focus trap, no initial focus, no focus restoration | 2.4.3, 4.1.2 | High | **Fixed** (7/8) |
| 2 | Escape-to-close inconsistent across dialogs | 2.1.1 | Medium | **Fixed** (7/8) |
| 3 | Concierge "Add all" forced `text-white` on raw `--brand` (contrast on light brands) | 1.4.3 | Medium | **Fixed** |
| 4 | `Segmented` declared `radiogroup` but lacked the radiogroup keyboard model | 4.1.2, 2.1.1 | Medium | **Fixed** |
| 5 | `Field` didn't link error/hint to the control (`aria-describedby`/`aria-invalid`) | 3.3.1, 1.3.1 | Medium | **Fixed** |

### 1 & 2 — Modal semantics (the systemic fix)

There was no shared `Dialog` primitive; each surface re-implemented its own
`fixed inset-0` backdrop + panel. All correctly set `role="dialog"
aria-modal="true"` and an `aria-label`, but `aria-modal` only *hints* that the
background is inert — a keyboard user could still Tab out of the panel into the
scrim-obscured page, focus was never moved into the dialog on open, and it was
never returned to the trigger on close. Only one drawer implemented Escape.

**Remediation:** a new hook, `app/_components/use-dialog.ts`, gives every dialog
the full ARIA dialog keyboard contract without forcing a shared visual shell
(the surfaces are genuinely different — bottom sheet, right drawer, docked
assistant, centred modal):

- move focus into the panel on open (first focusable, else the panel);
- trap Tab / Shift+Tab within the panel;
- close on Escape (panel-scoped, so nested dialogs behave);
- restore focus to the trigger on close;
- lock background scroll while open.

Migrated: `item-modifier-sheet`, `cart-review`, `concierge/multi-item-picker`,
`concierge/concierge-panel`, `recommendations` (pre-checkout upsell),
`dashboard/orders/ticket-drawer`, `dashboard/support-widget`. Per-site scroll-lock
and ad-hoc Escape effects were removed in favour of the hook.

**Remaining:** `dashboard/integrations/detail-drawer.tsx` is a **navigation**
drawer (it closes by `<Link>` back to a plain URL, not an `onClose` callback), so
it doesn't fit the callback-based hook cleanly. Tracked in
RemainingRecommendations.md — the fix is to give it a router-based close so the
same hook applies.

### 3 — Brand contrast

`multi-item-picker` filled the "Add all" CTA with `var(--brand)` and hardcoded
`text-white`; a light venue brand would fail 4.5:1. Now uses
`text-[var(--brand-contrast)]`, the token designated as the readable companion to
`--brand` — consistent with how the shared primary `Button` pairs
`--action`/`--action-contrast`.

### 4 — Segmented keyboard model

`Segmented` announced `role="radiogroup"` with `role="radio"` segments but every
segment was an independent Tab stop and arrows did nothing — contradicting what
AT tells the user. Now implements the WAI-ARIA radiogroup pattern: roving
tabindex (one Tab stop) + Arrow/Home/End to move selection. Click and Enter/Space
still work.

### 5 — Field error/hint association

`Field` rendered the error only as a transient `role="alert"` with no
programmatic link to the control. It now derives a deterministic id from
`htmlFor` (kept hook-free/server-safe) and forwards `aria-describedby` +
`aria-invalid` onto the wrapped control by cloning it — so the message is
announced whenever focus returns to the field, for every form built on `Field`.

## Verified compliant (no change needed)

Icon-only button names; `<img>` alt text; switch roles; toast `role`/`aria-live`;
`StatusBadge` text labels; the single `div[role="button"]` (has `tabIndex` +
Enter/Space); global focus-visible ring; 44px touch targets. Details in the
finding log above.

## Not statically verifiable here

Screen-reader pass (VoiceOver/NVDA/TalkBack), real contrast sampling across
tenant brand colours, and reduced-motion behaviour in a live browser — these need
runtime testing and are listed in ReleaseChecklist.md.
