# User Flows

Discovered from the route tree, server actions, and query modules. Three actor
domains, firewalled from each other: **diner**, **owner**, **platform admin**.

## Diner (storefront `/[slug]`)

**Browse → order (core loop)**
```
/[slug] (storefront) ─ category tiles / search / dietary filter
   ├─ tap item → ItemModifierSheet (size + modifiers + qty) → add to cart
   ├─ AI concierge ("prompt to eat") → proposeCart → MultiItemPicker → add all
   └─ recommendations row ("goes well with")
→ cart rail / CartReview
→ /[slug]/checkout ─ contact details, order type (dine-in/pickup), schedule
   ├─ applyOrderDiscounts: promo code + pay-by-bank + loyalty points + gift card
   ├─ Stripe payment (server-computed amount + fee)
   └─ placeOrder (server recomputes every total from live prices)
→ /[slug]/order/[token] ─ status poller (token-scoped, no login)
```

**Diner account (magic-link, venue-bound)**
```
/[slug]/account ─ sign-in form → magic link → /[slug]/account/verify
   ├─ points panel + order history
   ├─ /account/details ─ contact details
   ├─ /account/notifications ─ prefs
   └─ /account/payment ─ saved payment
```

## Owner (dashboard)

**Onboarding wizard**
```
/onboarding → details → plan → menu → stations → service → live
(progress tracked; onboarding_completed_at stamped at go-live)
```

**Daily operations**
```
/dashboard ─ home
/dashboard/orders ─ live board, ticket drawer, station split, print, kitchen sound
/dashboard/tables ─ tables + QR codes (create/edit/delete)
/dashboard/menu ─ categories/items/groups/options/variants (full CRUD)
   ├─ /menu/import ─ AI menu import from photo
   └─ /menu/descriptions ─ AI description writer
/dashboard/stock ─ ingredients, overview, reorder suggestions, invoice scan
/dashboard/customers ─ CRM
/dashboard/reports ─ sales + GST (BAS)
```

**Money & growth**
```
/dashboard/payments ─ payouts + loyalty + pay-by-bank config
/dashboard/discounts ─ codes (create + pause)
/dashboard/gift-cards ─ issue / top-up / void
/dashboard/billing ─ plan + subscription
/dashboard/marketplace ─ shop supplies
```

**Storefront setup (`/dashboard/settings/*`)**
brand · logo · imagery · announcement · social · about · hours · tax · stations ·
notifications.

**Integrations**
```
/dashboard/integrations ─ Square (OAuth → callback → mirror sync) + activity drawer
/dashboard/apps
```

## Platform admin (`/admin`, allowlist-gated, existence-hidden)
```
/admin ─ console
/admin/stats · /admin/support · /admin/promotions
/admin/marketplace (+ /shop) ─ catalog + orders
/admin/venues/[id] ─ open-as-venue (impersonate), plan discount, item price edit
```

## Background / async
Stripe order + billing webhooks · Square webhook + OAuth callback · support webhook ·
`/api/jobs/integrations` (mirror queue) · push registration · stock depletion on
order · loyalty/gift-card debit on confirmation (+ cron sweeps).
