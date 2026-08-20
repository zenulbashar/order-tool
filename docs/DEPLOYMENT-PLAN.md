# prompt2eat — Deployment Plan

**Compiled:** 2026-08-03 · **Against:** `main` @ `23682e1` (merge of PR #244) · **Migrations:** 0000–0063

This plan sequences everything needed to take prompt2eat from "built and hardened" to
"taking real money", and then ranks what to build next. Every claim is verified against
the repo at the commit above, or explicitly marked `UNVERIFIED`.

---

## 0. Scope, sources, and what could NOT be checked

**Sources used:** the repo at `23682e1`; the full GitHub PR record (#1–#244); GitHub Actions
run history; `docs/audit/*`, `docs/ops/*`, `PLAN.md`, `README.md`, `.env.example`; and the
supplied `prompt2eat Complete Product Record (v2)`.

**Explicitly NOT available, and therefore not a source:**

- **Prior Claude Code and Claude chat sessions cannot be read.** No transcripts exist on this
  machine (`~/.claude/projects/` holds only this session). The product record markdown is a
  *compiled human summary* of those conversations and is the only proxy for them. It has a
  measurable error rate — see §3 — so it is treated as a claim source, never as truth.
- **Vercel project state.** No repo artifact proves which env vars are set, or which plan the
  project is on. Every "this is off" below means *"the code is off unless someone set this in
  Vercel"*. `docs/audit/ReleaseChecklist.md:41` says the same thing.
- **Stripe Dashboard state.** Which Price objects, webhooks, and capabilities exist is
  unverifiable from here.
- **Local git history is a shallow clone** (reaches back only to 2026-07-21 / PR #195).
  Anything older was read through the GitHub API.

---

## 1. Verified current state

prompt2eat is a feature-complete, heavily-hardened multi-tenant hospitality ordering platform
that **has never taken a real dollar**.

| Fact | Evidence |
|---|---|
| 244 PRs, **all merged**, zero closed-unmerged, zero reverts | GitHub API, three paginated passes over #1–#244 |
| Built in ~43 days (first merge 2026-06-21, last 2026-08-02) | GitHub API |
| **Prod DB schema is CURRENT through 0063** | CI run **#504**, sha `23682e1`, job *Migrate prod (additive only)* → step *Apply additive migrations* **succeeded 2026-08-02T21:54:05Z**. Run #454 (PR #220, which introduced 0063) also succeeded. |
| Migrations **auto-apply with no human gate** | `ci.yml:63-72` declares `environment: production`, but no required reviewer is configured, so the job runs unblocked (started 8s after E2E). |
| Test suite green | `npm test` → **51 files, 403 tests, all passing**. `npm run typecheck` clean. |
| Stripe is in **TEST mode by design** | `README.md`, `.env.example:44-47`. There is **no mode flag in code** — nothing rejects a test key in production. |
| Feature work stopped **2026-07-24** | PRs #204–#244 are audit / security / a11y / UI-debt only. |
| ~20 capabilities are **built but dormant** | §5 |

**Scale of what exists:** menu CRUD with sizes/modifiers/photos/tags · storefront with cart and
AI concierge · Stripe Connect Express **direct charges** on each venue's own account (platform fee
1.75% + $0.30 as a separate `application_fee_amount`, never a diner-visible surcharge) ·
webhook-only order confirmation · kitchen board with stations/timers · refunds with compensation ·
perpetual stock · loyalty · gift cards · promotions · inclusive GST · reports · staff RBAC ·
merchant audit log · platform admin console · Square POS outbox · design studio · hardware
marketplace · SEO/AEO studio · SMS + WhatsApp notifications · Playwright E2E + axe-in-CI.

---

## 2. The single most important thing in this document

> **Register the live ORDER webhook as a *Connect* endpoint ("Events on connected accounts"),
> with FOUR events: `payment_intent.succeeded`, `payment_intent.payment_failed`,
> `charge.refunded`, `charge.refund.updated`.**

Every diner charge is a **direct charge on the connected account**, so the events originate
*there*. Register a plain platform endpoint and it receives **nothing** — orders sit in
`pending_payment` forever, are excluded from the kitchen board, and **no error fires anywhere**.

`README.md:152` — the repo's only registration instruction — lists only the two
`payment_intent.*` events. Omit the two `charge.*` events and Dashboard-issued refunds move real
cash while the app records nothing: no `refunds` row, order stays `confirmed`, loyalty never
reversed, gift-card value never returned, stock never restocked, net revenue overstated. There is
**no reconciliation sweep** for out-of-band refunds — `reconcileRefundsForPaymentIntent` has
exactly one caller.

---

## 3. Corrections to the product record

The record is a compiled human document with a real error rate. **§3.8 "Explicitly deferred" is
the least reliable section** — at least 9 of ~25 items are actually built. **§3.1, §3.4–3.7 and
§3.9 were accurate on every item checked.**

| Record claim | Reality | Evidence |
|---|---|---|
| §6.1 "**⚠️ VERIFY 0063 applied in prod** — until then every promo/gift card silently stops applying" — listed as the #1 urgent item | **Already applied.** Prod is current through 0063. | CI run #504 (and #454), step *Apply additive migrations* succeeded |
| "`migrate-prod` waits behind a human gate" | **False.** The `production` environment has no required reviewer; migrations auto-apply. | `ci.yml:63-72` + run timings. `ReleaseChecklist.md:69-78` is **wrong** on this. (`ops/Migrations.md:24-35` is *correct* — it states plainly that the gate is "declared but **inert**" and documents how to arm it, though its later worked examples at `:87-113` reason as if a reviewer were already configured.) |
| "`.env.example` missing ~15 real vars" | **Stale — gap is closed.** All 58 code-referenced vars accounted for (52 operator-settable documented; 6 are Vercel-injected). Pinned by a passing test. | `test/env-example-complete.test.ts`. Residual: `NEXT_RUNTIME` (`instrumentation.ts:17,28`) is undocumented because the test scans only `app/lib/mobile/scripts`, not root files. |
| §3.2 "F2 hardware marketplace Stripe checkout — not started" | **BUILT end to end.** | `app/dashboard/marketplace/actions.ts:134-153` creates a `mode:"payment"` Checkout Session; `billing-webhook/route.ts:65-66` comment literally names "Track F2"; migration 0047 |
| §3.2 "FAQ/content section with FAQ structured data — not started" | **BUILT.** 10 FAQs + FAQPage JSON-LD from the same array, plus a `/learn` hub (6 articles) and `/for/[segment]`. City pages **are** genuinely absent. | `app/_landing/faq-section.tsx`, `lib/marketing-content.ts:14`, `marketing-json-ld.tsx:84-90` |
| §3.8 "deferred UI (6 items)" | **All 6 BUILT** — interstitial upsell, kitchen ticket drawer, payouts KPIs, plan-comparison grid, live table-session status, branded table tents. | `recommendations.tsx:230`, `ticket-drawer.tsx:21`, `payments/page.tsx:180-244`, `plan-comparison.tsx:11`, `tables-board.tsx:151-158, 70-130` |
| §3.8 "frequently-bought-together", "AI allergen tagging" | **Both BUILT.** Real cached co-occurrence self-join feeding **3** live surfaces (modifier sheet, cart rail, cart review); 7-tag controlled vocabulary behind an owner accept gate. | `app/[slug]/queries.ts:383-464`; `item-modifier-sheet.tsx:140`, `cart-rail.tsx:121`, `cart-review.tsx:148`; `menu/tag-actions.ts:18-26`. **Bonus finding:** a fourth component, `CartUpsell` (`recommendations.tsx:203`), is exported but **never imported anywhere** — dead code. |
| "three conflicting pricing versions" | **Two vocabularies in code, not three.** Billing = `pro`/`scale`. Marketing = Starter/Growth/Pro. The third is whatever sits on the Stripe Prices, which the code deliberately never reads for plan selection. **"Premium" appears nowhere in code** — its only surviving mention is the stale `PLAN.md:232`. | §4 / C1 below |
| "gift cards gated like loyalty" | **False — gift cards have NO gate at all.** No flag, no env, no plan check. Live the moment an owner issues one. | zero hits for `giftCardsEnabled`; `discount-actions.ts:182-201` |
| §4.3 "table QR with visible number — not built" | **Substantially met** — the number renders above the QR on tents and grid cards. Only the *centre-island overlay* variant is unbuilt. | `tables-board.tsx:112-124, 276`; `lib/qr.ts:27-34` |
| §3.1 "Track H QR pay-by-bank" blocked | **Split verdict.** Pay-by-bank already ships via Stripe **PayTo**. Track H *as specified* (licensed NPP partner rail) is absent: no `orders.payment_provider` column, no partner webhook, no per-order dynamic QR. | zero hits across schema + all 64 migrations |

**The record also omits an entire shipped subsystem:** customer **SMS + WhatsApp order
notifications** (`lib/sms.ts`, `lib/whatsapp.ts`, `docs/notifications-setup.md`), with a complete
operator runbook. It appears nowhere in the record.

**Confirmed genuinely absent (record accurate):** walk-in waitlist/queue · NFC · voice kiosk ·
AI phone ordering · Xero · Google Drive · E2d settlement transfers · US exclusive tax · owner GST
line on order card · "Order with Google" · F3 supplier feed · G3 OAuth auto-post · Doshii /
Ordermentum (both render as honest disabled "Coming soon" cards) · CloudPRNT · PWA/web push ·
subdomain-per-tenant · agent/MCP interface · reviews/ratings · auto-translated menus · VPS
migration and the prerequisite `pg` driver swap.

---

## 4. Critical path to the first real dollar

Ordered by hard dependency. `[OP]` = operator in a dashboard · `[CODE]` = a PR · `[DATA]` = SQL.

### Phase A — Foundation

| # | Step | Who | Why this order |
|---|---|---|---|
| A1 | **Confirm the Vercel plan.** Hobby prohibits commercial use; a paid SaaS taking Stripe money is commercial. Also governs cron cadence and function duration. | `[OP]` | A terms blocker independent of any technical limit. *Plan status is UNVERIFIED — evidence is only that `vercel.json` is still shaped to Hobby.* |
| A2 | **Attach `prompt2eat.com`; DNS live; wait for "Valid Configuration".** | `[OP]` | Precedes anything that bakes a URL: A3, A6, B4/B5, Square redirect. |
| A3 | **Verify the sending domain in Resend.** | `[OP]` | A4. `.env.example:12-13`: must be a verified sender "or sends will fail". The app-side throw covers *unset*, not *unverified*. |
| A4 | **Set `RESEND_API_KEY` + `EMAIL_FROM`.** | `[OP]` | **Resend is the ONLY auth provider** (`lib/auth.ts:5,24-25`) — no password, no OAuth. Get this wrong and *nobody can sign in at all*. |
| A5 | **Set `AUTH_SECRET` and `DATABASE_URL`** (pooled Neon URL). | `[OP]` | `AUTH_SECRET` is the only true boot requirement. `DATABASE_URL` is lazy, so the build passes and the first query dies instead. |
| A6 | **Set `AUTH_URL=https://prompt2eat.com`.** | `[OP]` | Load-bearing for magic-link branding, **Stripe Connect return/refresh URLs**, and **Square webhook HMAC** (the expected signature is computed over `getBaseUrl() + path`; a mismatch returns **400 "Invalid signature."** on every delivery while the integration still looks healthy — `square/webhook/route.ts:34-42`). Must follow A2. |
| A7 | **Set `PLATFORM_ADMIN_EMAILS`.** | `[OP]` | Empty allowlist → `notFound()` for everyone, **no error, no log line**. There is no bootstrap or seed — this env var is the only way in. Unblocks all 7 `/admin` routes, which are the only writers of `marketplace_products` and platform promotions. |
| A8 | **Set `CRON_SECRET`.** | `[OP]` | Both job routes 503 *before* any work or reporting. Because no run succeeds, **no watermark row is written**, so the sweep lookback stays pinned at the 72h floor — anything older than 72h when the secret is finally added is never swept. |
| A9 | **Set `UPSTASH_REDIS_REST_URL` + `_TOKEN`.** | `[OP]` | The limiter **fails open by design** (`lib/rate-limit.ts:26-31`) — unset means sign-in, AI and checkout have *no* application rate limiting, silently. |
| A10 | **Set `SENTRY_DSN`; create the project and THREE alert rules** (`integration_job_dead_letter`, `sweep_backlog`, `charge_amount_mismatch`). | `[OP]` | Without it the SDK is never imported and every capture returns immediately. **The thing that would report the other silent failures is itself silently off.** |
| A11 | **Set `ANTHROPIC_API_KEY`, `R2_*`, `INTEGRATION_TOKEN_KEY`.** | `[OP]` | AI concierge + all owner AI; menu photos; encrypted integration tokens. |

### Phase B — Stripe live cutover

| # | Step | Who | Why this order |
|---|---|---|---|
| B1 | **Activate the platform Stripe account: live, AU, Connect Express enabled.** | `[OP]` | Real KYC with external lead time. Gates everything below. |
| B2 | **Create SIX live Price objects** with these exact lookup keys: `pro_monthly`, `pro_annual`, `scale_monthly`, `scale_annual`, `roster_monthly`, `roster_annual`. | `[OP]` | Must exist **before** B3. `resolvePriceIdByLookupKey` throws on a miss and a **bare catch** swallows it into `?error=checkout` — no log, no Sentry. |
| B3 | **Swap `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` to `sk_live_` / `pk_live_`; redeploy.** | `[OP]` | These are the only two Stripe key vars. There is no mode flag and no guard against a test key in prod. |
| B4 | **Register the ORDER webhook — *Connect* endpoint, FOUR events.** See §2. | `[OP]` | **The highest-stakes step in this plan.** |
| B5 | **Register the BILLING webhook — *platform* endpoint**, SIX events: `checkout.session.completed`, `customer.subscription.created`/`.updated`/`.deleted`, `invoice.paid`, `invoice.payment_failed`. | `[OP]` | **No document in the repo lists these.** `checkout.session.completed` is the irreplaceable one — the only writer that moves a `marketplace_orders` row out of `pending_payment`, with no reconciliation sweep. |
| B6 | **Clear test-mode Stripe ids on every venue row:** `stripe_account_id`, `stripe_customer_id`, `stripe_subscription_id`, `stripe_charges_enabled`. | `[DATA]` | Stripe ids are mode-scoped. Without this, `placeOrder` passes its gate (it reads a **mirrored boolean**, never re-checked against Stripe), writes the order, **then** fails at `paymentIntents.create` — orphan `pending_payment` row + a generic error. Re-onboarding *is* a supported path (`connectStripe` short-circuits only the account-*creation* branch, then unconditionally builds an Account Link — "start **or resume**"), but with a stale test-mode id `accountLinks.create` throws under a live key and the bare catch at `payments/actions.ts:61-63` rewrites the destination to `?error=connect` — so the owner just sees a generic failure. |
| B7 | **Every venue re-onboards through Connect Express** (live KYC). | `[OP]`+venue | Depends on A6 and B6. |
| B8 | *(Optional — degrades gracefully)* **Register the Apple Pay `payment_method_domain` per connected account.** | `[OP]` | Zero code exists for this; the API call lives only in a README block. Skipping it just hides the Apple Pay button. |

### Phase C — Truth-in-advertising (must land before the site is public with live keys)

These are minutes of work each, and each becomes material misrepresentation once real money moves.

| # | Step | Who | Why |
|---|---|---|---|
| C1 | **Fix the landing pricing block** (`app/_landing/landing.tsx:453-456`). It advertises **Starter $0 / Growth $89 "Most popular" / Pro Custom**. The billing system can sell only **Pro** and **Scale**; there is no Starter and no Growth at any layer (DB enum, feature map, price map), and `free` is the *lapsed* end-state. Worse, **"Pro" on the landing means the enterprise tier — the inverse of its in-app meaning.** `$89` is a hardcoded React literal in a system explicitly designed so prices live in Stripe. | `[CODE]` | Root cause is upstream: `design/design_handoff_landing_page/README.md:219-220` specifies exactly this, so fix both or it returns. |
| C2 | **Remove the PayTo saved-mandate claim** — `lib/marketing-content.ts:43, :157, :170` promise "returning diners can save a mandate for one-tap checkout". **The feature does not exist:** zero hits for `setup_future_usage` / `setupFutureUsage` / `off_session`, no mandate column, and the only `paymentIntents.create` passes neither `customer` nor `setup_future_usage`. | `[CODE]` | Line 43 feeds the visible FAQ **and the FAQPage JSON-LD** served to Google and (per `app/robots.ts`) explicitly to GPTBot/ClaudeBot/PerplexityBot. Line 157 feeds `/learn/payto-pay-by-bank` meta + Article JSON-LD. The file's own header says "no invented capabilities". |
| C3 | **Set `SHOP_FEED_URL`, or hide `/shop`.** *(Downgraded — the structured-data half is fixed in code: `/shop` now emits Product/Offer JSON-LD only when `source === "feed"`, so an unset variable publishes no offers rather than fabricated ones. The visible placeholder grid remains, which is why this step still stands.)* Unset, `getShopProducts()` returns **six hardcoded fake products** (`lib/shop/feed.ts:74-80` — a 50" signage display at $640, a 14" laptop at $899, …) on a public indexable page, and `app/shop/page.tsx:28` emits them as `Product`/`Offer` JSON-LD with `priceCurrency: "AUD"` and real prices. | `[OP]` or `[CODE]` | Publishing priced inventory that does not exist, as structured data. |
| C4 | **Neutralise the "no per-order commission" seed** — `content/references/example-guide.md:45` instructs the blog writer to include it and `content/keywords.csv:13` queues `commission free online ordering`. The platform takes 1.75% + $0.30 (`lib/stripe.ts:57-58`). | `[CODE]` | Nothing published claims it *yet*; the blog skill will generate it on the next run of that keyword. |

### The go-live gate

> **Place one real-card minimum-value order end to end and assert the row reaches `confirmed`.
> Then issue one real refund and assert net revenue drops.**

Nothing else proves B4 is right, and B4 fails silently.

---

## 5. Built-but-dormant features, ranked by activation cost

| # | Feature | Activation cost | Trap to know |
|---|---|---|---|
| 1 | **Loyalty** (earn, redeem, liability reporting) | **One owner toggle** at `/dashboard/payments`. Zero env, zero credential. | `loyalty_enabled` defaults false. Redemption also needs a signed-in customer, so guests never redeem. |
| 2 | **Platform admin console** | 1 env var. ~2 min. | Meta-gate: unblocks promotions, marketplace catalog, support queue. |
| 3 | **Both cron jobs** | 1 env var. ~2 min. | See A8 watermark trap. |
| 4 | **Error observability** | 1 var + project + 3 alert rules. ~30 min. | Go-live gate. |
| 5 | **Rate limiting** | 2 vars + free Upstash. ~10 min. | Fails open today. |
| 6 | **Hourly job ticker** | 1 GitHub repo **variable** (`JOB_TICK_URL`) + 1 **secret** (`CRON_SECRET`). ~5 min. | Already built and **provably not running**: all 20 scheduled runs are `skipped` because `vars.JOB_TICK_URL` is unset. Observed GitHub delivery is ~2.4h mean / 4h32m worst — the docs' "~1h" is optimistic ~4.5x. Only hits `/api/jobs/integrations`, never `seo-stats`. |
| 7 | **Migration approval gate** | GitHub repo setting (required reviewer on `production`). ~2 min. | Code half already shipped and inert. Today the only protection on an irreversible DDL is the destructive-SQL grep at `ci.yml:87-92`. |
| 8 | **AI concierge + all owner AI** | 1 var + metered spend. | **Worst current shape:** the plan gate is open for every venue (`trial` default), so the storefront renders an interactive AI box and every submission deterministically returns "unavailable". Models `claude-opus-4-8` / `claude-haiku-4-5` are current and valid — do **not** "fix" them. |
| 9 | **Menu item photos** | 5 `R2_*` vars + bucket. ~20 min. | Throws visibly on upload. |
| 10 | **Square POS connector** | 4 vars + `SQUARE_ENVIRONMENT=production` + Developer app + redirect URL. ~1h. | **Silent sandbox switch:** defaults to `"sandbox"`, only the exact string `"production"` selects live, and `.env.example` ships it pre-filled as `"sandbox"`. The "Sandbox" hint is deliberately suppressed on prod, so no UI ever says it. Also `connectSquare()` has no try/catch — a missing `INTEGRATION_TOKEN_KEY` surfaces as a raw server-action error. |
| 11 | **Customer SMS** | 3 Twilio vars + AU virtual number (~A$6/mo + ~A$0.08/msg). ~30 min. | Silent no-op when unset. Use a +61 number, not an alphanumeric Sender ID (ACMA). |
| 12 | **WhatsApp** | +3 vars, but **Meta-approved templates** (multi-day). | **Per-event** gating: setting only the "confirmed" SID means "ready" silently falls back to SMS — or is dropped entirely if `TWILIO_FROM` is also unset. Half-working, looks configured. |
| 13 | **Public `/shop`** | 1 var. | A **fix, not an activation** — see C3. |
| 14 | **Owner hardware marketplace** | Needs #2 first, then an admin imports products. | Reads the DB table, not the feed — permanently empty behind a working "Secure checkout" button. |
| 15 | **GSC / SEO stats** | 3 vars + GCP service account + restricted-user grant + `CRON_SECRET`. ~1h. | `SUMMARY_BATCH = 25` per tick — at daily cadence and 100 venues, a summary is up to 4 days stale. The **audit half needs no configuration at all** and works today. |
| 16 | **PayTo + bank discount** | Per-venue toggle + **Stripe must approve `payto_payments`**. | The capability request is best-effort: if the platform lacks PayTo, **the code swallows the rejection** and the owner sees a plausible "pending Stripe" state forever. UNVERIFIED whether the live account holds PayTo. |
| 17 | **Roster SSO + consolidated billing** | 1 var + the external Roster app + a Roster subscription line. | Asymmetric default: the URL has a hardcoded fallback so it always *looks* configured, but the key throws — caught into "try again in a moment", indistinguishable from a network blip. |
| 18 | **AI support chat (Foundry)** | 4 vars + **an external service that does not exist in this repo**. | **Partial config is worse than none** (502 on every message while looking configured). **Never set `SUPPORT_API_URL="mock"` in prod** — there is no `NODE_ENV` guard, so real owners get fabricated support answers through identical SSE rendering. |
| 19 | **Native push + mobile app + deep links** | Apple $99/yr + Play $25 + Mac/Xcode + `cap add` + Firebase + submission, **then** 6 vars. Weeks. | Doubly inert: no credentials *and* no app — `mobile/ios` and `mobile/android` do not exist in the repo. Meanwhile `/dashboard/settings/notifications` shows a "new order alerts" toggle reading **ON** (`push_new_orders` defaults `true`) for a capability that cannot fire. |
| 20 | **Marketing landing page itself** | `MARKETING_HOSTS` (defaults `["prompt2eat.com"]`). | On another host, `/` sends anonymous visitors to sign-in and signed-in users to `/dashboard`. Two escape hatches: `?preview=landing` renders the full landing on **any** host, and `generateMetadata` honours the same override (`app/page.tsx:44-45, 68-82`). |

**Already live with no gate:** gift cards · owner discount codes · inclusive GST · reports ·
customer directory.

---

## 6. Code work packages

Small, independently mergeable PRs. Launch-blocking first.

**PR-1 — Truth-in-advertising (launch-blocking).** C1 landing pricing + the design handoff doc ·
C2 the three `marketing-content.ts` strings · C4 the blog seed. Pure copy/data; no money path.

**PR-2 — Live-cutover docs + data (launch-blocking).** Add `charge.refunded` +
`charge.refund.updated` to `README.md:152`; add a **billing-webhook registration section** (none
exists) listing its six events; flip test-mode wording to live; ship the B6 id-clearing SQL.

**PR-3 — Security headers.** Add **HSTS** (zero occurrences of `Strict-Transport-Security`
anywhere in the repo) and widen `X-Content-Type-Options` / `Referrer-Policy` / `X-Frame-Options`
beyond the single `source: "/:slug/checkout"` rule in `next.config.ts:55-70`. There is no
`middleware.ts` and no `proxy.ts`, so nothing adds headers globally. The route that carries a
**bearer credential in the URL** is `/[slug]/account/verify?token=…`
(`account/verify/route.ts:41`) — *not* `/[slug]/account`, which receives at most `?error=link`.
This distinction is load-bearing for the fix: `headers()` matches on path patterns, so a rule
written for `/:slug/account` would **not** cover `/:slug/account/verify`.

**PR-4 — Repo hygiene.**
- **Strip the 2 NUL bytes from `app/api/jobs/seo-stats/route.ts`.** They are used deliberately as
  a composite-key delimiter (`` `${venueId}\0${day}` `` / `key.split("\0")`) but written as *raw*
  NUL characters, so git/grep/**ripgrep classify the file as binary and silently skip it**.
  Verified: `rg -l "export async function GET" app/` returns 3 files and **omits this one**,
  which does contain that string. Writing the escape `\0` instead is byte-identical at runtime.
  *Every grep-driven audit of this repo has silently skipped this route.*
- Fix stale docs: `ReleaseChecklist.md:69-78` describes a human migration gate that does not
  exist, and `:73-78` lists 0063 as pending when it is already applied — this is the **only**
  stale-0063 text in the repo (`ops/Migrations.md` contains zero references to `0063` and is
  correct about the gate being inert; only its worked examples at `:87-113` assume a reviewer).
  `PLAN.md` is stale wholesale (2026-07-03, PR #116 era) — it still lists the menu-editor bug as
  unfixed, and it is also the only place the obsolete tier name "Premium" still appears (`:232`).
- Add `"engines": { "node": "22.x" }` — `package.json` has no `engines` field, so the Vercel build's
  Node version comes solely from the dashboard. (Of the four workflows, the three that run Node
  pin 22; `job-tick.yml` is a bare `curl` job.)
- `permissions: {}` on `audit-slugs.yml` (it `npx`-fetches an unpinned package in a job holding
  `PROD_DATABASE_URL`).
- Add root-level `.ts` to `test/env-example-complete.test.ts:61`'s scan list so `NEXT_RUNTIME` and
  future `instrumentation.ts` / `next.config.ts` vars can't ship undocumented.

**PR-5 — Small correctness wins.**
- **Minimum-order guard in `placeOrder`.** `MIN_TOTAL_CENTS = 50` exists in
  `lib/payments/bank-discount.ts:7` but is used only by the discount clamps. A $0.30 item writes
  the full order transaction, then Stripe rejects the PI — orphan row + unexplained failure.
- `ExpressCheckoutElement onConfirm` discards the event, so `event.paymentFailed()` can never be
  called; tapping Apple Pay during a discount re-price leaves the wallet sheet with no terminal
  state. No money at risk; abandoned checkout on the highest-intent method.

**PR-6 — After Vercel Pro is confirmed.** `vercel.json:7` back to `"* * * * *"`. **Only after
confirming Pro** — a sub-daily schedule on Hobby *rejects the deployment*, it does not degrade.
Note `app/api/support/chat/route.ts:18` sets `maxDuration = 120`, over the Hobby 60s ceiling, and
`vercel.json` sits exactly at the Hobby 2-cron cap.

---

## 7. Silent-failure risks and the cheapest detection

| # | Risk | Cheapest detection |
|---|---|---|
| 1 | **Order webhook not a Connect endpoint** — orders never confirm, no error anywhere | One live end-to-end order asserting `confirmed`. **Make this the single go-live gate.** |
| 2 | **`charge.refunded` unregistered** — real cash moves, app records nothing | One live Dashboard refund; assert net revenue drops |
| 3 | **Stale test-mode `acct_` ids** — orphan `pending_payment` rows; mirror never self-corrects (no `account.updated` handler, no reaper) | `SELECT count(*) FROM orders WHERE status='pending_payment' AND created_at < now() - interval '15 minutes'` hourly for week 1 |
| 4 | **`SENTRY_DSN` unset** — the reporter for every other silent failure is itself off | Verify an envelope reaches the sink; confirm all **three** alert rules |
| 5 | **`CRON_SECRET` unset** — 503 before any reporting; no watermark ever written | `curl -sI -H "Authorization: Bearer $CRON_SECRET" .../api/jobs/integrations` expecting 200 |
| 6 | **Live Prices missing/mis-keyed** — bare catch, invisible in logs | One live purchase per tier × interval (4) + Roster add-on (2) |
| 7 | **`PLATFORM_ADMIN_EMAILS` empty** — deliberate 404, no log | Load `/admin` |
| 8 | **`SQUARE_ENVIRONMENT` left `"sandbox"`** — live creds hit the sandbox host; "Sandbox" suppressed in UI | Confirm a mirrored order in the **live** Square dashboard |
| 9 | **`SUPPORT_API_URL="mock"` carried into prod** — fabricated support answers, no `NODE_ENV` guard | Grep prod env for the literal `mock`. Prefer all four `SUPPORT_*` unset. |
| 10 | **Upstash unset** — no rate limiting, fails open | Hammer `/signin`, expect a 429 |
| 11 | **Twilio per-event asymmetry** — one event silently dead | Drive one order through **both** "confirmed" and "ready" |
| 12 | **No HSTS; headers on one route** | `curl -sI https://prompt2eat.com/ \| grep -i strict-transport`; `curl -I` `/dashboard`, `/admin`, `/<slug>/account` |
| 13 | **Migrations auto-apply, no human gate** — and two docs claim otherwise | Add a required reviewer (2 min) + fix both docs |
| 14 | **NUL bytes hide a route from grep** | Strip them; verify `git ls-files \| xargs -I{} sh -c 'grep -qI "" {} \|\| echo BINARY: {}'` prints nothing |

---

## 8. Backlog after launch, ranked by value ÷ effort

**Tier 1 — soon**
1. **Owner GST line on order card + kitchen ticket** — `taxCents` is already captured on every
   order but isn't selected into `KitchenOrder`. Hours; direct BAS convenience.
2. **Minimum-order guard** (PR-5 above). Hours.
3. **Menu import dedupe** — publish appends blindly (`import/actions.ts:296`); duplicate-name
   detection already exists *after the fact* in menu health. Reuse it pre-publish. Days; prevents
   the most likely onboarding disaster.
4. **City/location SEO pages** — `/for/[segment]`, JSON-LD, sitemap and OG-image machinery all
   exist; this is content plus a route param. Days, and it is the record's own recommended shape.
5. **Auto-register Apple Pay domain on `charges_enabled`** — removes a per-venue manual step that
   *will* be forgotten at scale, on the highest-conversion method. Days.

**Tier 2 — real value, real work**
6. **PWA + web push** — `pushPlatform` already includes `"web"`; needs manifest + service worker
   + VAPID. Most of the native app's notification value with no Apple/Google gatekeeper.
7. **E2d automated settlement transfers** — liability is tracked per-order and shown to admins;
   settlement is manual. This is where manual reconciliation stops scaling.
8. **Walk-in waitlist / queue** — the record's headline commercial opportunity, zero code surface,
   but the live seated/open table board already supplies the state model.
   ⚠️ Still gated on the record's own three unanswered questions (§3.3): what Crusoe pays Bite,
   what is actually broken beyond the queue, and whether he'd switch or wants a standalone bolt-on.
9. **Square refund mirroring** — `integration_job_kind` today holds exactly one value, `'order_mirror'`; `'refund_mirror'` exists only in a schema *comment* naming it as a future additive value, so this needs an `ALTER TYPE … ADD VALUE` migration, not just code (`lib/db/schema.ts:1501-1505`, `drizzle/0018_square_chimera.sql:1`).
10. **CloudPRNT cloud receipt printer** — browser-print is fragile on a Friday night.

**Tier 3 — defensible but expensive or externally gated**
Square catalog sync · **Xero** (every reuse surface ready: encrypted `venueIntegrations`, the
outbox, `lib/crypto.ts`) · **"Order with Google"** (largest free acquisition channel, but Merchant
Center + certification, months of calendar time) · NFC stickers · US exclusive tax · Doshii /
Ordermentum · **voice kiosk / AI phone ordering** (needs Twilio *Voice*, realtime audio, a new
failure model — months) · VPS migration + `pg` driver swap (pure cost optimisation; do it when
Vercel/Neon economics actually bite).

---

## 9. Two things worth stating plainly

**The single highest-value change in this plan is one Stripe Dashboard checkbox** — registering
the order webhook as a *Connect* endpoint with all four events. Get it wrong and the platform
accepts money and confirms nothing; get the refund half wrong and it accepts money and loses track
of giving it back. **Neither failure produces a single error anywhere in the system.**

**The second is a text edit.** The landing page advertises tiers and a price the billing system
cannot sell, and three strings promise a PayTo feature that does not exist — both syndicated to
Google and to AI answer engines as structured data. Minutes of work; material misrepresentation
the moment live keys are in.

Everything else on the SEO, mobile, voice, waitlist and Xero lists sits downstream of one gate:
**Stripe live + one venue actually paying.**

---

## Appendix — how this was verified

Built from six parallel audits (feature history via the GitHub PR API, env-var surface, inert
features, money path, deploy config, backlog), each finding then adversarially re-checked against
the repo — 30 verdicts, **0 refuted**. The assembled document was then fact-checked a second time
against ~120 of its own falsifiable `file:line` citations; **10 errors were found and corrected**
before publication (connectStripe's re-onboard mechanism, the `refund_mirror` enum value,
`ops/Migrations.md`'s accuracy, the Square webhook status code, "Premium", the
frequently-bought-together surface count, the workflow count, the credential-bearing route, and
the marketing-host behaviour).

Repo gates at time of writing, all green on `23682e1`: `npm run typecheck` · `npm run lint` ·
`npm test` (51 files / 403 tests) · `npm run build` (succeeds with zero env vars).

Claims about Vercel project state, Stripe Dashboard state, and prior chat sessions were **not
verifiable** from here and are marked `UNVERIFIED` wherever they appear.
