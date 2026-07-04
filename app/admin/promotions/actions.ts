"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import {
  platformAuditLog,
  promotions,
  promotionVenues,
} from "@/lib/db/schema";
import { requirePlatformAdmin } from "@/lib/platform-admin";

const PATH = "/admin/promotions";

const TYPES = ["percent", "amount"] as const;
const FUNDING = ["merchant", "platform", "cofunded"] as const;
const AUDIENCES = ["all", "new"] as const;

function parseDate(raw: FormDataEntryValue | null): Date | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Create a platform promotion (Track E2d, admin-only). Percent values are whole
 * 1–100; amount/min-basket are entered in dollars and stored as cents. Audited.
 */
export async function createPromotion(formData: FormData): Promise<void> {
  const admin = await requirePlatformAdmin();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const typeRaw = String(formData.get("type") ?? "percent");
  const type = (TYPES as readonly string[]).includes(typeRaw)
    ? (typeRaw as (typeof TYPES)[number])
    : "percent";

  const rawValue = Number(String(formData.get("value") ?? "").trim());
  let value = 0;
  if (type === "percent") {
    value = Number.isInteger(rawValue) && rawValue >= 1 && rawValue <= 100 ? rawValue : 0;
  } else {
    value = Number.isFinite(rawValue) && rawValue > 0 ? Math.round(rawValue * 100) : 0;
  }
  if (value <= 0) return;

  const minDollars = Number(String(formData.get("minBasket") ?? "").trim());
  const minBasketCents =
    Number.isFinite(minDollars) && minDollars > 0 ? Math.round(minDollars * 100) : 0;

  const fundingRaw = String(formData.get("fundingSource") ?? "merchant");
  const fundingSource = (FUNDING as readonly string[]).includes(fundingRaw)
    ? (fundingRaw as (typeof FUNDING)[number])
    : "merchant";

  const audienceRaw = String(formData.get("audience") ?? "all");
  const audience = (AUDIENCES as readonly string[]).includes(audienceRaw)
    ? (audienceRaw as (typeof AUDIENCES)[number])
    : "all";

  const budgetDollars = Number(String(formData.get("budget") ?? "").trim());
  const budgetCents =
    Number.isFinite(budgetDollars) && budgetDollars > 0
      ? Math.round(budgetDollars * 100)
      : null;

  // Targeting: selected venues come from checkboxes. scope=selected requires at
  // least one; an empty selection falls back to platform-wide.
  const venueIds = formData
    .getAll("venues")
    .map((v) => String(v).trim())
    .filter((v) => v.length > 0);
  const scope = venueIds.length > 0 ? "selected" : "all";

  const [created] = await db
    .insert(promotions)
    .values({
      name,
      type,
      value,
      minBasketCents,
      startsAt: parseDate(formData.get("startsAt")),
      endsAt: parseDate(formData.get("endsAt")),
      fundingSource,
      scope,
      audience,
      budgetCents,
      isActive: true,
    })
    .returning({ id: promotions.id });

  if (scope === "selected" && created) {
    await db
      .insert(promotionVenues)
      .values(venueIds.map((venueId) => ({ promotionId: created.id, venueId })))
      .onConflictDoNothing();
  }

  await db.insert(platformAuditLog).values({
    actorEmail: admin.email,
    action: "promotion_create",
    detail: `${name} · ${type === "percent" ? `${value}%` : `$${(value / 100).toFixed(2)}`} off · ${scope}`,
  });

  revalidatePath(PATH);
}

/** Activate / pause a promotion (Track E2d, admin-only). Audited. */
export async function setPromotionActive(formData: FormData): Promise<void> {
  const admin = await requirePlatformAdmin();

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  const isActive = formData.get("isActive") === "on";

  await db
    .update(promotions)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(promotions.id, id));

  await db.insert(platformAuditLog).values({
    actorEmail: admin.email,
    action: "promotion_toggle",
    detail: `${id.slice(0, 8)} → ${isActive ? "active" : "paused"}`,
  });

  revalidatePath(PATH);
}
