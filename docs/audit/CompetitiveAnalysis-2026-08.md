# Competitive Analysis — prompt2eat vs Bopple / Big Buns

**Compiled:** 2026-08-19 · **Against:** `main` @ `f470163`

## Sourcing and its limits — read this first

Our column is **verified from this repository** (grep + code reading, cited below).

The competitor column is **not**. The network egress proxy in this environment blocks
`bopple.com` and `bopple.app`, so the live Bopple pricing page and the Big Buns storefront
could not be fetched. Everything about them here comes from **public search-result summaries**
and app-store listings, which are secondary and may be stale — Bopple's commission bands in
particular are described publicly as negotiated per venue and volume-tiered, so treat every
figure as indicative.

Marked accordingly:

- **✅ verified** — read in this repo
- **📰 public source** — from a search result or store listing, not fetched first-hand
- **⚠️ unverified** — asserted nowhere reliable; needs a human to check

Nothing here should be quoted at a customer without re-checking the competitor claims directly.

---

## 1. The headline

**On transaction economics we are dramatically cheaper. On fulfilment breadth we are behind.**

| | prompt2eat | Bopple |
|---|---|---|
| Platform fee per order | **1.75% + $0.30** ✅ (`lib/stripe.ts`) | **3.9%–5.9%** 📰, volume-tiered, negotiated |
| Monthly | Pro / Scale, amounts held in Stripe ✅ | Free tier; ~$49/mo ordering; white-label from ~$99/mo 📰 |
| Delivery | **None** ✅ | Own-radius delivery + DoorDash Drive 📰 |

If the public commission figures are even approximately right, a venue doing $40k/month
through the platform pays roughly **$700–$2,360/month** to Bopple in commission versus
about **$700 + $0.30/order** to us. That is the single most defensible commercial argument
this product has, and it is verifiable from our own source rather than from marketing.

**It is also the argument we cannot make until delivery exists**, because a venue that needs
delivery cannot use us at all.

---

## 2. Feature matrix

Legend: ✅ have (verified) · ◑ partial · ❌ missing · 💤 built but dormant (needs config)

### Ordering and fulfilment

| Capability | Us | Bopple 📰 | Gap |
|---|---|---|---|
| Pickup | ✅ | ✅ | — |
| Dine-in / QR table ordering | ✅ `lib/qr.ts`, `table-link.ts` | ✅ | — |
| **Delivery** | **❌** | ✅ own radius + fee, DoorDash Drive | **P0 — the blocking gap** |
| Scheduled / pre-order when closed | ✅ `lib/schedule.ts` | ✅ | — |
| Order throttling / busy mode | ❌ | ⚠️ | P2 |
| Kiosk mode | ❌ | ✅ 📰 | P3 |
| Catering orders | ❌ | ✅ 📰 | P3 |
| **Table bookings** | ✅ (0065) | ❌ not advertised | **our advantage** |

### Menu and discovery

| Capability | Us | Bopple 📰 | Gap |
|---|---|---|---|
| Categories, variants, modifiers | ✅ | ✅ | — |
| Visual category browser | ✅ `CategoryTiles` | ✅ (Big Buns) | — |
| Frequently ordered together | ✅ `queries.ts:383-464` | ✅ (Big Buns) | — |
| Product imagery | ✅ R2 💤 | ✅ | needs `R2_*` |
| Out-of-stock / stock counts | ✅ `stockMovements` | ⚠️ | — |
| Half/half, meal deals, bundles | ❌ | ⚠️ | P2 |
| Order-type-specific menus | ❌ | ⚠️ | P2 (needed with delivery) |

### Checkout and payment

| Capability | Us | Bopple 📰 | Gap |
|---|---|---|---|
| Guest checkout | ✅ | ✅ | — |
| Apple Pay / Google Pay | ✅ Express Checkout 💤 | ✅ | needs domain reg (now automatic) |
| **PayTo pay-by-bank** | ✅ | ❌ | **our advantage** |
| Promo codes / discounts | ✅ | ✅ | — |
| Gift cards | ✅ | ⚠️ | likely ours |
| Tips | ❌ | ⚠️ | P2 — real revenue for venues |
| Delivery fees | ❌ | ✅ | with delivery |
| Minimum order amount | ◑ Stripe floor only | ✅ | P2 |
| Saved payment methods | ❌ | ⚠️ | P3 |
| GST handling | ✅ inclusive | ✅ | — |

### Customer

