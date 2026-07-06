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
  ph("f3", "Compact mini PC", 899, "Computers", "Mini PC", "In stock"),
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

// Exact MMT category names to KEEP in the /shop grid, matched against a
// product's category AND subcategory (case-insensitive). Edit to taste.
const HOSPITALITY_CATEGORIES = new Set<string>([
  // Computing
  "Computers", "Desktop Computers", "Notebooks", "Tablet",
  // Displays / signage
  "Display", "Monitors", "Monitors - Digital Signage", "LED TV", "Interactive Flat Panels",
  // Projectors (devices only)
  "Projectors", "Home Theatre Projectors", "Projectors - Large Venue", "Projectors - Ultra Short Throw", "Projectors - Data", "Projectors - Smart",
  // Networking
  "Networking", "Network - Network Cables", "Network - Switches", "Network - Router", "Network - Wireless Access Point", "Network - NICs & Adaptors", "Cables and Connectors", "USB - Cables",
  // Security
  "Surveillance - IP Cameras", "Surveillance - IP Recorders",
  // Servers / storage
  "Servers", "NAS - Network Attached Storage",
  // Input / peripherals
  "Keyboards", "Keyboards & Mice", "Mice", "Rugged & Industrial Keyboards", "Scanners", "USB Web Cams", "Microphones",
  // Printing
  "Laser/LED Printer",
  // Audio / AV
  "Audio", "Speakers", "AV Control",
  // Power
  "UPS", "Power Protection",
].map((c) => c.toLowerCase()));

function hayOf(p: ShopProduct): string {
  return `${p.category} ${p.subcategory ?? ""} ${p.name}`.toLowerCase();
}

function isRelevant(p: ShopProduct): boolean {
  const cat = p.category.trim().toLowerCase();
  const sub = (p.subcategory ?? "").trim().toLowerCase();
  return HOSPITALITY_CATEGORIES.has(cat) || (sub !== "" && HOSPITALITY_CATEGORIES.has(sub));
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

/** Fetch + parse + filter the WHOLE feed to relevant products. [] on failure. */
async function fetchRelevantProducts(): Promise<ShopProduct[]> {
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
      .filter((p): p is ShopProduct => p !== null && isRelevant(p));
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(`[shop] feed fetch/parse error; serving placeholders: ${reason}`);
    return [];
  }
}

type ShopData = { products: ShopProduct[]; featured: ShopProduct[] };

/**
 * Fetch the feed once, then derive BOTH the /shop grid (first 120) and the 3
 * homepage featured picks from the FULL relevant set, and cache only that small
 * result for an hour. Deriving the picks before slicing is load-bearing: the
 * feed carries thousands of products, so selecting from a capped slice would
 * starve the picks (e.g. no tablet in the first N by feed order).
 */
const getShopData = unstable_cache(
  async (): Promise<ShopData> => {
    const relevant = await fetchRelevantProducts();
    if (relevant.length === 0) return { products: [], featured: [] };
    return {
      products: relevant.slice(0, MAX_SHOP_PRODUCTS),
      featured: selectFeatured(relevant),
    };
  },
  ["shop-data-v2"],
  { revalidate: 3600 },
);

/* ----------------------------- public API -------------------------------- */

export async function getShopProducts(): Promise<ShopResult> {
  const { products } = await getShopData();
  return products.length > 0
    ? { products, source: "feed" }
    : { products: PLACEHOLDER_PRODUCTS, source: "placeholder" };
}

/**
 * The three homepage picks: cheapest 50" digital signage, cheapest laptop, and
 * cheapest mini PC, each preferring in-stock (a homepage hero should be
 * buyable). Falls back to placeholders when the feed is unavailable.
 */
export async function getFeaturedProducts(): Promise<ShopProduct[]> {
  const { featured } = await getShopData();
  return featured.length > 0 ? featured : FEATURED_PLACEHOLDERS;
}

/* --------------------------- featured selection --------------------------- */

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

