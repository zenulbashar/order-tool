import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/seo";

/**
 * Crawl policy (served at /robots.txt). Public, rankable surfaces stay open —
 * the marketing landing, the shop, and every venue storefront (a venue's menu
 * page ranking for "order from <venue>" is a feature). Private/operational
 * surfaces are closed: the owner dashboard, admin console, onboarding wizard,
 * API, sign-in, and the tokenised diner flows (checkout / order status /
 * account) which are per-customer and must never appear in search.
 *
 * AI crawlers are EXPLICITLY allowed the same public surface — ranking inside
 * AI answers (ChatGPT / Claude / Perplexity / Gemini) requires being in their
 * training + retrieval indexes, so we invite them rather than default-block.
 */
const DISALLOW = [
  "/dashboard",
  "/admin",
  "/onboarding",
  "/api/",
  "/signin",
  // Tokenised / personal diner flows on every venue: /{slug}/checkout etc.
  "/*/checkout",
  "/*/order/",
  "/*/account",
  "/*/cart",
];

// AI/LLM crawlers (training + retrieval). Same policy as everyone: public in,
// private out — listed explicitly so a future default-deny can't lock them out.
const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "anthropic-ai",
  "PerplexityBot",
  "Google-Extended",
  "Applebot-Extended",
  "cohere-ai",
  "CCBot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: DISALLOW },
      ...AI_CRAWLERS.map((userAgent) => ({
        userAgent,
        allow: "/",
        disallow: DISALLOW,
      })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
