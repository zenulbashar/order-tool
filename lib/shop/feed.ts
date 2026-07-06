import "server-only";

import { XMLParser } from "fast-xml-parser";
import { unstable_cache } from "next/cache";

/**
 * Hardware-shop product feed for the marketing site.
 *
 * Set `SHOP_FEED_URL` to your MMT price-list feed (the token stays in env). We
 * fetch + parse it, keep only products relevant to setting up and running a
 * hospitality venue (networking, AV, displays/signage, security, computing,
 * peripherals, printing, POS, power), and cache the mapped result for an hour
 * (the raw catalogue is large, so we cache across requests, not just the fetch).
 *
 * MMT schema mapping:
 *   MMTPriceList > Products > Product
 *     Description/ShortDescription   -> name
 *     Pricing/RRPInc (else YourPrice)-> price (+ numeric priceValue)
 *     Category/ParentCategoryName    -> category ; CategoryName -> subcategory
 *     Files/LargeImageURL            -> image (spaces URL-encoded)
 *     MMTCode -> id ; Availability -> inStock + "In stock" badge
 */

export type ShopProduct = {
  id: string;
  name: string;
  price: string;
  priceValue: number;
  category: string;
  subcategory: string | null;
  imageUrl: string | null;
  link: string | null;
  badge: string | null;
  inStock: boolean;
};

export type ShopResult = { products: ShopProduct[]; source: "feed" | "placeholder" };

function ph(
  id: string,
  name: string,
  price: number,
  category: string,
  subcategory: string | null,
  badge: string | null,
): ShopProduct {
  return {
    id,
    name,
    price: `$${price.toFixed(2)}`,
    priceValue: price,
    category,
    subcategory,
    imageUrl: null,
    link: null,
    badge,
    inStock: badge === "In stock",
  };
}

const PLACEHOLDER_PRODUCTS: ShopProduct[] = [
  ph("f1", '50" digital signage display', 640, "Displays", "Digital signage", "In stock"),
  ph("f2", "14\" business laptop", 899, "Computers", "Laptops", "In stock"),
  ph("f3", "10\" business tablet", 329, "Computers", "Tablets", null),
  ph("p4", "4K security camera + NVR kit", 480, "Security", "Surveillance", null),
  ph("p5", "24-port network switch", 210, "Networking", "Switches", "In stock"),
  ph("p6", "Thermal receipt printer", 189, "Point of sale", "Printers", null),
];

// Shown on the homepage when the live feed is unavailable.
const FEATURED_PLACEHOLDERS: ShopProduct[] = [
  PLACEHOLDER_PRODUCTS[0],
  PLACEHOLDER_PRODUCTS[1],
  PLACEHOLDER_PRODUCTS[2],
];

const MAX_SHOP_PRODUCTS = 120;
const MAX_RELEVANT = 600; // cap the cached set (enough for /shop + featured picks)

// Keywords that mark a product as relevant to a hospitality/business setup.
const RELEVANT_KEYWORDS = [
  // networking + cabling
  "ethernet", "network", "cat5", "cat6", "cat 6", "rj45", "patch lead", "switch",
  "router", "wifi", "wi-fi", "wireless", "access point", "poe", "fibre", "fiber",
  "modem", "cable", "connector", "adapter", "converter", "extender", "hdmi",
  "displayport", "usb-c", "kvm",
  // audio / av
  "speaker", "audio", "sound", "soundbar", "amplifier", "microphone", "projector",
  "headset",
  // displays / signage
  "monitor", "display", "signage", "screen", "television", "touchscreen",
  // security
  "camera", "cctv", "surveillance", "dvr", "nvr", "security", "doorbell", "alarm",
  // computing
  "tablet", "ipad", "laptop", "notebook", "chromebook", "desktop", "mini pc",
  "all-in-one",
  // peripherals
  "mouse", "keyboard", "webcam", "docking", "scanner", "barcode",
  // printing
  "printer", "label printer", "receipt",
  // pos / power
  "point of sale", "terminal", "ups", "power distribution", "surge",
];

function hayOf(p: ShopProduct): string {
  return `${p.category} ${p.subcategory ?? ""} ${p.name}`.toLowerCase();
}

function isRelevant(p: ShopProduct): boolean {
  const hay = hayOf(p);
  return RELEVANT_KEYWORDS.some((k) => hay.includes(k));
}

