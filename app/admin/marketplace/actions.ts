"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import {
  marketplaceOrders,
  marketplaceProducts,
  platformAuditLog,
} from "@/lib/db/schema";
import { requirePlatformAdmin } from "@/lib/platform-admin";

const ADMIN_MARKETPLACE = "/admin/marketplace";

const CATEGORIES = ["signage", "tablet", "stand", "consumable", "banner", "other"] as const;
type Category = (typeof CATEGORIES)[number];

const ORDER_STATUSES = ["requested", "confirmed", "shipped", "cancelled"] as const;
type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * Create or update a catalog product (Track F, admin-only). Price is entered in
 * dollars and stored as integer cents. Audited via platform_audit_log.
 */
export async function upsertProduct(formData: FormData): Promise<void> {
  const admin = await requirePlatformAdmin();

  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (name.length === 0) return;

  const categoryRaw = String(formData.get("category") ?? "other");
  const category: Category = (CATEGORIES as readonly string[]).includes(categoryRaw)
    ? (categoryRaw as Category)
    : "other";

  const priceDollars = Number(String(formData.get("price") ?? "").trim());
  const priceCents =
    Number.isFinite(priceDollars) && priceDollars >= 0
      ? Math.round(priceDollars * 100)
      : 0;

  const opt = (key: string) => {
    const v = String(formData.get(key) ?? "").trim();
    return v.length > 0 ? v : null;
  };

  const values = {
    name,
    description: opt("description"),
    category,
    priceCents,
    unitLabel: opt("unitLabel"),
    supplier: opt("supplier"),
    imageUrl: opt("imageUrl"),
    isActive: formData.get("isActive") === "on",
  };

  if (id) {
    await db
      .update(marketplaceProducts)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(marketplaceProducts.id, id));
  } else {
    await db.insert(marketplaceProducts).values(values);
  }

  await db.insert(platformAuditLog).values({
    actorEmail: admin.email,
    action: id ? "marketplace_product_update" : "marketplace_product_create",
    detail: `${name} · $${(priceCents / 100).toFixed(2)}`,
  });

  revalidatePath(ADMIN_MARKETPLACE);
  revalidatePath("/dashboard/marketplace");
}

/** Advance a hardware order's status (Track F, admin-only). Audited. */
export async function advanceMarketplaceOrder(formData: FormData): Promise<void> {
  const admin = await requirePlatformAdmin();

  const id = String(formData.get("id") ?? "").trim();
  const statusRaw = String(formData.get("status") ?? "");
  if (!id || !(ORDER_STATUSES as readonly string[]).includes(statusRaw)) return;
  const status = statusRaw as OrderStatus;

  // "Cancel" on a PAID order flipped it to cancelled with no refund path and
  // no precondition, silently retaining the venue's Checkout payment. There is
  // no in-product marketplace refund, so cancelling a paid order requires the
  // operator to confirm the payment was refunded in Stripe first; without
  // that the order is left unchanged and the refusal is audited.
  if (status === "cancelled") {
    const [current] = await db
      .select({ paidAt: marketplaceOrders.paidAt })
      .from(marketplaceOrders)
      .where(eq(marketplaceOrders.id, id))
      .limit(1);
    if (current?.paidAt && formData.get("refunded") !== "on") {
      await db.insert(platformAuditLog).values({
        actorEmail: admin.email,
        action: "marketplace_order_status",
        detail: `${id.slice(0, 8)} → cancelled REFUSED: paid order, refund not confirmed`,
      });
      revalidatePath(ADMIN_MARKETPLACE);
      return;
    }
  }

  await db
    .update(marketplaceOrders)
    .set({ status, updatedAt: new Date() })
    .where(eq(marketplaceOrders.id, id));

  await db.insert(platformAuditLog).values({
    actorEmail: admin.email,
    action: "marketplace_order_status",
    detail: `${id.slice(0, 8)} → ${status}`,
  });

  revalidatePath(ADMIN_MARKETPLACE);
}
