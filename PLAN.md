# prompt2eat — PLAN (reconciled to source, 2026-07-03)

> Authoritative, source-verified status of the repo. A fresh Claude Code session should be able to
> read this file + the codebase and have a complete, correct picture. Full historical design notes
> live in the session plan at `~/.claude/plans/cached-plotting-book.md`; this file is the ground truth.

## Repo state (verified)

- **main tip:** `2f9a1d6` — merge of PR #116 (E2d-3). Last 20 merges = PRs #97–#116.
- **Branches:** `origin/main` + `origin/claude/prompt2eat-ui-migration-147ilk` (the single dev branch).
  No other feature branches; **no open PRs**.
- **Migrations:** `drizzle/0000…0033` (latest **0033** = E2d-3 co-funding). CI `migrate-prod` applies
  additively on merge. Policy: additive-only.
- **Stack:** Next.js 16.2.9 (App Router), Drizzle + Neon, Tailwind v4, Auth.js v5 magic-link owner
  auth, firewalled per-venue customer identity, Stripe Connect Express **direct charges**
  (`stripe@22.2.3`), Anthropic (Opus import / Haiku concierge), Upstash rate-limit (fail-open), R2.
  Region syd1. `vercel.json` cron relaxed to daily `0 3 * * *` for Hobby (revert to `* * * * *` on Pro).

## Non-negotiable invariants (all HOLD as of main tip — source-verified)

1. **Diner order money path byte-for-byte.** `placeOrder` (`app/[slug]/checkout/actions.ts`) has NO
   promo/square/integration/payto/discount logic — verified clean. Order discounts are applied ONLY
   post-creation in `app/[slug]/checkout/discount-actions.ts` (updates the PaymentIntent + order
   after `placeOrder`). The Stripe order webhook's confirm UPDATE is byte-identical.
2. **Identity firewall.** `lib/auth.ts` has no customer/square/promo/integration references. Owner
   Auth.js and per-venue customer identity stay separate; Roster SSO is a one-time signed handoff.
3. **No customer-visible per-order fees.** All discounts are discount-only, server-recomputed, clamped;
   never a surcharge (RBA-safe).
4. **Additive migrations only** (0018–0033); every new surface is venue-scoped / IDOR-safe; secrets
   AES-256-GCM at rest (`lib/crypto.ts`), lazy-env (build passes with no env).

⚠ **Webhook nuance (updated):** the order webhook now has **TWO** additive, isolated, fully-swallowed
`after()` blocks *after* the byte-identical confirm UPDATE — (a) Track 0 integrations enqueue, and
(b) **D4b stock depletion** (`depleteStockForOrder`). Both are in their own try/catch and cannot
change the response; the cron sweeps re-derive either if the block is removed. (An earlier reviewer
model of "exactly ONE block" predates D4b — the second block was explicitly gated + approved.)

---

## CURRENT STATE — built & merged (source-verified PRESENT)

