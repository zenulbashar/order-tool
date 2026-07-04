"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { menuItems, platformAuditLog, venues } from "@/lib/db/schema";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { getStripe } from "@/lib/stripe";

const MODES = ["off", "percent", "amount"] as const;
type Mode = (typeof MODES)[number];

function pathFor(id: string) {
  return `/admin/venues/${id}`;
}

/**
 * Set (or clear) a venue's subscription-fee discount (Track E2c). Applied as a
 * Stripe coupon on the venue's live subscription — reversible, invoice-visible,
 * only ever REDUCES the fee (never a surcharge). Our columns hold the intent for
 * display; Stripe holds the runtime discount. Admin-gated + audited. This is
 * BILLING money-path — the diner order money path (placeOrder/webhook) is not
 * touched.
 */
export async function setVenuePlanDiscount(formData: FormData): Promise<void> {
  const admin = await requirePlatformAdmin();

  const venueId = String(formData.get("venueId") ?? "").trim();
  if (!venueId) return;
  const modeRaw = String(formData.get("mode") ?? "off");
  const mode: Mode = (MODES as readonly string[]).includes(modeRaw)
    ? (modeRaw as Mode)
    : "off";

  const raw = String(formData.get("value") ?? "").trim();
  let value = 0;
  if (mode === "percent") {
    const pct = Number(raw);
    value = Number.isInteger(pct) && pct >= 1 && pct <= 100 ? pct : 0;
  } else if (mode === "amount") {
    const dollars = Number(raw);
    value = Number.isFinite(dollars) && dollars > 0 ? Math.round(dollars * 100) : 0;
  }
  const finalMode: Mode = value > 0 ? mode : "off";

  const [venue] = await db
    .select({
      id: venues.id,
      subId: venues.stripeSubscriptionId,
      priorMode: venues.planDiscountMode,
      priorValue: venues.planDiscountValue,
    })
    .from(venues)
    .where(eq(venues.id, venueId))
    .limit(1);
  if (!venue) return;

  // Apply to Stripe if the venue has a live subscription. Best-effort: a Stripe
  // failure still records intent, and the page surfaces the "no subscription"
  // case; nothing here can affect a diner order.
  if (venue.subId) {
    try {
      const stripe = getStripe();
      if (finalMode === "off") {
        await stripe.subscriptions.update(venue.subId, { discounts: [] });
      } else {
        const coupon = await stripe.coupons.create(
          finalMode === "percent"
            ? { percent_off: value, duration: "forever" }
            : { amount_off: value, currency: "aud", duration: "forever" },
        );
        await stripe.subscriptions.update(venue.subId, {
          discounts: [{ coupon: coupon.id }],
        });
      }
    } catch {
      // Recorded as intent; the admin can retry. Diner money path untouched.
    }
  }

  await db
    .update(venues)
    .set({ planDiscountMode: finalMode, planDiscountValue: value })
    .where(eq(venues.id, venueId));

  await db.insert(platformAuditLog).values({
    actorEmail: admin.email,
    action: "venue_plan_discount",
    detail: `${venueId.slice(0, 8)}: ${venue.priorMode}/${venue.priorValue} → ${finalMode}/${value}`,
  });

  revalidatePath(pathFor(venueId));
}

/**
 * Admin edit of a venue's menu item price (Track E2b). Cross-tenant write —
 * admin is supra-tenant — and audited. Safe: placeOrder snapshots prices per
 * order, so a change only affects FUTURE orders; existing orders are unchanged.
 */
export async function setVenueItemPrice(formData: FormData): Promise<void> {
  const admin = await requirePlatformAdmin();

  const venueId = String(formData.get("venueId") ?? "").trim();
  const itemId = String(formData.get("itemId") ?? "").trim();
  if (!venueId || !itemId) return;

  const dollars = Number(String(formData.get("price") ?? "").trim());
  if (!Number.isFinite(dollars) || dollars < 0) return;
  const priceCents = Math.round(dollars * 100);

  // Scope the write to the venue too, so a mismatched id touches nothing.
  const res = await db
    .update(menuItems)
    .set({ priceCents })
    .where(eq(menuItems.id, itemId))
    .returning({ id: menuItems.id, name: menuItems.name, venueId: menuItems.venueId });

  const row = res[0];
  if (row && row.venueId === venueId) {
    await db.insert(platformAuditLog).values({
      actorEmail: admin.email,
      action: "venue_menu_item_price",
      detail: `${row.name} → $${(priceCents / 100).toFixed(2)}`,
    });
  }

  revalidatePath(pathFor(venueId));
}
