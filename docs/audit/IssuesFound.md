# Issues Found

Consolidated, verified findings from four parallel specialist audits
(security, correctness, accessibility, design-system/CRUD). Each was confirmed
by reading the source. Severity: Critical → High → Medium → Low.
Status is tracked in IssuesResolved.md / RemainingRecommendations.md.

## Correctness (money path)

| # | Severity | Area | Finding | Status |
| --- | --- | --- | --- | --- |
| C1 | High | Square mirror | Line items carry full snapshot prices, so Square computed `total_money` = the **subtotal**; the equality assertion then rejected **every discounted order** (job retries → dead, integration → needs_attention). | ✅ Fixed |
| C2 | Medium | Checkout / GST | `applyOrderDiscounts` lowered `totalCents` but never re-snapshotted `taxCents`, overstating the inclusive-GST component on receipts **and** in the owner's BAS report (`reports` aggregates `orders.tax_cents`). | ✅ Fixed |
| C3 | Medium | Gift cards | Redemption amount was derived from an **unlocked** availability read; two orders applying the same card concurrently could each reserve the full balance (bearer-instrument double-spend). | ✅ Fixed |
| C4 | Low | Stock | `"set"` stocktake read `on_hand` outside the transaction, then applied a delta — a concurrent depletion between read and write corrupts the count. | ✅ Fixed |
| C5 | Low | Email receipt | Order-confirmation email lists full-price line items against a discounted Total with no discount line, so the rows don't reconcile to the Total. | 🔶 Recommended |

## Security

| # | Severity | Area | Finding | Status |
| --- | --- | --- | --- | --- |
| S1 | Low | Admin action | `setVenueItemPrice` UPDATE was scoped to `itemId` only (venue checked *after* the write, gating just the audit row) despite a comment claiming otherwise — a mismatched id edited the wrong tenant and skipped the audit entry. | ✅ Fixed |
| S2 | Low–Med | Auth | Owner magic-link is rate-limited in the sign-in **action**, but the underlying NextAuth Resend provider is reachable directly at `POST /api/auth/signin/resend`, bypassing the app limiter (relies on edge rules). | 🔶 Recommended |
| S3 | Low | Rate-limit | `clientIpFromHeaders` trusts the **left-most** `X-Forwarded-For`, which is attacker-prependable on some platforms → per-IP limit evasion. Deployment-dependent. | 🔶 Recommended |

**Verdict:** tenant isolation, webhook signature verification, the money path,
customer-identity firewall, CSRF/XSS/SQLi, secrets, and uploads were all audited
and found **correctly enforced**. No Critical/High security issues.

## Accessibility (WCAG 2.2 AA)

| # | Severity | Finding | Status |
| --- | --- | --- | --- |
| A1 | High | 8 hand-rolled dialogs: no focus trap, no initial focus, no focus restoration. | ✅ Fixed (7/8) |
| A2 | Medium | Escape-to-close present on only one dialog. | ✅ Fixed (7/8) |
| A3 | Medium | Concierge "Add all" forced `text-white` on raw `--brand` (contrast fails on light brands). | ✅ Fixed |
| A4 | Medium | `Segmented` declared `radiogroup` but lacked the roving-tabindex/arrow keyboard model. | ✅ Fixed |
| A5 | Medium | `Field` didn't link error/hint to the control (`aria-describedby`/`aria-invalid`). | ✅ Fixed |

(Full detail + the compliant-area list in Accessibility.md.)

## Design system

| # | Severity | Finding | Status |
| --- | --- | --- | --- |
| D1 | Medium | Firewall violation: amber (`--color-accent`, AI-only) used as a functional CTA fill in tables/promotions/marketplace; `bg-forest`/`text-white` hardcoded instead of `--action`. | ◑ Partial (Add-table fixed) |
| D2 | Medium | ~12 files copy-paste the `controlClass` recipe onto raw `<input>/<select>/<textarea>` instead of using `<Input>/<Select>/<Field>`. | 🔶 Recommended |
| D3 | Low | `text-[9px]` micro-label string duplicated in ~20 files (no sub-`text-xs` token). | 🔶 Recommended |
| D4 | Low | One-off buttons re-implement `buttonStyles(...)`; hand-rolled segmented controls and page headers bypass `<Segmented>`/`<PageHeader>`; arbitrary radii (`rounded-[14px]` etc.) where tokens exist. | 🔶 Recommended |
| D5 | Low | Shop/landing surfaces write token hex values literally (`text-[#16241C]` → `text-ink`). | 🔶 Recommended |

## CRUD consistency

| # | Severity | Finding | Status |
| --- | --- | --- | --- |
| R1 | High | Four destructive owner actions had **no confirmation**: delete table, delete station, void gift card, delete library image. | ✅ Fixed |
| R2 | Medium | Destructive controls styled ad-hoc instead of the `destructive` Button variant. | ✅ Fixed (same 4) |
| R3 | Medium | No consistent removal policy across entities: soft-toggle (discounts/promotions/products) vs hard-delete (tables/stations) vs void (gift cards); some value-bearing entities have no edit path. | 🔶 Recommended |
| R4 | Low | Tables board has no explanatory empty state (auto-opens the add card instead). | 🔶 Recommended |

Empty/loading/error states were otherwise found **consistent** across owner lists.