/* ----------------------------- parsing ----------------------------------- */

function textOf(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

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
  const rawPrice = textOf(pricing?.["RRPInc"]) || textOf(pricing?.["YourPrice"]);
  const priceValue = Number(rawPrice.replace(/[^0-9.]/g, ""));
  const price = Number.isFinite(priceValue) && priceValue > 0 ? `$${priceValue.toFixed(2)}` : "";

  const cat = product["Category"] as MmtNode | undefined;
  const category = textOf(cat?.["ParentCategoryName"]) || textOf(cat?.["CategoryName"]) || "Shop";
  const subRaw = textOf(cat?.["CategoryName"]) || null;

  const files = product["Files"] as MmtNode | undefined;
  const imageUrl = encodeImageUrl(
    textOf(files?.["LargeImageURL"]) ||
      textOf(files?.["ThumbnailImageURL"]) ||
      textOf(files?.["HiresImageURL"]),
  );

  const id = textOf(product["MMTCode"]) || `mmt-${index}`;
  const available = Number(textOf(product["Availability"]) || "0");
  const inStock = Number.isFinite(available) && available > 0;

  return {
    id,
    name,
    price,
    priceValue: Number.isFinite(priceValue) ? priceValue : 0,
    category,
    subcategory: subRaw && subRaw !== category ? subRaw : null,
    imageUrl,
    link: null,
    badge: inStock ? "In stock" : null,
    inStock,
  };
}

/** Fetch, parse, filter-to-relevant, cache 1h. Returns [] on any failure. */
const getRelevantProducts = unstable_cache(
  async (): Promise<ShopProduct[]> => {
    const url = process.env.SHOP_FEED_URL;
    if (!url) {
      console.warn("[shop] SHOP_FEED_URL is not set; serving placeholder products.");
      return [];
    }
    try {
      const res = await fetch(url, { next: { revalidate: 3600 } });
      if (!res.ok) {
        console.warn(`[shop] feed fetch failed with HTTP ${res.status}; serving placeholders.`);
        return [];
      }
      const xml = await res.text();
      const parsed = new XMLParser({
        ignoreAttributes: true,
        parseTagValue: false,
        trimValues: true,
      }).parse(xml);
      return extractProducts(parsed)
        .map((product, i) => mapProduct(product, i))
        .filter((p): p is ShopProduct => p !== null && isRelevant(p))
        .slice(0, MAX_RELEVANT);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(`[shop] feed fetch/parse error; serving placeholders: ${reason}`);
      return [];
    }
  },
  ["shop-relevant-products"],
  { revalidate: 3600 },
);

/* ----------------------------- public API -------------------------------- */

export async function getShopProducts(): Promise<ShopResult> {
  const relevant = await getRelevantProducts();
  return relevant.length > 0
    ? { products: relevant.slice(0, MAX_SHOP_PRODUCTS), source: "feed" }
    : { products: PLACEHOLDER_PRODUCTS, source: "placeholder" };
}

/** Cheapest (priced) item, optionally preferring in-stock. */
function cheapest(list: ShopProduct[], preferStock = false): ShopProduct | null {
  const priced = list.filter((p) => p.priceValue > 0);
  if (priced.length === 0) return null;
  priced.sort((a, b) => {
    if (preferStock && a.inStock !== b.inStock) return a.inStock ? -1 : 1;
    return a.priceValue - b.priceValue;
  });
  return priced[0];
}

// Substrings that mark a listing as an ACCESSORY, not a featurable device. Used
// ONLY by looksLikeDevice() inside getFeaturedProducts() to keep the 3 hero
// picks on real devices. It is NOT applied to isRelevant()/getShopProducts, so
// the /shop grid still carries cables, connectors, docks, etc.
const DEVICE_EXCLUDES = [
  "case", "cover", "bag", "sleeve", "charger", "cable", "adapter", "stand",
  "mount", "dock", "screen protector", "battery", "stylus", "pen", "warranty",
  "bracket", "holder", "replacement", "spare", "skin", "strap", "kit", "sticker",
  // Accessory categories/parts that were slipping into the device slots.
  "accessor", "leveller", "leveler", "foot", "cradle", "trolley", "cart", "arm",
  "riser", "plate", "pole", "wall", "psu", "power supply", "extension lead",
  "patch lead",
];
function looksLikeDevice(hay: string): boolean {
  return !DEVICE_EXCLUDES.some((k) => hay.includes(k));
}

