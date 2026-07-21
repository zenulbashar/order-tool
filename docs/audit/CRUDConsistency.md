# CRUD Consistency

Owner-facing entities reviewed: menu (categories/items/groups/options/variants),
tables, stations, discounts, gift cards, promotions (admin), marketplace products
(admin), stock ingredients, media images.

## Confirmation on destructive actions — Fixed

There is a shared `ConfirmSubmit` primitive (now in `app/_components/`) that the
menu module already used consistently. Four entities bypassed it and destroyed
data on a single click; all now confirm:

| Entity | Action | Before | After |
| --- | --- | --- | --- |
| Table | Delete | plain submit | `ConfirmSubmit` (confirm + destructive variant) |
| Station | Delete | plain submit | `ConfirmSubmit` |
| Gift card | Void | `ghost` Button | `ConfirmSubmit` |
| Library image | Delete | icon submit | icon button + confirm (keeps overlay) |

Menu deletes, stock deletes, and integration disconnects already confirmed.

## Empty / loading / error states — consistent (one gap)

Empty states are handled uniformly (a `Card`/dashed panel with guidance) across
discounts, media, gift-cards, stations, admin marketplace, and admin promotions.
Loading uses the shared `Spinner`/`Button loading`. **Gap:** the tables board has
no explanatory empty state — with zero tables it silently auto-opens the add
card. Recommend a first-run message for parity (low priority).

## Removal-policy divergence — Recommended

Comparable owner entities have three different removal semantics, which is
confusing:

- **Soft toggle only** (can pause, never remove): discounts, admin promotions,
  admin marketplace products.
- **Hard delete**: tables, stations.
- **Void** (irreversible): gift cards.

And some value-bearing entities have **no edit path** (discounts, gift cards) — a
mistyped code/value can only be paused/voided and recreated, whereas
tables/stations/products can be edited.

**Recommendation:** converge on one policy — e.g. *archive + confirm* everywhere
(reversible), plus an edit path for every value-bearing entity. This is a product
decision, so it's left as a recommendation rather than an auto-fix.

## Audit logging

Platform-admin actions write `platform_audit_log` rows. Owner-level mutations are
not audit-logged; if per-venue action history is a product goal, that's a
schema-level addition (see TechnicalDebt.md).
