/**
 * Marketing-site SEO constants + helpers, shared by the root metadata, the
 * landing JSON-LD, robots.ts, and sitemap.ts so the product describes itself
 * with ONE voice everywhere (Google, social cards, and AI answer engines).
 *
 * Dependency-free (no db/server imports) so metadata routes can use it at
 * build time without an environment.
 */

/**
 * Canonical public origin of the marketing site. Overridable for previews via
 * NEXT_PUBLIC_SITE_URL; defaults to the production domain (which matches the
 * DEFAULT_MARKETING_HOSTS gate in app/page.tsx).
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://prompt2eat.com"
).replace(/\/+$/, "");

export const SITE_NAME = "Prompt2Eat";

/** One-line positioning used for titles/cards. */
export const SITE_TAGLINE = "Just say what you're hungry for";

/**
 * The canonical product description — mirrors the landing hero copy so search
 * snippets, social cards, and AI-chat citations all tell the same story.
 */
export const SITE_DESCRIPTION =
  "Prompt2Eat is the AI-native ordering platform for restaurants and cafés. " +
  "Diners scan a QR code and just say what they feel like — the AI concierge " +
  "finds the dish, sorts the sides, and sends the order to the kitchen. " +
  "Owners import a menu from a photo, take payments (cards, Apple Pay, " +
  "Google Pay, PayTo pay-by-bank), and run orders, stock, and staff in one place.";

/** Search-intent phrases the product genuinely answers. */
export const SITE_KEYWORDS = [
  "AI ordering system for restaurants",
  "QR code ordering",
  "restaurant online ordering platform",
  "AI food ordering concierge",
  "menu import from photo",
  "contactless dine-in ordering",
  "restaurant POS alternative",
  "PayTo pay by bank restaurant",
  "kitchen docket printing",
  "hospitality ordering software",
];

const LINE_SEP = String.fromCharCode(0x2028);
const PARA_SEP = String.fromCharCode(0x2029);

/**
 * Serialize JSON-LD for a <script type="application/ld+json"> tag.
 * JSON.stringify handles JSON escaping but NOT the HTML hazard of a literal
 * "</script>" inside text, which would close the tag early. Escaping each "<"
 * neutralises </script>, <script and <!-- while still parsing back to the
 * exact data — the approach the Next.js JSON-LD guide recommends. (Same
 * technique as app/[slug]/json-ld.tsx, kept separate so the diner module
 * stays self-contained.)
 */
export function serializeJsonLd(jsonLd: Record<string, unknown>): string {
  return JSON.stringify(jsonLd)
    .replace(/</g, "\\u003c")
    .split(LINE_SEP)
    .join("\\u2028")
    .split(PARA_SEP)
    .join("\\u2029");
}
