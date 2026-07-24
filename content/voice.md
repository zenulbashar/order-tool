# Prompt2Eat content voice & rules

This is the reference the `/blog-post` skill (and any human writer) uses so guides
read like one brand and never drift into AI slop — while staying inside the
codebase's hard rule: **only real, current product behaviour. Never fabricate.**

## Who we're writing for

Hospitality owners and managers — busy, practical, sceptical of hype. They've
heard "AI will transform your restaurant" too many times. They want to know
what a thing does, whether it's worth an afternoon of their time, and what it
costs them. Write for that reader.

## Voice

- **Clear before clever.** Short sentences. Concrete nouns. If a line doesn't
  help the reader decide or do something, cut it.
- **Warm and a little dry.** A wry aside is welcome; a stand-up routine is not.
  Humour should come from honesty about the daily grind of running a venue, not
  from forced jokes. One good line beats five.
- **Specific.** "Import your menu from a photo and review it before it saves"
  beats "revolutionise your workflow." Name the real feature, the real step.
- **Australian English.** organise, favour, "takeaway", "café", GST, "EFTPOS".
- **Second person.** Talk to the owner ("you"), not about them.

## Hard rules (non-negotiable — same doctrine as the rest of the app)

1. **No invented facts.** No made-up statistics, ratings, customer counts,
   "studies show", or testimonials. If we don't have a real number, we don't
   cite one. (This is why the landing uses capability statements, not metrics.)
2. **Only describe features that exist today.** Cross-check claims against the
   product and `lib/marketing-content.ts`. If unsure, leave it out.
3. **No allergen / dietary / health guarantees.** Dietary tags are the venue's
   guide, not a guarantee — say so whenever the topic comes up.
4. **No emojis** in article bodies, no ALL-CAPS words, and at most one
   exclamation mark per guide. (Em-dashes are fine in long-form guides — match
   the existing `/learn` articles — but menu and UI microcopy keeps the stricter
   no-dash house rule.)
5. **No competitor bashing by name.** Contrast approaches, not brands.

## Structure of a guide

Mirror the live guides in `lib/marketing-content.ts` (`Article` type):

- `title`: ≤ 60 characters, contains the primary keyword naturally.
- `description`: 120–160 characters, snippet-ready, primary keyword near the front.
- `eyebrow`: a short mono label (e.g. "Ordering", "Payments", "Setup").
- `sections[]`: 4–7 sections, each a clear `heading` (an H2) plus 1–3 `paragraphs`.
  - Work the primary keyword into the first paragraph (first ~100 words).
  - Cover the questions a real owner would ask — turn 4–8 of them into headings
    or paragraphs so the guide answers the "People also ask" set.
  - Keep paragraphs to 2–4 sentences.

## On-page checklist (every guide must pass)

- [ ] Exactly one H1 (the page renders `title` as the only H1 — don't add another).
- [ ] Primary keyword in the title, the description, and the first 100 words.
- [ ] 4–8 real questions answered across the sections.
- [ ] 2–3 internal links to sibling `/learn` guides or `/` (the page auto-links
      three sibling guides at the end; add in-body links where they genuinely help).
- [ ] Reads in the voice above; no fabricated claims; passes the hard rules.
- [ ] Keyword marked `published` in `content/keywords.csv` with its URL.

Technical SEO (metadata, canonical, Article JSON-LD, sitemap entry, per-guide OG
image) is already handled by the shared page template — you do not re-implement it
per post. Just add the typed `Article` and it inherits all of it.
