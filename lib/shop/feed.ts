import "server-only";

import { XMLParser } from "fast-xml-parser";

/**
 * Hardware-shop product feed for the marketing /shop page.
 *
 * Set `SHOP_FEED_URL` to your MMT price-list feed (the token stays in env, never
 * in source). We fetch + parse it at request time (cached 1h) and map each
 * `<Product>` to a `ShopProduct`. If the env is unset, the fetch fails, or
 * nothing parses, we fall back to a small placeholder catalogue so the page
 * always renders.
 *
 * Mapping is tuned to the real MMT schema:
 *   MMTPriceList > Products > Product
 *     Description/ShortDescription  -> name
 *     Pricing/RRPInc (else YourPrice) -> price
 *     Category/ParentCategoryName   -> category (CategoryName -> subcategory)
 *     Files/LargeImageURL           -> image (spaces URL-encoded)
 *     MMTCode                       -> id ; Availability -> "In stock" badge
 */

export type ShopProduct = {
  id: string;
  name: string;
  price: string;
  category: string;
  subcategory: string | null;
  imageUrl: string | null;
  link: string | null;
  badge: string | null;
};

export type ShopResult = { products: ShopProduct[]; source: "feed" | "placeholder" };

const PLACEHOLDER_PRODUCTS: ShopProduct[] = [
  { id: "p1", name: "Tablet POS stand", price: "$79.00", category: "Point of sale", subcategory: "Stands", imageUrl: null, link: null, badge: "Popular" },
  { id: "p2", name: "Rugged tablet case", price: "$42.00", category: "Cases & covers", subcategory: null, imageUrl: null, link: null, badge: null },
  { id: "p3", name: "Thermal receipt printer", price: "$189.00", category: "Point of sale", subcategory: "Printers", imageUrl: null, link: null, badge: null },
  { id: "p4", name: "UPS power backup", price: "$249.00", category: "Power protection", subcategory: null, imageUrl: null, link: null, badge: "In stock" },
  { id: "p5", name: "QR table stands (10 pack)", price: "$42.00", category: "Signage", subcategory: null, imageUrl: null, link: null, badge: null },
  { id: "p6", name: "Receipt paper (20 rolls)", price: "$29.00", category: "Consumables", subcategory: null, imageUrl: null, link: null, badge: null },
];

const MAX_PRODUCTS = 120;

/** Get the plain text of a parsed node (handles empty and numeric-like nodes). */
function textOf(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

function formatPrice(raw: string): string {
  if (!raw) return "";
  const n = Number(raw.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? `$${n.toFixed(2)}` : "";
}

/** MMT image URLs contain spaces (".../Product assets/..."); encode them. */
function encodeImageUrl(raw: string): string | null {
  if (!raw) return null;
  try {
    return encodeURI(raw);
  } catch {
    return raw;
  }
}

type MmtNode = Record<string, unknown>;

function extractProducts(root: unknown): MmtNode[] {
  const list = (root as MmtNode | undefined)?.["MMTPriceList"] as MmtNode | undefined;
  const products = (list?.["Products"] as MmtNode | undefined)?.["Product"];
  if (Array.isArray(products)) return products as MmtNode[];
  if (products && typeof products === "object") return [products as MmtNode];
  return [];
}

function mapProduct(product: MmtNode, index: number): ShopProduct | null {
  const description = product["Description"] as MmtNode | undefined;
  const name = textOf(description?.["ShortDescription"]);
  if (!name) return null;

  const pricing = product["Pricing"] as MmtNode | undefined;
  const price =
    formatPrice(textOf(pricing?.["RRPInc"])) ||
    formatPrice(textOf(pricing?.["YourPrice"]));

  const cat = product["Category"] as MmtNode | undefined;
  const category = textOf(cat?.["ParentCategoryName"]) || textOf(cat?.["CategoryName"]) || "Shop";
  const subcategory = textOf(cat?.["CategoryName"]) || null;

  const files = product["Files"] as MmtNode | undefined;
  const imageUrl = encodeImageUrl(
    textOf(files?.["LargeImageURL"]) ||
      textOf(files?.["ThumbnailImageURL"]) ||
      textOf(files?.["HiresImageURL"]),
  );

  const id = textOf(product["MMTCode"]) || `mmt-${index}`;
  const available = Number(textOf(product["Availability"]) || "0");

  return {
    id,
    name,
    price,
    category,
    subcategory: subcategory && subcategory !== category ? subcategory : null,
    imageUrl,
    link: null,
    badge: available > 0 ? "In stock" : null,
  };
}

export async function getShopProducts(): Promise<ShopResult> {
  const url = process.env.SHOP_FEED_URL;
  if (!url) return { products: PLACEHOLDER_PRODUCTS, source: "placeholder" };

  try {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return { products: PLACEHOLDER_PRODUCTS, source: "placeholder" };
    const xml = await res.text();
    const parsed = new XMLParser({
      ignoreAttributes: true,
      parseTagValue: false,
      trimValues: true,
    }).parse(xml);

    const products = extractProducts(parsed)
      .map((product, i) => mapProduct(product, i))
      .filter((p): p is ShopProduct => p !== null)
      .slice(0, MAX_PRODUCTS);

    return products.length > 0
      ? { products, source: "feed" }
      : { products: PLACEHOLDER_PRODUCTS, source: "placeholder" };
  } catch {
    return { products: PLACEHOLDER_PRODUCTS, source: "placeholder" };
  }
}
