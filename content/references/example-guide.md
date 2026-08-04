# Reference exemplar — the shape a good guide takes

This is a worked example of the `Article` structure the `/blog-post` skill
produces. The live guides in `lib/marketing-content.ts` (e.g.
`qr-code-ordering`, `payto-pay-by-bank`) are the canonical references; this file
shows the pattern in isolation so a writer can copy the rhythm.

Primary keyword for this example: **"scan to order system"** (commercial intent,
`qr-ordering` cluster).

---

**slug:** `scan-to-order-system`

**title:** `What a scan-to-order system does for your venue` (56 chars)

**description:** `A scan-to-order system lets diners order from their phone by scanning a QR code. Here is how it works and what to look for.` (152 chars)

**eyebrow:** `Ordering`

**Sections:**

### Section 1 — heading: "What a scan-to-order system actually is"
> A scan-to-order system turns the QR code on your table into your whole
> ordering flow. A diner scans it, your menu opens in their phone browser, they
> choose and pay, and the order lands in your kitchen. No app to download, no
> waiting to catch a server's eye. (Primary keyword "scan-to-order system" is in
> the first sentence — good.)

### Section 2 — heading: "How ordering works at the table"
> Two or three short paragraphs walking the real steps: scan, browse or ask the
> concierge, pay by card or pay-by-bank, kitchen ticket prints. Only describe
> steps the product actually does.

### Section 3 — heading: "Do diners need to download anything?"
> Answer the real "People also ask" question directly. (No — it runs in the
> browser.)

### Section 4 — heading: "What it changes for your staff"
> Honest, concrete: fewer trips to take orders, the kitchen board groups tickets
> by status, labels print per prep station. No invented time-savings numbers.

### Section 5 — heading: "What to look for in a scan-to-order system"
> A short checklist framing (works on any phone, real payments, handles dine-in
> and takeaway, no aggregator commission on your own customers) that naturally
> positions Prompt2Eat without naming competitors.
>
> **Fee accuracy — do not get this wrong.** Prompt2Eat charges the venue a
> per-order platform fee of **1.75% + $0.30** (`lib/stripe.ts`), on top of
> Stripe's own processing. So "commission free", "no commission" and "no
> per-order fee" are all FALSE and must never be written. What IS true, and is
> the actual story: there is no *aggregator* commission — you are not paying a
> marketplace 20–35% to reach a customer who is already yours — and the diner is
> never charged a per-order surcharge. Compare against aggregator rates, never
> against zero.

---

Notice what the exemplar does **not** do: no "restaurants saw a 30% lift", no
five-star testimonial, no dash-riddled hype. It answers real questions in plain,
warm language and lets the product's actual behaviour do the selling. That is the
bar.
