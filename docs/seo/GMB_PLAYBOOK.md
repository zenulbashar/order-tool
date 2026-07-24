# Google Business Profile playbook (for venue owners)

The single highest-return, lowest-effort local-SEO move for a hospitality venue
is a complete, active Google Business Profile (the listing that shows in Google
Maps and the local "3-pack"). Prompt2Eat handles a venue's *website* SEO —
metadata, structured data, sitemap, an ordering storefront that ranks and
answers AI questions — but the Business Profile lives on Google and the owner
(or their success manager) sets it up. This is the runbook.

Give this to venues during onboarding, and surface it as a checklist card on
`/dashboard/seo` in a future iteration (see `DEPLOYMENT_PLAN.md`, Phase 5).

## 1. Claim or create the profile

- Go to business.google.com and search for the venue. Claim it if it already
  exists (often auto-created from map data); otherwise create it.
- Verify ownership (postcard, phone, or video — Google chooses the method).

## 2. Make it complete and accurate

Completeness is a ranking factor, and consistency with the storefront matters:

- **Name**: the real trading name, no keyword stuffing ("Joe's Café", not
  "Joe's Café Best Coffee Brisbane").
- **Category**: the most specific primary category (e.g. "Café", "Pizza
  restaurant"), plus relevant secondary categories.
- **Address & service area**: exact, and identical to the address set in
  Prompt2Eat (`/dashboard/settings/hours`) so the two never conflict.
- **Hours**: match the opening hours in Prompt2Eat exactly. Update both together,
  and set special hours for public holidays.
- **Phone & website**: the website should point to the venue's Prompt2Eat
  storefront (`prompt2eat.com/<slug>`), or the venue's own domain if on Scale.
- **Menu / ordering link**: add the storefront URL as the menu and "Order online"
  link so a searcher can order straight from the profile.

## 3. Photos

- Add a logo and a cover photo (the same brand assets used in Prompt2Eat).
- Add real photos of the food, the space, and the exterior. Refresh them
  periodically — active profiles with recent photos perform better.

## 4. Keep it active

- **Reviews**: ask happy customers to leave one, and reply to every review
  (positive and negative) promptly and politely. Review volume, rating, and
  owner responses all feed local ranking.
- **Posts**: use Google Posts for specials, events, and seasonal menus. An active
  profile signals a live business.
- **Q&A**: seed and answer common questions (parking, dietary options, booking).

## 5. Keep NAP consistent everywhere

NAP = Name, Address, Phone. Keep it identical across the Google Business Profile,
the Prompt2Eat storefront, and any other listing (social profiles, directories).
Inconsistent NAP is one of the most common local-SEO problems, and it is entirely
avoidable — the storefront's structured data (`app/[slug]/json-ld.tsx`) already
publishes the venue's address, phone, hours, and geo, so just mirror those exact
values on the profile.

## How this ties back to Prompt2Eat

- The storefront's Restaurant/Menu JSON-LD, sitemap inclusion, and metadata make
  the venue's *ordering page* findable and answerable — the Business Profile makes
  the venue findable on the *map*. Together they cover both halves of local search.
- The owner SEO & AEO studio (`/dashboard/seo`) scores the exact fields the
  profile also needs (address, phone, hours, geo), so getting the audit to green
  is most of the work of a complete Business Profile too.
