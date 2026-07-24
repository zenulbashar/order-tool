---
name: blog-post
description: >-
  Write and publish a new SEO guide for the /learn hub from a target keyword.
  Use when the user asks to write a blog post, guide, or /learn article, or to
  "publish the next keyword". Picks a keyword from content/keywords.csv (or one
  the user names), builds a keyword cluster, studies the top-ranking pages,
  writes in the Prompt2Eat voice, adds a typed Article to
  lib/marketing-content.ts (which inherits metadata, canonical, Article JSON-LD,
  sitemap entry and OG image automatically), passes the on-page checklist, and
  marks the keyword published. One post per run — respect the cadence rule.
---

# Publish a /learn SEO guide

You are writing one guide for Prompt2Eat's `/learn` content hub. The whole
technical SEO layer (metadata, canonical, `Article` JSON-LD, sitemap inclusion,
per-guide OG image) is already handled by the shared page template — your job is
the **content**: pick a winning keyword, write a genuinely useful guide in the
house voice, and register it. Do NOT re-implement any SEO plumbing per post.

## Before you start — read these

1. `content/voice.md` — the voice and the hard rules (no fabricated facts, AU
   English, no em-dashes/emojis, dietary disclaimers). These are non-negotiable.
2. `content/references/example-guide.md` and the live guides in
   `lib/marketing-content.ts` — the `Article` shape and rhythm to match.
3. `content/keywords.csv` — the keyword ledger.

## Step 1 — Choose the keyword

- If the user named a keyword, use it (add it to `content/keywords.csv` if absent).
- Otherwise pick the highest-`priority` row with `status = unused`. Break ties by
  commercial intent, then by cluster coverage (prefer clusters with fewer
  published guides).
- **Winning-keyword filter (the SEMrush step):** if the row's `kd` (keyword
  difficulty) or `volume` columns are blank, tell the user you're proceeding on
  intent alone and that they should paste real KD/volume from a keyword tool
  (SEMrush/Ahrefs/Keyword Planner) to confirm it's worth ranking for. The target
  is **KD ≤ 30 and volume ≥ 100** — if the data is present and fails that, pick a
  different keyword and say why.
- Never reuse a keyword already `published`.

## Step 2 — Build the keyword cluster

List the primary keyword plus 4–10 secondary/tertiary variants a single page can
rank for (synonyms, question forms, "near me"/city variants only if truthful).
These become section headings and in-body phrasing. Keep them in the same cluster
as the CSV row.

## Step 3 — Study what already ranks (the "steal the format" step)

Use WebSearch on the primary keyword and 1–2 cluster terms. From the top
non-forum results, note: typical article length, the H2 questions they all
cover, and any angle they miss. Aim to match the average depth and **cover the
questions they cover plus one they don't**. Do not copy text — extract the shape.
Capture 4–8 real questions (the "People also ask" set) to answer.

## Step 4 — Write the guide (in voice, only real facts)

Add a new entry to the `ARTICLES` array in `lib/marketing-content.ts`, matching
the `Article` type exactly:

- `slug`: lowercase kebab of the primary keyword (must be unique and must NOT be
  a reserved slug — see `RESERVED_SLUGS` in `lib/validation.ts`).
- `title`: ≤ 60 chars, primary keyword worked in naturally.
- `description`: 120–160 chars, snippet-ready, keyword near the front.
- `eyebrow`: short mono label (e.g. "Ordering", "Payments", "Setup", "Growth").
- `sections`: 4–7 `{ heading, paragraphs }`. Primary keyword in the first
  paragraph (first ~100 words). Each heading answers a real owner question.
  Every claim must be true of the product today — cross-check `FAQ_ITEMS` and the
  existing guides; when unsure, leave it out.

## Step 5 — Pass the on-page checklist (from voice.md)

- [ ] One H1 only (the template renders `title`; never add another H1 in prose).
- [ ] Primary keyword in title, description, and first 100 words.
- [ ] 4–8 real questions answered.
- [ ] In-body internal links only where they help (the page already auto-links
      three sibling guides + a CTA). Prefer linking a genuinely related guide.
- [ ] Voice + hard rules hold; zero fabricated claims.

## Step 6 — Register and verify

- Update the keyword's row in `content/keywords.csv`: set `status = published`
  and `url = /learn/<slug>`.
- Run `npm run typecheck` and `npm run lint`. The new guide should now appear at
  `/learn/<slug>`, in `/sitemap.xml`, and with its own OG image — all automatic.

## Cadence — important

Publish **one** guide per run. Do not batch-generate many guides at once: a sudden
spike in new pages reads as spam to Google. A sensible rhythm is a few posts a
week, ramping gradually. After publishing, in Google Search Console use URL
Inspection → Request indexing for the new URL (there's a ~10/day quota).