/** Real display DEVICES (never accessories): display keywords AND looksLikeDevice. */
function isDisplayDevice(p: ShopProduct): boolean {
  const hay = hayOf(p);
  return /signage|display|monitor|screen|television|\btv\b/.test(hay) && looksLikeDevice(hay);
}

/**
 * The three homepage picks: the cheapest 50" digital signage, the cheapest
 * laptop (preferring in-stock as "latest"), and the cheapest tablet. Falls back
 * to placeholders if the feed is unavailable, and backfills to three if a
 * category is momentarily empty.
 *
 * Each pick is drawn from a DEVICE-only candidate pool (looksLikeDevice), so an
 * accessory (a foot leveller, a tablet dock) can never win a device slot on
 * price. Set SHOP_DEBUG=1 to log the candidate pools + final picks.
 */
export async function getFeaturedProducts(): Promise<ShopProduct[]> {
  const relevant = await getRelevantProducts();
  if (relevant.length === 0) return FEATURED_PLACEHOLDERS;

  // Signage: exact 50-inch display device first; else the cheapest real display
  // device, preferring signage / commercial displays over generic monitors;
  // never an accessory (if nothing qualifies, the backfill fills the slot).
  const fiftyInch = /(?<![0-9])50\s*("|”|inch|-inch|in\b)/i;
  const displayDevices = relevant.filter(isDisplayDevice);
  const signage =
    cheapest(displayDevices.filter((p) => fiftyInch.test(hayOf(p)))) ??
    cheapest(displayDevices.filter((p) => /signage|commercial display/.test(hayOf(p)))) ??
    cheapest(displayDevices);

  const laptopCandidates = relevant.filter((p) => {
    const hay = hayOf(p);
    return /laptop|notebook|chromebook/.test(hay) && looksLikeDevice(hay);
  });
  const laptop = cheapest(laptopCandidates, true);

  const tabletCandidates = relevant.filter((p) => {
    const hay = hayOf(p);
    return /tablet|ipad|galaxy tab/.test(hay) && looksLikeDevice(hay);
  });
  const tablet = cheapest(tabletCandidates, true);

  const picks: ShopProduct[] = [];
  const seen = new Set<string>();
  for (const p of [signage, laptop, tablet]) {
    if (p && !seen.has(p.id)) {
      picks.push(p);
      seen.add(p.id);
    }
  }
  // Backfill to three with the cheapest remaining relevant products.
  if (picks.length < 3) {
    for (const p of [...relevant].filter((x) => x.priceValue > 0).sort((a, b) => a.priceValue - b.priceValue)) {
      if (picks.length >= 3) break;
      if (!seen.has(p.id)) {
        picks.push(p);
        seen.add(p.id);
      }
    }
  }

  if (process.env.SHOP_DEBUG === "1") {
    logFeaturedDebug(relevant.length, {
      signage: displayDevices,
      laptop: laptopCandidates,
      tablet: tabletCandidates,
    }, picks);
  }

  return picks.length > 0 ? picks : FEATURED_PLACEHOLDERS;
}

/* ------------------------------ diagnostics ------------------------------ */

function fmtProduct(p: ShopProduct): string {
  return `${p.name} | $${p.priceValue.toFixed(2)} | inStock:${p.inStock}`;
}

/** Compact candidate/pick summary, gated behind SHOP_DEBUG=1. */
function logFeaturedDebug(
  relevantCount: number,
  pools: Record<string, ShopProduct[]>,
  picks: ShopProduct[],
): void {
  const lines: string[] = [`[shop:debug] relevant products: ${relevantCount}`];
  for (const [name, pool] of Object.entries(pools)) {
    const top = [...pool]
      .filter((p) => p.priceValue > 0)
      .sort((a, b) => a.priceValue - b.priceValue)
      .slice(0, 5)
      .map((p) => `    ${fmtProduct(p)}`);
    lines.push(`[shop:debug] ${name}-candidates: ${pool.length}`);
    lines.push(...top);
  }
  lines.push("[shop:debug] final picks:");
  lines.push(...picks.map((p) => `    ${fmtProduct(p)}`));
  console.info(lines.join("\n"));
}