| Capability | Us | Bopple 📰 | Gap |
|---|---|---|---|
| Accounts, order history, reorder | ✅ | ✅ | — |
| Loyalty / points | ✅ 💤 one toggle | ✅ | **turn it on** |
| Push notifications | ◑ server-side only | ✅ native apps | P1 — no app exists |
| Email / SMS / WhatsApp | ✅ 💤 | ⚠️ | needs Twilio |
| Real-time order tracking | ◑ status poller | ✅ "grill to pickup" 📰 | P2 |
| Saved addresses | ❌ | ✅ | with delivery |

### Operator

| Capability | Us | Bopple 📰 | Gap |
|---|---|---|---|
| Kitchen board, stations, dockets | ✅ | ✅ | — |
| Multi-location | ✅ Scale | ✅ | — |
| Staff roles / RBAC | ✅ | ⚠️ | likely ours |
| Reports | ✅ | ✅ | — |
| Stock, recipe costing, invoice scan | ✅ | ❌ | **our advantage** |
| **POS integrations** | ◑ Square only 💤 | ✅ Lightspeed/Kounta + Doshii 📰 | **P1** |
| Pass-thru printing to POS | ❌ | ✅ 📰 | P2 |
| **Native iOS/Android apps** | ❌ shell only | ✅ (Big Buns) | **P1** |

### Where we are simply ahead

Verified in this repo and not advertised by Bopple: **AI ordering concierge**, **AI menu
import from a photo**, **AI descriptions**, **stock + recipe costing + invoice scanning**,
**SEO/AEO studio**, **design studio**, **table bookings**, **PayTo**, and **the venue keeps
its own Stripe account, customer data and domain** rather than sitting on a platform subdomain.

---

## 3. What Big Buns makes effortless that we do not

From the app-store listing and the Bopple product pages 📰:

1. **Delivery is simply there.** We cannot serve that customer at all.
2. **A real native app** with push, haptics and in-app payment. Ours is an uncommitted
   Capacitor shell with no `ios/`/`android/` directories in the repo.
3. **"Track your order from grill to pickup."** We have a payment-status poller, not a
   fulfilment tracker — the diner cannot see *preparing → ready*.
4. **Loyalty visible in the app.** Ours is built and switched off by default.

Two of those four are configuration, not code.

---

## 4. Prioritised gaps

| # | Gap | Why | Effort | Priority |
|---|---|---|---|---|
| 1 | **Delivery** | Excludes us from a large share of venues; Bopple's headline | Large — new order type, address capture, radius, fee (first customer-visible charge), new lifecycle states | **P0** |
| 2 | **Turn on what is already built** | Loyalty is one toggle; Apple Pay, photos, notifications are env | Hours | **P0** |
| 3 | **Diner-visible fulfilment tracking** | Expected; we already have the states | Small | **P1** |
| 4 | **Native apps** | Big Buns' whole retention loop | Weeks + store accounts | **P1** |
| 5 | **Broader POS** (Lightspeed/Doshii) | Square-only excludes most AU venues | Large, partner-gated | **P1** |
| 6 | **Tips** | Direct venue revenue, trivially expected | Small–medium (money path) | **P2** |
| 7 | **Minimum order / throttling** | Operator protection at peak | Small | **P2** |
| 8 | Bundles, half/half, order-type menus | Menu depth | Medium | **P2** |

**The economics argument is the strategy.** Fee transparency is worth more than feature
parity for a venue doing volume — but it only lands once delivery exists, because a venue
that needs delivery never reaches the pricing conversation.

---

## 5. Honest scoring

Scored against "could a serious AU operator run their business on this today?"

| Dimension | Score | Reasoning |
|---|---|---|
| Product completeness | 72 | Deep pickup/dine-in; delivery absent entirely |
| Ordering UX | 78 | Category tiles, recommendations, concierge are genuinely good |
| Hospitality capability | 70 | Stock/costing ahead of peers; no tips, no throttling |
| Competitive readiness | 55 | Delivery gap is disqualifying for many venues |
| Security | 82 | Tenancy clean, headers fixed, webhook verified; audit found no cross-tenant leak |
| Money-path correctness | 80 | Was 45 before this session's P1–P5 fixes |
| Performance | ⚠️ unmeasured | Lighthouse never run; no evidence either way |
| Accessibility | 80 | axe in CI, dialog contract derived, WCAG gate |
| Mobile readiness | 35 | Responsive web only; no shipped app |
| Technical quality | 85 | 486 tests, derived/mutation-verified, strong invariants |
| **Production readiness** | **65** | Code is close; **operator config is the actual blocker** |

Performance is left unscored deliberately — the audit could not measure it, and inventing
a number would be worse than admitting the gap.
