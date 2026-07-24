# SEO & AEO Deployment Plan — Prompt2Eat

Companion to `AUDIT.md`. Closes every gap against the SEO-masterclass checklist in phases, cheapest-highest-impact first. Each phase lists its items, acceptance criteria, and status.

> **Status (2026-07-24):** Phases 0–5 are all **SHIPPED**. What remains is
> operational: the Google verification/analytics/service-account setup in Phase 0,
> and the ongoing loops (publish guides via the `/blog-post` skill, review Search
> Console monthly, keep the Business Profile active). Phase 5's further roadmap
> items (scheduled audits, custom-domain GSC, AI-visibility probes) are noted at
> the end as future work.

---

## Phase 0 — Measurement foundation + quick wins · **SHIPPED (this branch)** + 30 min of ops

You can't steer what you can't see. Code is done; three console steps remain.

**Shipped:**
- Google Search Console verification hook — set `GOOGLE_SITE_VERIFICATION` and the meta tag emits (`app/layout.tsx`).
- Google Analytics 4 — set `NEXT_PUBLIC_GA_ID` and the gtag snippet renders (`app/_components/analytics.tsx`); previews stay untracked.
- Search-stats pipeline — service-account GSC client (`lib/search-console.ts`), daily ingest cron (`/api/jobs/seo-stats`, `vercel.json` 03:30), per-venue daily rows + top queries.
- `/[slug]/menu` canonical → `/{slug}` + description + OG (duplicate-content fix).
- `noindex` on dashboard/admin/onboarding/sign-in; root `app/not-found.tsx`; `sameAs` links in venue JSON-LD; `.env.example` fully documents the new vars.
- **SEO & AEO studio** (Scale plan) — the owner one-click audit + stats feature (see `AUDIT.md`).

**Ops runbook (owner of prompt2eat.com, ~30 min):**
1. Search Console → add property → HTML-tag method → put the token in `GOOGLE_SITE_VERIFICATION` → deploy → Verify.
2. Search Console → Sitemaps → submit `https://prompt2eat.com/sitemap.xml`.
3. Create a GA4 property → set `NEXT_PUBLIC_GA_ID`.
4. Google Cloud → service account + enable "Search Console API" → add its email to the property as *Restricted* user → set `GSC_CLIENT_EMAIL` / `GSC_PRIVATE_KEY` / `GSC_SITE_URL` (+ ensure `CRON_SECRET` is set).
5. For each new important page (e.g. a fresh guide): Search Console URL Inspection → Request indexing (~10/day quota).

**Acceptance:** property verified; sitemap "Success"; GA4 receiving events; `/api/jobs/seo-stats` returning `dailyUpserts > 0` after a few days; venue dashboards showing search stats.

---

## Phase 1 — Core Web Vitals + trust · **SHIPPED**

The video's "Lighthouse 100" chapter. Highest-leverage performance and credibility fixes. **Done:** hero + mobile-cover images now carry explicit dimensions, `fetchpriority`, and a server-side `ReactDOM.preload` (LCP/CLS); the landing's fabricated stats and invented testimonials are replaced with honest capability copy; real `/about`, `/contact`, `/privacy`, `/terms` pages ship behind a shared marketing shell with the footer links wired; per-guide OG images and `/shop` Product JSON-LD are added. (Original notes retained below.)

1. **Storefront hero images** (`app/[slug]/storefront-hero.tsx`): add `width`/`height` (or an aspect-ratio container) to kill CLS; `fetchpriority="high"` on the first slide (the LCP element) and `loading="lazy"` on the rest; preload `coverUrl`. Keep raw `<img>` (owner-supplied R2 URLs; house style avoids `next/image` here) — document why.
2. **Honest landing:** replace the `TODO-METRIC` fake stats and `TODO-TESTIMONIAL` quotes in `app/_landing/landing.tsx` with real figures/capability statements, or remove the sections. Fabricated social proof is a trust and quality-rating liability.
3. **Legal/company pages:** create `app/privacy`, `app/terms`, `app/about`, `app/contact` (static, metadata-complete), wire the currently-inert footer links, add them to the sitemap. E-E-A-T + legal necessity for a platform taking payments.
4. **Landing cacheability (investigate):** `/` is dynamic only because of the `headers()` host gate; moving the gate to middleware would let the landing serve as static HTML. Measure value first — low priority.
5. Smaller: per-article OG images for `/learn/*`; `Product` JSON-LD on `/shop`.

**Acceptance:** Lighthouse ≥ 90 performance on `/` and a demo storefront (mobile); zero fabricated claims on the landing; footer links resolve; legal pages indexed.

---

## Phase 2 — The content engine (the video's tactic #1) · **SHIPPED (ongoing use)**

Blog-at-scale, adapted to this repo's typed-content system (no CMS needed). **Done:** `content/keywords.csv` (the keyword ledger), `content/voice.md` + `content/references/`, and the `.claude/skills/blog-post` skill encoding the full flow; one guide published through it to prove the loop. Ongoing work is simply running the skill on a sensible cadence and filling KD/volume from a keyword tool.

