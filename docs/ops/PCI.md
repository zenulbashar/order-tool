# PCI DSS scope and SAQ A eligibility determination

**Status:** determination recorded 2026-08-01 (M8b / audit §8.2).
**Owner:** whoever signs the annual SAQ. This document is the *basis* for that
signature, not the signature itself.

## Determination

Prompt2Eat is assessed as eligible for **SAQ A**, conditional on the control
described under "The script criterion" below, which is now met.

### Why SAQ A and not SAQ A-EP

Cardholder data never touches Prompt2Eat infrastructure:

- Card details are entered into **Stripe Elements** — cross-origin iframes
  served by `js.stripe.com` — and are submitted directly from the browser to
  Stripe. The PAN is never present in a request to a Prompt2Eat server, never
  in a Server Action payload, and never in the database.
- The platform stores only Stripe identifiers (`payment_intent` ids, refund
  ids, connected-account ids). Grep the schema: there is no card column, no
  PAN, no CVV, no expiry.
- Charges are **direct charges on the venue's connected account**, so the
  merchant of record for each order is the venue, not the platform.

### The script criterion — the part that actually applies here

The audit's §8.2 verification corrected an earlier, wrong reading of the
January 2025 SAQ A revision. The corrected position, per PCI SSC **FAQ 1588**:

> the new criterion — *"The merchant has confirmed that their site is not
> susceptible to attacks from scripts that could affect the merchant's
> e-commerce system(s)"* — applies **only** to merchants who embed a
> third-party payment form in their own page (for example an iframe, i.e.
> Stripe Elements), and expressly does **not** apply to redirect or
> fully-outsourced flows.

**Prompt2Eat uses Stripe Elements, so this criterion binds.** It is narrower
than the original claim in general, and directly applicable to us.

Also verified 3-0 in §8.2: the revision *removed* Requirements 6.4.3, 11.6.1
and 12.3.1 from SAQ A. Those are no longer the controls to point at; the
script-susceptibility confirmation above is.

## The control: a checkout Content-Security-Policy

The checkout route sends a CSP that constrains where scripts, frames and
network connections may come from, so an injected third-party script cannot
run on the page hosting the payment iframe. See `next.config.ts`.

### Script and resource inventory for the payment page

Everything the checkout page is permitted to load, and why:

| Origin | Directive | Purpose |
|---|---|---|
| `'self'` | `script-src`, `style-src`, `connect-src` | The application's own bundles and Server Action calls. |
| `https://js.stripe.com` | `script-src`, `frame-src` | Stripe.js and the Elements iframes that collect card data. |
| `https://api.stripe.com` | `connect-src` | Stripe API calls made by Stripe.js from the browser. |
| `https://maps.stripe.com`, `https://m.stripe.network`, `https://r.stripe.com` | `connect-src`, `frame-src` | Stripe's fraud-signal and telemetry endpoints, which Stripe.js contacts. |
| `data:`, `blob:`, the R2 public bucket | `img-src` | Venue logos and menu photography. |

**No analytics, tag manager, session recorder, chat widget or A/B tool is
loaded on the checkout route.** That absence is the point: each would be an
additional script with access to the page hosting the payment iframe, and
each would have to be justified against the criterion above.

### Known limitation, stated plainly

The policy currently allows `'unsafe-inline'` for `script-src`, because
Next.js emits inline bootstrap/hydration scripts and this app does not yet
use the nonce-based approach (which requires a `proxy.ts` and dynamic
rendering — see the framework's own Content-Security-Policy guide).

This means the CSP constrains **which origins** may serve scripts, but does
not by itself stop an inline script that an attacker managed to inject into
the HTML. Tightening this to a nonce-based `strict-dynamic` policy is the
recommended follow-up, and should be done against a live Stripe Elements
instance because Elements' own bootstrapping must keep working.

Being explicit about this now is deliberate: an assessor reading a CSP with
`'unsafe-inline'` will ask, and the honest answer is better recorded than
discovered.

## What to re-check annually, or on any change

1. **Any new script on the checkout route** — re-run the inventory above and
   justify the addition, or don't add it.
2. **Any move away from Stripe Elements** (e.g. to Checkout redirect) changes
   which criterion applies; re-read FAQ 1588 rather than assuming.
3. **Confirm the CSP is actually being sent** — `curl -sI https://<host>/<slug>/checkout | grep -i content-security-policy`.
4. Re-read the current SAQ A text. This determination cites the January 2025
   revision; PCI SSC revises the SAQs.

## Related

- The audit's §8.2 (payments and PCI, with the verification record showing
  which claims were refuted) and finding F3.
- `docs/ops/Observability.md` for the money-path error reporting.