### Integration platform
- **Track 0 foundation** (PR #93) — `lib/crypto.ts` (AES-256-GCM), `lib/integrations/dispatch.ts`
  (outbox engine + backoff + maintainer hook), `app/api/jobs/integrations/route.ts` (CRON_SECRET-gated
  processor, also runs the stock-depletion sweep), `app/dashboard/integrations/page.tsx` hub, migration
  0018 (`venue_integrations` + `integration_jobs`). Sidebar + home tile.
- **Track A · Square connector** (PR #94, hotfix #95) — `lib/integrations/square/{client,oauth,mirror}.ts`,
  `app/api/integrations/square/callback` + `…/webhook`, OAuth + location mapping + order-mirror job +
  revocation webhook + live hub card states + detail drawer. Sandbox-gated (needs Square env + BD).
- **Track B · PayTo owner enablement** (PR #96 = 3a) — `venues.payto_enabled`, settings toggle
  (`payto-toggle.tsx`) requesting the `payto_payments` capability. PayTo appears in the existing
  PaymentElement via `automatic_payment_methods` (no money-path change). **Live at checkout** (user
  confirmed platform access approved).
- **Track B · PayTo diner UX** (PR #106 = 3b-i) — `?pm=` method hint on the confirm return_url;
  forest-dark "approve in your banking app" waiting screen; `payment-status-poller.tsx` `variant:
  default|bank` (bank = 6s/10-min, longer for PayTo out-of-band approval).
- **Track C · Roster SSO (p2e side)** (PR #97) — `lib/sso/roster.ts` (Ed25519 signed one-time JWS via
  `node:crypto`), `app/dashboard/apps/{page,launch-roster,actions}.tsx`, `docs/roster-sso-contract.md`
  (the Roster-side spec). Sidebar "Apps".
- **Track C · consolidated billing** (PR #98) — Roster add-on card, `subscription_items` add, and the
  `planFromSubscription` **item-scan FIX** (see Bugs — this is the FIXED form, not the bug).

### Track B · pay-by-bank discount (money-path-adjacent, gated)
- **3b-ii** (PR #107) — `venues.payto_discount_mode/value`, `orders.discount_cents`, owner discount
  form, and `discount-actions.ts` (server-recomputed discount on the PI post-creation). Later
  generalized into the unified recompute (see E2d-1).

### Track D · Stock suite + Suggestions
- **D1 ingredients** (#98-era) — `ingredients` table, library UI (0021).
- **D2 recipe & cost** — `recipe_lines` (0022), recipe editor in the item detail, `lib/stock/cost.ts`.
- **D3 invoice scan** (PR #101) — `app/dashboard/stock/scan/*` vision import → review gate → apply
  ingredient costs; `invoice_scans` history (0023). Amber = AI (sanctioned).
- **D4 perpetual inventory** — D4a ledger `stock_movements` + on-hand/par (0024, PR #102); **D4b
  auto-depletion** from confirmed orders (0025 partial-unique idempotency, PR #103 — the 2nd webhook
  block); D4c overview page (PR #104).
- **D5 Suggestions inbox** (PR #105) — `nudges` dismissals table (0026) + live-derived suggestions
  (reorder / uncosted / stale-cost / thin-margin), `/dashboard/stock/suggestions`.

### Track E · admin console + E2
- **Track E** (PR #108) — `lib/platform-admin.ts` (`PLATFORM_ADMIN_EMAILS` allowlist, fail-safe deny,
  404 for non-admins), `/admin` (venues directory + fleet integration health), `platform_settings` +
  `platform_audit_log` (0028), the D1 `square_fee_mode` switch.
- **E2a BI dashboard** (PR #112) — `/admin/stats` (KPIs, orders trend, plan mix, top venues, top/bottom
  customers by spend — labelled honestly; SVG/CSS, no chart dep).
- **E2b/E2c** (PR #113) — `/admin/venues/[id]`: admin menu-price edit + per-venue plan discount
  (Stripe coupon), `plan_discount_mode/value` (0030). Audited.
- **E2d promotions** (PRs #114/#115/#116) — `promotions` table + `promotion_venues` + enums (0031/0032),
  `orders.promo_discount_cents` / `applied_promo_id` / `platform_funded_cents` (0033). The apply is the
  **unified serialized recompute** (`applyOrderDiscounts` → `composeOrderDiscount` stacks promo+bank,
  clamps once, `.for("update")` row lock + PI-update idempotency key — NOT a naive clone).
  `/admin/promotions`: create/pause, per-venue targeting, budget cap (soft), new-customer audience,
  co-funding split → per-order `platform_funded_cents` liability (settled out of band).

### Track F · hardware marketplace
- **F1** (PR #111) — `app/dashboard/marketplace` (venue shop, request-to-order) + `app/admin/marketplace`
  (curation + fulfilment), `marketplace_products` / `marketplace_orders` / `marketplace_order_items`
  (0029). Invoice-later; no card charge (money path untouched).

### Track G · design studio
- **G1** (PR #109) — `app/dashboard/studio` (branded SVG menus + banners, multi-size, PNG/SVG/Print
  export, dependency-free). **G2** (PR #110) — share panel (Web Share API to social apps + Google
  hand-off + copy caption).

### Platform hygiene (verified present)
- `app/_components/toast.tsx` — **PRESENT** (resolves a parallel-session "missing" report).
- `lib/rate-limit.ts` fail-open Upstash; gates verified on: auth magic-link (`authIp`/`authEmail`),
  `placeOrder` (`checkoutIp`), `extractMenu` + invoice scan (`aiImport`), descriptions/tags (`aiCopy`),
  concierge (`aiConcierge`).
- `canUseConcierge` (`lib/concierge.ts`) is **plan-GATED** via `hasFeature(FEATURES.DINER_CONCIERGE)`:
  enabled for trial/pro/scale, **disabled for `free`/lapsed and no-plan venues**. Not ungated. No
  separate usage cap beyond the `aiConcierge` rate-limit bucket.

---

## BUGS (found in this audit)

- **[CONFIRMED] Menu editor stale-input bug.** `app/dashboard/menu/menu-editor.tsx` renders
  `<ItemDetail item={selectedItem} …>` (line ~253) and `<ItemForm categoryId=…>` (line ~251) with **no
  `key` prop**, and `item-detail.tsx` mounts `<ItemForm>` with no key. `ItemForm` uses **uncontrolled
  `defaultValue` inputs** (name/price/description) **+ `useState` seeded from props** (isAvailable,
  selectedTags) with no reset effect. Switching from item A → item B reuses the same `ItemForm`
  instance, so the fields show item A's stale values (and edits) instead of B's. Introduced by the
  master-detail refactor. **Fix (not applied — this was a read-only audit):** add
  `key={selectedItem?.id ?? "new"}` to the detail-pane child (or a key on `ItemForm`) to force a
  remount per item. NOT YET FIXED.
- **[NOT A BUG] `planFromSubscription`** (`lib/billing/sync.ts:75`) uses
  `subscription.items.data.find(item => planFromLookupKey(item.price.lookup_key) !== null)` — the
  **FIXED** form. It does NOT read `items.data[0]`. The consolidated-billing landmine is already
  handled. No action.

---

## OPEN ITEMS (planned / researched, NOT merged — no code yet)

- **Track H — QR pay-by-bank (QwikPay-style).** Researched (2026-07-03). Needs an NPP PayTo-initiation
  partner (**Zepto** recommended — direct NPP "Connected Institution", clean API + sandbox; alt Azupay/
  Monoova/Hello Clever; QwikPay is a closed-loop wallet). Compliance read: platform likely needs **no
  AFSL** using a licensed partner (confirm with partner + lawyer). Build shape (gated on partner + creds):
  `orders.payment_provider` discriminator + isolated partner webhook + **per-order dynamic QR** (static
  PayID QR rejected — no order linkage). Counter walk-up use case. **BLOCKED on BD partner decision.**
- **F2 — hardware Stripe *platform* checkout** (charge venues vs invoice-later). Buildable now; a new
  Stripe surface (platform charges, own webhook) separate from diner direct charges.
- **F3 — supplier product feed** (Nisbets / Reward Hospitality auto-import + stock). Needs supplier BD.
- **G3 — true OAuth social auto-post** to connected FB/IG/Google Business Profile. Gated on Meta app
  review + Google Business Profile API approval. Would reuse crypto + `venue_integrations` + outbox.
- **Studio v2 (user feedback 2026-07-04)** — the design studio:
  - ✅ FIXED (PR #118, merged): menu item names overrunning the price (now truncated to reserve
    price width); the "+N more" truncation now auto-fits the FULL menu (up to 4 columns on
    wide/signage; sheds descriptions then shrinks font to fit every item; "+N more" only as a last
    resort).
  - ✅ DONE — PR-b (this branch): **Logo / branding.** Venue logo now renders in the studio menu
    header + banner corner, on a white chip so it reads over any brand fill / transparent PNG. The
    logo is fetched server-side and inlined as a data: URI (bounded: 3s timeout, 2MB, raster types
    only; SVG excluded to keep the export clean) so the client PNG/print export never taints. Plus
    a real **logo upload** in Settings (server-side to R2, mirroring the menu-photo action; the
    paste-a-URL path stays as an alternative; the logo is owned by dedicated upload/URL/remove
    actions so a theme save can't clobber it). Plus **content flexibility** in the studio: pick which
    categories appear, toggle prices, toggle descriptions, toggle the logo. No schema, no writes to
    order data, money-path 0.
  - ✅ DONE — PR-c (this branch): **AI-copy banner (option A, user-chosen).** "✦ Generate with AI"
    on the studio banner mode → Haiku (MENU_COPY_MODEL, `studio/actions.ts::generateBannerCopy`)
    writes headline/subtext/offer from venue name + description + live menu highlights (read
    server-side) + an optional occasion prompt, into the editable fields; rendered in the existing
    branded banner (brand colour + logo + amber AI affordance). Metered via the `aiCopy` rate-limit
    bucket (fail-open); drafts only, never writes, never auto-invents a discount the owner didn't
    type. No new dependency, no migration, money-path 0.
    ⚠ REALITY CHECK — Claude writes TEXT, it does NOT paint raster images. Actual AI-generated
    imagery would need a 3rd-party image-gen API (external, gated) — registered as a separate future
    arc if the user later wants painted backgrounds.
- **E2d settlement transfers** — automated Stripe transfer/topup to pay venues the co-funded share
  (currently a tracked out-of-band liability). Future finance-infra arc.

## DECISION REGISTER (status)

- **D1 · Square non-Square-tender fee** — DIRECTION SET: switchable `square_fee_mode` (admin console,
  data-not-code). SHIPPED as a setting (default `absorbed`). Commercial terms = Square BD before real
  venues.
- **D5 · Roster tenant mapping** — DECIDED: email-level only. SHIPPED (SSO by verified email).
- **D6 · PayTo discount steering** — DECIDED + SHIPPED as 3b-ii (pay-by-bank discount) folded into the
  unified recompute.
- **D8 · Square dine-in mapping** — PICKUP/ASAP + `ticket_name "Table N"` (validate in sandbox).
- **D9 · Job trigger** — Vercel Cron (daily on Hobby) + post-response `after()` kicks. SHIPPED.
- **Promo fee policy** — OPEN: platform application fee is charged on the **discounted** total (we
  absorb the fee on discounted-away revenue), unlike Uber's pre-discount model. Currently "keep."
- **Track H partner** — OPEN (recommend Zepto).
- **Premium/Pro concierge cap** — concierge is plan-gated (trial/pro/scale) + rate-limited; no extra
  fair-use cap planned.

## DEFERRED (explicitly parked)

- PayTo one-tap saved mandate (returning-customer `off_session`).
- Square: payments-through-Square (`app_fee_money`) rail; catalog sync (`menu_item_external_refs`);
  refund mirroring (`charge.refunded` → `refund_mirror`).
- Deferred UI from the design migration: interstitial upsell, kitchen ticket drawer, payouts KPIs,
  plan-comparison grid, live table-session status, branded table tents.

---

## USER ACTION REGISTER (pending on the operator — not code)

**Env (Vercel Production):** `PLATFORM_ADMIN_EMAILS` (⚠ required or `/admin` 404s — likely unset) ·
`INTEGRATION_TOKEN_KEY` · `CRON_SECRET` · `SQUARE_APPLICATION_ID/SECRET`, `SQUARE_ENVIRONMENT=sandbox`,
`SQUARE_WEBHOOK_SIGNATURE_KEY` · `ROSTER_SSO_PRIVATE_KEY` + `ROSTER_SSO_URL` (reported added).
**Dashboards:** Square Developer Console app (redirect + webhook URLs) · confirm Stripe
`roster_monthly/roster_annual` lookup keys. **BD:** Square fee terms · Track H NPP partner · F3 supplier
feed · G3 Meta/Google approvals. **Testing:** PayTo test PayID · promotions stacking · seed marketplace
catalog · click-through Stock/Studio/Admin. **Roster repo (separate session):** implement
`docs/roster-sso-contract.md`.