1. **Keyword pipeline:** `content/keywords.csv` with columns `keyword,intent,cluster,priority,status,url,published_at` (`status ∈ unused|drafted|published`). Seed from `SITE_KEYWORDS` + SEMrush/keyword-tool exports (KD ≤ 30, volume ≥ 100, informational for guides / commercial for segment pages — the video's filter).
2. **Voice pack:** `content/voice.md` (tone rules; matches the existing no-invented-claims doctrine) + `content/references/` exemplars, so generated posts don't read as AI slop.
3. **`/blog-post` skill** (`.claude/skills/blog-post/SKILL.md`) encoding the video's full flow: pick highest-priority `unused` keyword → build its cluster → SERP analysis via web search (headings, length, intent, gaps of the top results) → read the voice pack → write a new `ARTICLES` entry in `lib/marketing-content.ts` (title ≤ 60 chars, meta 120–160, one H1, keyword in first 100 words, H2s with cluster variants, 4–8 FAQ entries reusing `FaqItem`, 3–5 internal links, 2–3 external authority links) → mark the keyword `published`. Sitemap + Article JSON-LD pick new entries up automatically.
4. **Cadence rules in the skill:** start ~1 post/day and ramp gradually; never bulk-publish (the video's spike warning). Request indexing for each new URL.
5. **Images:** optional Pexels API step (key via env) or brand-generated OG images per article.

**Acceptance:** 10+ published guides targeting tracked keywords; keywords.csv ledger current; each post passes the on-page checklist; impressions trending up in Search Console.

---

## Phase 3 — Programmatic landing pages (the video's tactic #2) · **SHIPPED**

Money pages: service × audience/city, done tastefully (dozens, not thousands — the video's own warning). **Done:** `lib/marketing-segments.ts` (cafés, restaurants, bars, bakeries, food trucks, each with genuinely distinct content) and the reusable `app/for/[segment]` template with FAQPage JSON-LD, sitemap inclusion, and a "Solutions" footer for internal links. City variants can extend the matrix later.

1. `lib/marketing-segments.ts`: typed matrix (audiences: cafes, restaurants, bars, bakeries, food trucks × cities: Brisbane, Sydney, Melbourne, Gold Coast…) with **per-segment unique content** (pain points, feature mapping, localized FAQ) to avoid doorway-page thinness.
2. `app/for/[segment]/page.tsx`: ONE reusable template — hero, segment copy, feature grid reusing landing sections, FAQ + FAQPage JSON-LD, sign-up CTA — `generateStaticParams` from the matrix, full metadata + canonical, sitemap inclusion.
3. Ship 6–8 strong pages first (e.g. `/for/cafes`, `/for/restaurants-brisbane`); expand only where impressions justify it.
4. Reuse the proven landing structure as the conversion template; iterate with GA4 data (the video's "winning formula" loop).

**Acceptance:** segment pages indexed and ranking for "{ordering software} for {audience} {city}"-shaped queries; sign-up conversions attributed in GA4.

---

## Phase 4 — Measurement loop + off-page · **SHIPPED (ongoing use)**

**Done:** the Lighthouse CI workflow + `lighthouserc.json` run on every PR, and `docs/seo/GMB_PLAYBOOK.md` gives owners the Google Business Profile runbook. The review cadence and off-page tactics below are ongoing, human-run practices.

1. **Lighthouse CI:** `.github/workflows/lighthouse.yml` + budgets (LCP < 2.5 s on `/` and a demo storefront) asserted against preview deploys — the video's "iterate until green," automated.
2. **Review cadence:** monthly Search Console + GA4 review; feed findings back into `keywords.csv` priorities.
3. **Google Business Profile playbook** (`docs/seo/GMB_PLAYBOOK.md`): category, hours parity with the storefront, menu link to `/{slug}`, photo cadence, review responses — plus a future in-dash checklist card on `/dashboard/seo` for owners.
4. **Off-page, the safe subset only** (the video is explicit that cheap backlinks kill sites): no PBNs ever; broken-link swaps, genuine guest posts, HARO-style expert answers, and only reputable paid placements. Manual, documented, never automated.

**Acceptance:** Lighthouse job green on PRs; monthly review notes committed; GMB live for the platform.

---

## Phase 5 — SEO & AEO studio v2 (product roadmap)

Item 1 (venue FAQs) is **SHIPPED**; the rest remain future work.

1. **Venue FAQs as first-class data · SHIPPED:** the `venue_faqs` table + owner CRUD at `/dashboard/settings/faqs` (with "Import from AEO audit") now render the FAQs visibly on the storefront **and** emit FAQPage JSON-LD from the same data — closing the AEO loop.
2. **Scheduled audits:** weekly cron re-runs per Scale venue + "score dropped" email nudge (outbox pattern already exists).
3. **Custom-domain venues:** per-domain GSC properties for Scale venues on their own domains.
4. **Owner GMB checklist card** on `/dashboard/seo` (from the Phase-4 playbook).
5. **AI-visibility probes:** periodically ask the major assistants the six canonical questions about a venue and record whether the venue is cited — a true AEO rank tracker.

---

## Env vars introduced (all documented in `.env.example`)

| Var | Purpose |
|---|---|
| `GOOGLE_SITE_VERIFICATION` | Search Console HTML-tag ownership proof |
| `NEXT_PUBLIC_GA_ID` | GA4 measurement id (analytics off when unset) |
| `GSC_CLIENT_EMAIL` / `GSC_PRIVATE_KEY` / `GSC_SITE_URL` | Service-account Search Analytics ingest |
| `CRON_SECRET` | Auth for `/api/jobs/*` crons (now documented) |
| `NEXT_PUBLIC_SITE_URL` / `MARKETING_HOSTS` | Canonical origin + marketing-host gate (now documented) |