// Substrings that mark a listing as an ACCESSORY / part, not a featurable
// device. Used ONLY by looksLikeDevice() during featured selection to keep the
// 3 hero picks on real devices. It is NOT applied to isRelevant()/getShopProducts,
// so the /shop grid still carries cables, connectors, docks, etc.
const DEVICE_EXCLUDES = [
  "case", "cover", "bag", "sleeve", "charger", "cable", "adapter", "stand",
  "mount", "dock", "screen protector", "battery", "stylus", "pen", "warranty",
  "bracket", "holder", "replacement", "spare", "skin", "strap", "kit", "sticker",
  // Accessory categories that slipped into the device slots (real-feed audit).
  "accessor", "leveller", "leveler", "foot", "cradle", "trolley", "cart", "arm",
  "riser", "plate", "pole", "wall", "psu", "power supply", "extension lead",
  "patch lead", "mounting",
  // Parts and non-device items miscategorised alongside devices (real-feed audit:
  // privacy filters, RAM/SSD modules, charging cabinets, a NAS in "signage").
  "filter", "privacy", "sodimm", "dimm", "ssd", "hdd", "memory", "cabinet",
  "component", "module", "antenna", "nas ",
];
function looksLikeDevice(hay: string): boolean {
  return !DEVICE_EXCLUDES.some((k) => hay.includes(k));
}

/** Real display DEVICES (never accessories): display keywords AND looksLikeDevice. */
function isDisplayDevice(p: ShopProduct): boolean {
  const hay = hayOf(p);
  return /signage|display|monitor|screen|television|\btv\b/.test(hay) && looksLikeDevice(hay);
}

/** A commercial / professional signage display (vs a consumer TV or monitor). */
function isSignage(p: ShopProduct): boolean {
  return /signage|commercial|professional|large display/.test(hayOf(p));
}

/**
 * Pick the three homepage devices (signage, laptop, mini PC) from the FULL
 * relevant set. Each slot draws from a DEVICE-only pool (looksLikeDevice) so an
 * accessory can never win on price, and prefers in-stock. Signage is tiered: a
 * 50" commercial/professional display first, else any 50" display, else any
 * signage, else any display. Backfills to three from cheapest in-stock DEVICES
 * (never a stray accessory). Set SHOP_DEBUG=1 to log the candidate pools + picks.
 */
function selectFeatured(relevant: ShopProduct[]): ShopProduct[] {
  const fiftyInch = /(?<![0-9])50\s*("|”|inch|-inch|in\b)/i;
  const displayDevices = relevant.filter(isDisplayDevice);
  const signage =
    cheapest(displayDevices.filter((p) => fiftyInch.test(hayOf(p)) && isSignage(p)), true) ??
    cheapest(displayDevices.filter((p) => fiftyInch.test(hayOf(p))), true) ??
    cheapest(displayDevices.filter(isSignage), true) ??
    cheapest(displayDevices, true);

  const laptopCandidates = relevant.filter((p) => {
    const hay = hayOf(p);
    return /laptop|notebook|chromebook/.test(hay) && looksLikeDevice(hay);
  });
  const laptop = cheapest(laptopCandidates, true);

  // Third slot: a compact mini PC / small-form-factor desktop. (The MMT feed
  // carries no consumer tablets and no receipt printers, so this is the
  // hospitality-relevant device that rounds out the trio.)
  const miniPcCandidates = relevant.filter((p) => {
    const hay = hayOf(p);
    return /mini pc|mini-pc|\btiny\b|\bnuc\b|thinkcentre|small form|\bsff\b|\bmff\b|prodesk|elitedesk|desktop mini/.test(hay) &&
      // Not a monitor (a "Tiny-in-One" / all-in-one is a display, not a PC).
      !isDisplayDevice(p) &&
      !/in-one|all in one|\baio\b/.test(hay) &&
      looksLikeDevice(hay);
  });
  const miniPc = cheapest(miniPcCandidates, true);

  const picks: ShopProduct[] = [];
  const seen = new Set<string>();
  for (const p of [signage, laptop, miniPc]) {
    if (p && !seen.has(p.id)) {
      picks.push(p);
      seen.add(p.id);
    }
  }
  // Backfill to three with the cheapest in-stock DEVICES (not a raw accessory).
  if (picks.length < 3) {
    const devicePool = relevant
      .filter((p) => p.priceValue > 0 && looksLikeDevice(hayOf(p)))
      .sort((a, b) => (a.inStock !== b.inStock ? (a.inStock ? -1 : 1) : a.priceValue - b.priceValue));
    for (const p of devicePool) {
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
      miniPc: miniPcCandidates,
    }, picks);
  }

  return picks;
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
