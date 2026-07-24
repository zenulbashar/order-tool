import { serializeJsonLd, SITE_URL } from "@/lib/seo";
import type { ShopProduct } from "@/lib/shop/feed";

/** Cap the graph so the inline JSON-LD stays lean on a long feed. */
const MAX_PRODUCTS = 40;

/**
 * Structured data for the /shop grid: an ItemList of Product offers built from
 * the SAME feed the page renders, with the prices actually shown (AUD) and
 * real availability. Only priced items are emitted, so the markup never claims
 * an offer the page doesn't display. Server-only; reuses the shared XSS-safe
 * serializer.
 */
export function ShopJsonLd({ products }: { products: ShopProduct[] }) {
  const items = products
    .filter((product) => product.priceValue > 0)
    .slice(0, MAX_PRODUCTS);
  if (items.length === 0) return null;

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Prompt2Eat Shop — venue equipment & supplies",
    url: `${SITE_URL}/shop`,
    numberOfItems: items.length,
    itemListElement: items.map((product, index) => {
      const item: Record<string, unknown> = {
        "@type": "Product",
        name: product.name,
        offers: {
          "@type": "Offer",
          priceCurrency: "AUD",
          price: product.priceValue.toFixed(2),
          availability: product.inStock
            ? "https://schema.org/InStock"
            : "https://schema.org/OutOfStock",
        },
      };
      if (product.imageUrl) item.image = product.imageUrl;
      if (product.category) item.category = product.category;
      return { "@type": "ListItem", position: index + 1, item };
    }),
  };

  return (
    <script
      type="application/ld+json"
      // Safe: serializeJsonLd escapes "<" so no value can break out of the tag.
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
    />
  );
}
