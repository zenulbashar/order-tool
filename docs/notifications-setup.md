# Customer order notifications — setup checklist

Order-notification code is shipped and **no-ops safely until configured**. To turn
each channel on, set the env vars (Vercel → Project → Settings → Environment
Variables) and run the migrations. Nothing here blocks orders if left unset.

## 1. Database migrations (required first)
```
npm run db:migrate
```
Applies `0042` (customer notify prefs) and `0043` (`orders.customer_email`). The
send path reads these columns.

## 2. Email (Resend) — already configured
Uses the existing `RESEND_API_KEY` / `EMAIL_FROM`. No extra setup — order emails
send once the migrations are applied.

## 3. SMS (Twilio)
```
TWILIO_ACCOUNT_SID   = AC...
TWILIO_AUTH_TOKEN    = ...
TWILIO_FROM          = +61...        # a dedicated Australian virtual number
```
- **Use a +61 virtual number, not an alphanumeric Sender ID** — this avoids
  ACMA's SMS Sender ID Register / "unverified sender" blocking. (Alphanumeric
  sender IDs must be registered; a real number doesn't.)
- Buy the number in the Twilio console; SMS-enable it.
- Rough cost (AU): ~A$0.08 per message segment + number rental (~A$6/mo).

## 4. WhatsApp (Twilio + Meta) — optional, preferred over SMS when set
```
TWILIO_WHATSAPP_FROM          = whatsapp:+61...   # or an MG... Messaging Service SID
TWILIO_WHATSAPP_CONFIRMED_SID = HX...             # approved "order confirmed" template
TWILIO_WHATSAPP_READY_SID     = HX...             # approved "order ready" template
```
Setup:
1. Create/connect a **WhatsApp Business Account** in Twilio and complete **Meta
   business verification**.
2. Create two **Content templates** (utility category) and get them Meta-approved.
   Each must accept these positional variables:
   - `{{1}}` = customer first name
   - `{{2}}` = venue name
   - `{{3}}` = order reference
   - `{{4}}` = order URL
3. Put the approved template **Content SIDs** in the two env vars above.

When configured, the text channel sends WhatsApp and falls back to SMS otherwise.

## Who gets notified
- **Signed-in customers** — per their toggles on Account → Notifications.
- **Guests** — via the email (required at checkout) and optional phone they enter.

## Where it fires
- **Order confirmed** — Stripe payment webhook (`app/api/stripe/webhook/route.ts`).
- **Order ready** — kitchen "mark ready" action (`app/dashboard/orders/actions.ts`).
