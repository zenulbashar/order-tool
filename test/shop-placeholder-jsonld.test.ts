import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The /shop page must not publish offers for products that do not exist.
 *
 * With `SHOP_FEED_URL` unset, `getShopProducts()` returns six hardcoded
 * placeholders and reports `source: "placeholder"`. The page destructured only
 * `products` and threw the discriminant away, so those placeholders were
 * emitted as Product/Offer structured data with `priceCurrency: "AUD"`, a real
 * price and InStock availability.
 *
 * `ShopJsonLd`'s own docblock says "the markup never claims an offer the page
 * doesn't display" — true of the PAGE, and silent on whether the offer is real.
 * And `app/robots.ts` deliberately admits GPTBot, ClaudeBot and PerplexityBot,
 * so this was machine-readable commerce data about products nobody can buy.
 *
 * The deployment plan carries this as operator step C3 ("set SHOP_FEED_URL, or
 * hide /shop"). An env var nobody set should degrade to publishing nothing, not
 * to publishing fiction.
 */
function stripComments(src: string): string {
  // Same reason as test/checkout-dead-ends.test.ts: the comment explaining this
  // fix names the very things asserted absent.
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}
const source = (file: string) =>
  stripComments(readFileSync(join(process.cwd(), file), "utf8"));

describe("shop structured data", () => {
  it("is emitted only for a real feed", () => {
    const page = source("app/shop/page.tsx");
    expect(page, "the source discriminant must be read").toContain("source");
    expect(page).toContain('source === "feed" ? <ShopJsonLd');
  });

  it("does not render ShopJsonLd unconditionally", () => {
    // The exact shape of the bug: <ShopJsonLd products={products} /> with no
    // guard in front of it.
    const page = source("app/shop/page.tsx");
    expect(page).not.toMatch(/^\s*<ShopJsonLd products=\{products\} \/>/m);
  });

  it("still has placeholders to fall back to", () => {
    // The counterweight. Suppressing the MARKUP is the fix; the page itself
    // should still render something rather than an empty grid, and the feed
    // module keeps reporting which it is.
    const feed = source("lib/shop/feed.ts");
    expect(feed).toContain("PLACEHOLDER_PRODUCTS");
    expect(feed).toContain('source: "placeholder"');
    expect(feed).toContain('source: "feed"');
  });
});
