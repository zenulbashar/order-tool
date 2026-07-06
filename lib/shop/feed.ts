import "server-only";

import { XMLParser } from "fast-xml-parser";

/**
 * Hardware-shop product feed for the marketing site's /shop page.
 *
 * Set `SHOP_FEED_URL` to your XML product feed (e.g. the zaleit / MMT catalogue
 * feed). We fetch + parse it at request time (cached 1h) and map each item to a
 * `ShopProduct`. If the env is unset, the fetch fails, or nothing parses, we fall
 * back to a small placeholder catalogue so the page always renders.
 *
 * NOTE: the feed's exact XML tag names can't be reached from the build sandbox,
 * so `mapItem` searches a broad list of plausible field names. Once you can see a
 * real feed sample, tighten `FIELD_ALIASES` to the exact tags for clean results.
 */

export type ShopProduct = {
  id: string;
  name: string;
  price: string;
  category: string;
  imageUrl: string | null;
  link: string | null;
  badge: string | null;
};

export type ShopResult = { products: ShopProduct[]; source: "feed" | "placeholder" };

const PLACEHOLDER_PRODUCTS: ShopProduct[] = [
  { id: "p1", name: "QR table stands (10 pack)", price: "$42.00", category: "QR & Signage", imageUrl: null, link: null, badge: "Best seller" },
  { id: "p2", name: "A-frame sidewalk sign", price: "$96.00", category: "QR & Signage", imageUrl: null, link: null, badge: null },
  { id: "p3", name: "Counter tablet stand", price: "$68.00", category: "Stands", imageUrl: null, link: null, badge: null },
  { id: "p4", name: "Adjustable POS stand", price: "$79.00", category: "Stands", imageUrl: null, link: null, badge: "New" },
  { id: "p5", name: "Thermal receipt paper (20 rolls)", price: "$29.00", category: "Consumables", imageUrl: null, link: null, badge: null },
  { id: "p6", name: "Kitchen printer", price: "$189.00", category: "Hardware", imageUrl: null, link: null, badge: "Stripe-ready" },
  { id: "p7", name: "Branded takeaway bags (250)", price: "$88.00", category: "Packaging", imageUrl: null, link: null, badge: "Eco" },
  { id: "p8", name: "Compostable containers (300)", price: "$74.00", category: "Packaging", imageUrl: null, link: null, badge: "Eco" },
];

// Broad alias lists (case-insensitive). Tune to the real feed's tags later.
const FIELD_ALIASES = {
  name: ["name", "title", "productname", "product_name", "tn", "sn", "ln", "itemname", "displayname"],
  price: ["price", "rrp", "saleprice", "sale_price", "cost", "amount", "dp", "sp", "listprice"],
  category: ["category", "cat", "department", "type", "group", "producttype", "um"],
  image: ["imageurl", "image_url", "image", "img", "picture", "thumbnail", "si", "li", "mainimage"],
  link: ["link", "url", "producturl", "product_url", "href", "deeplink", "et"],
  id: ["id", "sku", "code", "productid", "product_id", "ai", "bc", "st"],
  badge: ["badge", "label", "tag", "flag"],
};

function textOf(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    // fast-xml-parser puts element text under "#text" when attributes exist.
    if (typeof v["#text"] === "string") return (v["#text"] as string).trim();
  }
  return "";
}

function pick(item: Record<string, unknown>, aliases: string[]): string {
  const lowerKeys = new Map(Object.keys(item).map((k) => [k.toLowerCase(), k]));
  for (const alias of aliases) {
    const realKey = lowerKeys.get(alias);
    if (realKey != null) {
      const val = textOf(item[realKey]);
      if (val) return val;
    }
  }
  return "";
}

function formatPrice(raw: string): string {
  if (!raw) return "";
  if (/[£$€]/.test(raw)) return raw;
  const n = Number(raw.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? `$${n.toFixed(2)}` : raw;
}

/** Recursively find the longest array of object nodes (the product list). */
function findItemArray(node: unknown, best: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(node)) {
    const objects = node.filter((n) => n && typeof n === "object" && !Array.isArray(n));
    if (objects.length > best.length) best = objects as Record<string, unknown>[];
    for (const child of node) best = findItemArray(child, best);
    return best;
  }
  if (node && typeof node === "object") {
    for (const value of Object.values(node)) best = findItemArray(value, best);
  }
  return best;
}

function mapItem(item: Record<string, unknown>, index: number): ShopProduct | null {
  const name = pick(item, FIELD_ALIASES.name);
  if (!name) return null;
  const price = formatPrice(pick(item, FIELD_ALIASES.price));
  const category = pick(item, FIELD_ALIASES.category) || "Shop";
  const image = pick(item, FIELD_ALIASES.image);
  const link = pick(item, FIELD_ALIASES.link);
  const id = pick(item, FIELD_ALIASES.id) || `feed-${index}`;
  const badge = pick(item, FIELD_ALIASES.badge) || null;
  return {
    id,
    name,
    price: price || "",
    category,
    imageUrl: image || null,
    link: link || null,
    badge,
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
      ignoreAttributes: false,
      attributeNamePrefix: "",
      trimValues: true,
    }).parse(xml);
    const items = findItemArray(parsed);
    const products = items
      .map((item, i) => mapItem(item, i))
      .filter((p): p is ShopProduct => p !== null)
      .slice(0, 60);
    return products.length > 0
      ? { products, source: "feed" }
      : { products: PLACEHOLDER_PRODUCTS, source: "placeholder" };
  } catch {
    return { products: PLACEHOLDER_PRODUCTS, source: "placeholder" };
  }
}
