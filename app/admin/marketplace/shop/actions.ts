"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import {
  platformAuditLog,
  platformSettings,
  shopCategorySettings,
  shopProductOverrides,
} from "@/lib/db/schema";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { SHOP_MARKUP_KEY } from "@/lib/shop/config";
import { getAllFeedProducts } from "@/lib/shop/feed";

const ADMIN_SHOP = "/admin/marketplace/shop";
const MAX_MARKUP_BPS = 1_000_000;

/** Revalidate every surface the shop config feeds. */
function revalidateShop(): void {
  revalidatePath(ADMIN_SHOP);
  revalidatePath("/shop");
  revalidatePath("/"); // homepage featured teaser
}

function leafOf(p: { category: string; subcategory: string | null }): string {
  return p.subcategory ?? p.category;
}

/** Set the global markup applied to feed prices (entered as a percentage). */
export async function saveShopMarkup(formData: FormData): Promise<void> {
  const admin = await requirePlatformAdmin();

  const pct = Number(String(formData.get("markupPct") ?? "").trim());
  const bps =
    Number.isFinite(pct) && pct >= 0 ? Math.min(Math.round(pct * 100), MAX_MARKUP_BPS) : 0;

  await db
    .insert(platformSettings)
    .values({ key: SHOP_MARKUP_KEY, value: String(bps) })
    .onConflictDoUpdate({
      target: platformSettings.key,
      set: { value: String(bps), updatedAt: new Date() },
    });

  await db.insert(platformAuditLog).values({
    actorEmail: admin.email,
    action: "shop_markup",
    detail: `${(bps / 100).toFixed(2)}%`,
  });

  revalidateShop();
}

/**
 * Persist category visibility. The form submits every CHECKED category under
 * the `visible` field; we re-derive the full category universe from the feed
 * and write one row per category (visible = whether it was checked).
 */
export async function saveShopCategories(formData: FormData): Promise<void> {
  const admin = await requirePlatformAdmin();

  const checked = new Set(formData.getAll("visible").map((v) => String(v)));
  const universe = Array.from(
    new Set((await getAllFeedProducts()).map((p) => leafOf(p))),
  ).filter((c) => c.trim().length > 0);
  if (universe.length === 0) return;

  const rows = universe.map((category) => ({ category, visible: checked.has(category) }));
  await db
    .insert(shopCategorySettings)
    .values(rows)
    .onConflictDoUpdate({
      target: shopCategorySettings.category,
      set: { visible: sql`excluded.visible`, updatedAt: new Date() },
    });

  await db.insert(platformAuditLog).values({
    actorEmail: admin.email,
    action: "shop_categories",
    detail: `${checked.size}/${universe.length} categories visible`,
  });

  revalidateShop();
}

/** Set (or clear) a per-product override: hide + optional price override. */
export async function setShopProductOverride(formData: FormData): Promise<void> {
  const admin = await requirePlatformAdmin();

  const mmtCode = String(formData.get("mmtCode") ?? "").trim();
  if (!mmtCode) return;

  const hidden = formData.get("hidden") === "on";
  const priceRaw = String(formData.get("priceOverride") ?? "").trim();
  const priceDollars = Number(priceRaw);
  const priceOverrideCents =
    priceRaw !== "" && Number.isFinite(priceDollars) && priceDollars >= 0
      ? Math.round(priceDollars * 100)
      : null;

  // A row with no hide and no override is a no-op — delete it to keep the table
  // clean; otherwise upsert.
  if (!hidden && priceOverrideCents === null) {
    await db.delete(shopProductOverrides).where(eq(shopProductOverrides.mmtCode, mmtCode));
  } else {
    await db
      .insert(shopProductOverrides)
      .values({ mmtCode, hidden, priceOverrideCents })
      .onConflictDoUpdate({
        target: shopProductOverrides.mmtCode,
        set: { hidden, priceOverrideCents, updatedAt: new Date() },
      });
  }

  await db.insert(platformAuditLog).values({
    actorEmail: admin.email,
    action: "shop_product_override",
    detail: `${mmtCode}${hidden ? " · hidden" : ""}${
      priceOverrideCents !== null ? ` · $${(priceOverrideCents / 100).toFixed(2)}` : ""
    }`,
  });

  revalidateShop();
}
