import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  platformSettings,
  shopCategorySettings,
  shopProductOverrides,
} from "@/lib/db/schema";

/**
 * Admin-tunable config for the live-feed /shop page. Read fresh per request and
 * merged onto the (separately cached) MMT feed in lib/shop/feed.ts, so admin
 * edits reflect immediately. Three levers: which leaf categories show (default
 * = DEFAULT_SHOP_CATEGORIES, overridable per category), per-product hide + price
 * override, and a global markup applied to feed prices.
 */

// Default-visible leaf categories (the code allowlist). A shop_category_settings
// row overrides one of these either way. Lowercased for case-insensitive match.
export const DEFAULT_SHOP_CATEGORIES = new Set<string>(
  [
    // Computing
    "Computers", "Desktop Computers", "Desktop Computers Workstation", "Notebooks", "Notebooks Workstation", "Tablet",
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
  ].map((c) => c.toLowerCase()),
);

export const SHOP_MARKUP_KEY = "shop_markup_bps";
const MAX_MARKUP_BPS = 1_000_000; // 10000% — a generous sanity ceiling

export type ShopOverride = { hidden: boolean; priceOverrideCents: number | null };

export type ShopConfig = {
  /** lowercased leaf category → explicit visibility (absent ⇒ code default). */
  categoryVisibility: Map<string, boolean>;
  /** MMT code → override. */
  overrides: Map<string, ShopOverride>;
  /** Global markup in basis points (1000 = +10%). */
  markupBps: number;
};

function parseMarkupBps(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.round(n), MAX_MARKUP_BPS);
}

/** Read all three levers in one round of queries. */
export async function getShopConfig(): Promise<ShopConfig> {
  const [cats, ovrs, markupRow] = await Promise.all([
    db.select().from(shopCategorySettings),
    db.select().from(shopProductOverrides),
    db
      .select({ value: platformSettings.value })
      .from(platformSettings)
      .where(eq(platformSettings.key, SHOP_MARKUP_KEY))
      .limit(1),
  ]);

  const categoryVisibility = new Map<string, boolean>();
  for (const c of cats) categoryVisibility.set(c.category.trim().toLowerCase(), c.visible);

  const overrides = new Map<string, ShopOverride>();
  for (const o of ovrs) {
    overrides.set(o.mmtCode, { hidden: o.hidden, priceOverrideCents: o.priceOverrideCents });
  }

  return { categoryVisibility, overrides, markupBps: parseMarkupBps(markupRow[0]?.value) };
}

/** Effective visibility for a leaf category: explicit setting, else code default. */
export function isCategoryVisible(leaf: string, cfg: ShopConfig): boolean {
  const key = leaf.trim().toLowerCase();
  return cfg.categoryVisibility.get(key) ?? DEFAULT_SHOP_CATEGORIES.has(key);
}

export async function getShopMarkupBps(): Promise<number> {
  const [row] = await db
    .select({ value: platformSettings.value })
    .from(platformSettings)
    .where(eq(platformSettings.key, SHOP_MARKUP_KEY))
    .limit(1);
  return parseMarkupBps(row?.value);
}
