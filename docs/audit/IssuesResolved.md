# Issues Resolved

Every fix below is committed on `claude/complete-product-audit-llzifa` and
passes `typecheck` + `lint` + `build` (the CI gates). Grouped by the commit
that shipped it.

## Commit 1 — Accessibility (`fix(a11y): shared dialog focus-trap + …`)

- **A1/A2 — dialog modal semantics.** New `app/_components/use-dialog.ts` hook:
  focus into panel on open, Tab/Shift+Tab trap, Escape-to-close (panel-scoped for
  nesting), focus restoration to the trigger, background scroll-lock. Migrated 7
  dialogs: `item-modifier-sheet`, `cart-review`, `concierge/multi-item-picker`,
  `concierge/concierge-panel`, `recommendations` (pre-checkout upsell),
  `orders/ticket-drawer`, `dashboard/support-widget`. Removed their ad-hoc
  scroll-lock/Escape effects.
- **A4 — `Segmented`** now implements the radiogroup keyboard model (roving
  tabindex + Arrow/Home/End).
- **A5 — `Field`** now forwards `aria-describedby` + `aria-invalid` to the wrapped
  control (deterministic id from `htmlFor`; stays server-safe).
- **A3 — contrast:** concierge "Add all" uses `text-[var(--brand-contrast)]`.

## Commit 2 — Correctness & security (`fix(orders): propagate discounts …`)

- **C2 — GST:** `applyOrderDiscounts` recomputes `taxCents` off the discounted
  total (inclusive model → charge unchanged); fixes receipt + BAS report.
- **C3 — gift-card double-spend:** redemption re-derived under a `giftCards`
  `FOR UPDATE` lock inside the existing transaction; finals composed from the
  locked amount. Lock order (orders→giftCards here; giftCardLedger→giftCards on
  debit) has no cross-path cycle. Reducing the card amount only raises the charge,
  so it stays ≥ Stripe's minimum.
- **C1 — Square mirror:** the composed order discount is mirrored as one
  order-scoped `FIXED_AMOUNT` discount so Square's `total_money` equals
  `order.totalCents`. Payload-only; the Stripe charge is untouched.
- **C4 — stocktake:** `"set"` reads `on_hand` under `FOR UPDATE` inside the tx.
- **S1 — admin price:** `setVenueItemPrice` scopes the UPDATE by `venueId` in the
  WHERE, not just a post-write check.

> **Review note:** C3 and C4 change locking on the money path. They are correct
> by construction and pass CI, but merit a staging concurrency check before merge.

## Commit 3 — CRUD safety & firewall (`fix(crud): confirm every destructive …`)

- **R1/R2 — confirmation on destructive actions.** Promoted `ConfirmSubmit` to
  `app/_components/` (updated the two menu imports). Gated delete-table,
  delete-station, and void-gift-card with it (confirm + destructive variant). The
  media delete keeps its icon-overlay look via a dedicated confirm button.
- **D1 (partial) — firewall:** "Add table" CTA now uses `var(--action)` /
  `var(--action-contrast)` instead of hardcoded `bg-forest`/`text-white`
  (visually identical on owner surfaces, no longer bypasses the accent firewall).

## Also shipped

- `docs/audit/*` — the full audit deliverable set (inventory, architecture, and
  the per-dimension reports).
