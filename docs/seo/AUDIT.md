# SEO & AEO Audit — Prompt2Eat vs. the SEO Masterclass Checklist

**Date:** 2026-07-24 · **Scope:** the whole repo (marketing site, `/learn` content hub, venue storefronts, owner dashboard) audited against every tactic in the "Claude Code SEO masterclass" video (winning keywords, blog engine, service pages, on-page, technical, off-page, deployment + measurement, AI SEO).

**Legend:** ✅ have · 🟢 **NEW** shipped (PR #202, Phase 0 + the studio) · 🟣 **shipped in the Phase 1–5 follow-up** · 🟡 partial · ❌ missing (see `DEPLOYMENT_PLAN.md`)

> **Update (2026-07-24):** PR #202 (Phase 0 + the SEO/AEO studio) is merged, and
> the follow-up PR ships **Phases 1–5**: CWV + trust, the content engine, audience
> service pages, Lighthouse CI + the GMB playbook, and first-class venue FAQs
> (closing the AEO loop). Rows updated to 🟣 accordingly.

---

## Scorecard

| # | Video topic | Status | Where / gap |
|---|-------------|--------|-------------|
| A | Winning-keyword pipeline (KD ≤ 30, volume ≥ 100, intent) | 🟣 | `content/keywords.csv` ledger (cluster/intent/priority/status/url); KD/volume filled from a keyword tool |
| A | Keyword clusters per page | 🟣 | Cluster column in the ledger + cluster step in the `/blog-post` skill |
| B | Blog index + posts | ✅ | `/learn` + `/learn/[slug]` — statically generated (6 guides now) |
| B | Voice/humour/stats/stories reference files | 🟣 | `content/voice.md` + `content/references/example-guide.md` |
| B | "Steal the winning SERP format" step | 🟣 | Step 3 of `.claude/skills/blog-post` (WebSearch the top results, match depth) |
| B | Royalty-free images pipeline (Pexels) | 🟡 | Per-guide OG cards ship; a Pexels body-image step is optional in the skill |
| B | Publishing cadence ramp (1/day, never bulk) | 🟣 | Cadence rule encoded in the skill (one post/run, request indexing) |
| C | Service × city/audience landing pages | 🟣 | `app/for/[segment]` × 5 audiences (`lib/marketing-segments.ts`) |
| C | One proven high-converting landing template | 🟣 | Reusable `/for/[segment]` template with a lead CTA |
| D | Static generation for crawlable pages | 🟡 | `/learn/*`, `/for/*`, `/about|contact|privacy|terms` all SSG/static; `/` stays dynamic (host gate); storefronts SSR full HTML |
| E | Meta title + description per page | ✅ | Root template + per-page `generateMetadata` with canonicals |
| E | `/[slug]/menu` duplicate-content fix | 🟢 **NEW** | Canonical → `/{slug}` + description + OG added (`app/[slug]/menu/page.tsx`) |
| E | OG / Twitter cards | ✅ + 🟣 | Brand card + venue covers; **now per-guide OG images too** (`app/learn/[slug]/opengraph-image.tsx`) |
| E | One H1, semantic headings, FAQ blocks | ✅ | Landing + guides use a single `h1`, sectioned `h2/h3`, native `<details>` FAQ |
| E | Internal/external linking discipline | 🟡 | Guides cross-link + CTA; no enforced checklist per post — Phase 2 skill |
| F | sitemap.xml | ✅ | `app/sitemap.ts` — dynamic, includes every LIVE venue storefront |
| F | robots.txt (public open, private closed) | ✅ | `app/robots.ts` — dashboard/admin/api/tokenised flows blocked; **12 AI crawlers explicitly invited** |
| F | noindex belt-and-braces on private routes | 🟢 **NEW** | `robots:{index:false}` on dashboard/admin/onboarding layouts + `/signin` |
| F | Root 404 page | 🟢 **NEW** | `app/not-found.tsx` (venue subtree already had one) |
| F | Lighthouse ~100 loop / Core Web Vitals | 🟣 | Lighthouse CI on every PR (`.github/workflows/lighthouse.yml`); hero images now have dimensions + `fetchpriority` + preload |
| F | Structured data (JSON-LD) | ✅ | Restaurant+Menu graph per venue (`app/[slug]/json-ld.tsx`), Organization+WebSite+SoftwareApplication+FAQPage (`app/_landing/marketing-json-ld.tsx`), Article on guides — XSS-safe serializer (`lib/seo.ts:61`) |
| F | `sameAs` entity links in venue JSON-LD | 🟢 **NEW** | Social + website links now emitted (`app/[slug]/json-ld.tsx`) |
| G | Reusable content-generation skill (`/blog`) | 🟣 | `.claude/skills/blog-post/SKILL.md` — full flow, one guide published through it |
| H | Off-page: PBN avoidance, guest posts, HARO, quality links | ❌ (by design) | Video itself says be careful; playbook doc in Phase 4 — nothing automated |
| I | GitHub + Vercel deployment | ✅ | Vercel (`vercel.json`, region syd1) + CI with a dedicated marketing/SEO smoke job (`.github/workflows/ci.yml`) |
| I | Google Search Console verification | 🟢 **NEW** | Env-driven `verification.google` meta tag (`app/layout.tsx`); verify + submit sitemap = 5-min ops step (see plan) |
| I | Sitemap submission + request indexing | ❌ (manual) | Runbook in `DEPLOYMENT_PLAN.md` Phase 0 ops |
| I | Google Analytics | 🟢 **NEW** | Env-gated GA4 snippet (`app/_components/analytics.tsx`); zero deps, silent until `NEXT_PUBLIC_GA_ID` is set |
| I | Google My Business | 🟣 (playbook) | `docs/seo/GMB_PLAYBOOK.md` owner runbook; the profile itself is owner-run |
| I | Landing conversion testing | ❌ | Phase 4 (needs analytics data first) |
| J | AI SEO / AEO | ✅ + 🟢 + 🟣 | AI-crawler allowlist, `llms.txt`, landing FAQPage; the owner **AEO audit** (PR #202); and **first-class venue FAQs** now render + emit FAQPage per storefront (Phase 5) |
| — | **Owner one-click SEO/AEO feature (Scale plan)** | 🟢 **NEW** | The product feature — see below |

---

## What the repo already had (and does unusually well)

This codebase was clearly built SEO-first. Before this branch it already shipped:

- **Technical SEO fundamentals, all present:** dynamic `sitemap.xml` that auto-lists every live venue (`app/sitemap.ts`), a thoughtful `robots.txt` (`app/robots.ts`), full root metadata with `metadataBase`, title template, OG/Twitter defaults (`app/layout.tsx`), per-page canonicals, a generated 1200×630 OG brand card (`app/opengraph-image.tsx`), PWA manifest + icon set, and `next/font` self-hosted fonts (no layout shift, no third-party font fetch).
- **Structured data with integrity discipline:** four JSON-LD flavours (Restaurant+Menu per venue, Organization/WebSite/SoftwareApplication/FAQPage on the landing, Article on guides) that emit **only real owner-entered fields** — no fabricated ratings, no placeholder markup — through a shared XSS-safe serializer.
- **AEO before it was named:** `robots.ts` explicitly allow-lists GPTBot, ClaudeBot, PerplexityBot, Google-Extended + 8 more, and `public/llms.txt` gives AI assistants a product summary. The video's thesis ("rank for SEO → rank for AI SEO") is already engineering policy here.
- **A real content hub:** `/learn` + five keyword-targeted guides (`lib/marketing-content.ts`), statically generated with `generateStaticParams`, each with metadata, Article schema, cross-links, and a CTA. The visible landing FAQ and the FAQPage schema render from the same data so they can never drift.
- **Product-as-SEO:** every venue gets a crawlable storefront at `/{slug}` with venue-specific metadata, canonical, OG cover image, Restaurant+Menu schema, sitemap inclusion, and reserved-slug protection (`lib/validation.ts`) so a venue can't shadow an app route. Venue pages ranking for "order from X" is a product feature.
- **CI that guards it:** an "E2E smoke (marketing/SEO)" Playwright job runs on every push.

## What was missing (the video-checklist gaps)

1. **Measurement — the biggest gap.** No analytics of any kind, no Search Console verification, no position/click data. You could not see whether any of the above worked. → closed on this branch (GA4 hook, GSC verification hook, GSC stats pipeline); verify + submit sitemap remain 5-minute ops steps.
2. **No keyword pipeline** (the video's chapter 1): no keywords.csv, no KD/volume-driven selection, no cluster tracking, no used/unused ledger. → Phase 2.
3. **No content engine:** 5 hardcoded guides, no voice/reference files, no SERP-format analysis step, no image pipeline, no cadence control, no `/blog` skill. → Phase 2.
4. **No service×city pages** (the video's tactic #2 money pages). → Phase 3.
5. **Core Web Vitals risk on the money pages:** storefront hero images are raw `<img>` with no width/height/fetchpriority — the probable LCP element on exactly the pages meant to rank. → Phase 1.
6. **Trust/E-E-A-T issues on the landing:** placeholder **fake** stats and testimonials (`TODO-METRIC`/`TODO-TESTIMONIAL` in `app/_landing/landing.tsx`) and inert footer links (no Privacy/Terms/About pages). Google's quality systems and human visitors both punish this. → Phase 1.
7. **Smaller polish:** no per-article OG images, no Product schema on `/shop`, `/` not statically cacheable (host-gate via `headers()`), no ISR anywhere, no Lighthouse loop. → Phases 1 & 4.

---

## The new owner-facing feature shipped on this branch

**SEO & AEO studio** at `/dashboard/seo` — nav: Storefront setup → "SEO & AEO". Gated to the **Scale plan** (and trial) via `FEATURES.SEO_AEO` in `lib/billing/plans.ts`, enforced in the page *and* re-checked inside every server action; Pro/Free see an upsell card linking to Plan & billing, and the feature is listed in the billing plan-comparison grid.

| Piece | What it does | Where |
|---|---|---|
| One-click **Run SEO audit** | 18 deterministic checks (profile completeness, menu content, discoverability — weights sum to 100, severity-weighted, bands good/ok/poor) mirroring what the storefront actually emits; plus an AI layer (Haiku, structured output, zod-validated) that assesses content quality and **drafts** an optimized description + search snippet | `lib/seo-audit.ts`, `lib/seo-audit-llm.ts`, `app/dashboard/seo/actions.ts` |
| One-click **Run AEO audit** | 11 checks measuring whether an AI assistant can answer the six canonical diner questions (what/where/when/menu/price/order) from the venue's structured data, plus a Q&A simulation and **suggested FAQs** | same modules |
| **Review-then-apply** | AI copy is never auto-published: the owner sees current vs. suggested side by side and applies with one click; the write re-reads the stored draft server-side (IDOR-scoped by venue) and passes the same validation as the manual About form | `applyGeneratedCopy` in `actions.ts` |
| **Stats dashboard** | Real Google Search Console clicks/impressions/CTR/position for the venue's path (28-day KPIs, daily trend, top queries), score rings with deltas + history sparklines, category breakdowns, prioritised fix list with deep links, run history | `app/dashboard/seo/page.tsx` + `_components/`, `lib/search-console.ts`, `app/api/jobs/seo-stats/route.ts` (daily cron) |
| **Fail-open AI** | Rate-limited (6/h/venue), and any AI failure degrades to a checks-only audit — never an error, never a blocked score | `lib/rate-limit.ts`, `actions.ts` |

Search Console architecture note: storefronts live under `prompt2eat.com/{slug}`, so the GSC property belongs to the **platform** — one service-account credential (env: `GSC_CLIENT_EMAIL/GSC_PRIVATE_KEY/GSC_SITE_URL`) reads stats for every venue path, filtered per venue. Owners never connect Google. Venues on custom domains (Scale) are a known later extension.

New tables (`drizzle/0057_seo_studio.sql`): `seo_audits` (run history), `seo_search_daily` (per-venue daily GSC rows), `seo_search_summary` (top queries). 43 unit tests cover the scorer and LLM contract (`lib/seo-audit.test.ts`, `lib/seo-audit-llm.test.ts` — part of the 116-test suite).

---

**Bottom line:** the foundations the video spends most of its runtime on (technical SEO, on-page structure, structured data, deployment) were already in place and above-average; the gaps were *measurement*, the *content engine*, *money pages*, and an *owner-facing product surface*. Measurement and the product surface ship on this branch; the content engine and money pages are specified phase-by-phase in `DEPLOYMENT_PLAN.md`.
