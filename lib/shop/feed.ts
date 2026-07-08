import "server-only";

import { XMLParser } from "fast-xml-parser";
import { unstable_cache } from "next/cache";

import { getShopConfig, isCategoryVisible, type ShopConfig } from "./config";

/**
 * Hardware-shop product feed for the marketing site.
 *
 * Set `SHOP_FEED_URL` to your MMT price-list feed (the token stays in env). We
 * fetch + parse the whole catalogue and cache it for an hour; then, per request,
 * we apply the admin config (lib/shop/config.ts) — which leaf categories show
 * (default = DEFAULT_SHOP_CATEGORIES), per-product hide, per-product price
 * override, and a global markup — so admin edits reflect immediately without a
 * re-fetch. The default assortment stays hospitality gear (networking, AV,
 * displays/signage, security, computing, peripherals, printing, POS, power).
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

function hayOf(p: ShopProduct): string {
  return `${p.category} ${p.subcategory ?? ""} ${p.name}`.toLowerCase();
}

/** The leaf category used for visibility + the /shop pills (specific bucket). */
function leafCategory(p: ShopProduct): string {
  return p.subcategory ?? p.category;
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

/**
 * Fetch + parse + map the WHOLE feed (no relevance filter). Cached for an hour;
 * the admin config (categories / hides / pricing) is applied fresh per request
 * on top, so it must be able to reach any category the admin might switch on.
 * [] on any failure.
 */
const getAllProducts = unstable_cache(
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
        .filter((p): p is ShopProduct => p !== null);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(`[shop] feed fetch/parse error; serving placeholders: ${reason}`);
      return [];
    }
  },
  ["shop-all-products-v1"],
  { revalidate: 3600 },
);

/** Apply a per-product price override (wins) or the global markup to a product. */
function applyPricing(p: ShopProduct, cfg: ShopConfig): ShopProduct {
  const override = cfg.overrides.get(p.id);
  let dollars: number;
  if (override?.priceOverrideCents != null) {
    dollars = override.priceOverrideCents / 100;
  } else if (cfg.markupBps > 0 && p.priceValue > 0) {
    dollars = p.priceValue * (1 + cfg.markupBps / 10000);
  } else {
    return p; // no override, no markup → leave the feed price untouched
  }
  if (!(dollars > 0)) return p;
  const rounded = Math.round(dollars * 100) / 100;
  return { ...p, priceValue: rounded, price: `$${rounded.toFixed(2)}` };
}

/** Products in a currently-visible, non-hidden category, priced per config. */
function visibleProducts(all: ShopProduct[], cfg: ShopConfig): ShopProduct[] {
  return all
    .filter((p) => isCategoryVisible(leafCategory(p), cfg) && !cfg.overrides.get(p.id)?.hidden)
    .map((p) => applyPricing(p, cfg));
}

/* ----------------------------- public API -------------------------------- */

/** All feed products with their raw leaf category (admin catalogue view). */
export async function getAllFeedProducts(): Promise<ShopProduct[]> {
  return getAllProducts();
}

export async function getShopProducts(): Promise<ShopResult> {
  const all = await getAllProducts();
  // Feed unreachable or empty → show placeholders so the page isn't blank.
  if (all.length === 0) return { products: PLACEHOLDER_PRODUCTS, source: "placeholder" };
  const cfg = await getShopConfig();
  // Visible category + not hidden + currently in stock, priced per config.
  const products = visibleProducts(all, cfg).filter((p) => p.inStock);
  return { products, source: "feed" };
}

/**
 * The three homepage picks: cheapest 50" digital signage, cheapest laptop, and
 * cheapest mini PC, each preferring in-stock (a homepage hero should be
 * buyable). Respects the admin config (hidden/category/pricing). Falls back to
 * placeholders when the feed is unavailable.
 */
export async function getFeaturedProducts(): Promise<ShopProduct[]> {
  const all = await getAllProducts();
  if (all.length === 0) return FEATURED_PLACEHOLDERS;
  const cfg = await getShopConfig();
  const featured = selectFeatured(visibleProducts(all, cfg));
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
