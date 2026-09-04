"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { isUniqueViolation } from "@/lib/db/errors";
import { revalidateStorefront } from "@/lib/storefront-cache";
import { menuItems, platformAuditLog, venues } from "@/lib/db/schema";
import { planDiscountCouponParams } from "@/lib/billing/plan-discount";
import { reportError } from "@/lib/observability";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { toE164 } from "@/lib/sms";
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
  // An invalid value (out-of-range percent, non-positive amount, a typo) is a
  // rejected submission, not "off": coercing it to 0 used to flip the mode to
  // off and REMOVE the venue's existing Stripe coupon. Turning a discount off
  // is an explicit choice of mode 'off'.
  if (mode !== "off" && value <= 0) return;
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

  // Apply to Stripe if the venue has a live subscription. A venue with none
  // is applied at Checkout instead (createBillingCheckout reads these columns).
  // Best-effort, but never silent: a Stripe failure is reported and the audit
  // row says the coupon did NOT land, so "Currently: X% off" on the console is
  // never mistaken for a discount the venue is actually receiving.
  let stripeOutcome = venue.subId ? "applied to Stripe" : "applies at Checkout";
  if (venue.subId) {
    try {
      const stripe = getStripe();
      if (finalMode === "off") {
        await stripe.subscriptions.update(venue.subId, { discounts: [] });
      } else {
        const params = planDiscountCouponParams(finalMode, value);
        if (!params) throw new Error("Invalid plan discount.");
        const coupon = await stripe.coupons.create(params);
        await stripe.subscriptions.update(venue.subId, {
          discounts: [{ coupon: coupon.id }],
        });
      }
    } catch (error) {
      stripeOutcome = "STRIPE UPDATE FAILED — retry";
      await reportError(error, {
        context: "admin.venue-plan-discount",
        extra: { venueId, mode: finalMode, value },
      });
    }
  }

  await db
    .update(venues)
    .set({ planDiscountMode: finalMode, planDiscountValue: value })
    .where(eq(venues.id, venueId));

  await db.insert(platformAuditLog).values({
    actorEmail: admin.email,
    action: "venue_plan_discount",
    detail: `${venueId.slice(0, 8)}: ${venue.priorMode}/${venue.priorValue} → ${finalMode}/${value} (${stripeOutcome})`,
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

  // Scope the write to the venue too, so a mismatched id touches nothing. The
  // venueId is part of the WHERE (not just a post-write check), so an itemId that
  // belongs to a different venue updates zero rows instead of silently editing
  // the wrong tenant's price and skipping the audit entry.
  const res = await db
    .update(menuItems)
    .set({ priceCents })
    .where(and(eq(menuItems.id, itemId), eq(menuItems.venueId, venueId)))
    .returning({ id: menuItems.id, name: menuItems.name });

  const row = res[0];
  if (row) {
    await db.insert(platformAuditLog).values({
      actorEmail: admin.email,
      action: "venue_menu_item_price",
      detail: `${row.name} → $${(priceCents / 100).toFixed(2)}`,
    });
    // The storefront caches its menu payload (M6 / audit F6), and this is the
    // one price write that happens OUTSIDE the venue's own dashboard — without
    // this a diner keeps seeing the old price. The slug is looked up rather
    // than passed in, so a forged form value cannot clear another venue's
    // cache.
    const [venue] = await db
      .select({ id: venues.id, slug: venues.slug })
      .from(venues)
      .where(eq(venues.id, venueId))
      .limit(1);
    if (venue) revalidateStorefront(venue);
  }

  revalidatePath(pathFor(venueId));
}

/**
 * Assign (or clear) the Twilio voice number that rings this venue's phone
 * agent. Platform-owned numbers, so this lives in the console, not Settings.
 * E.164 only; a number can belong to one venue (unique index). Audited.
 */
export async function setVenueVoiceNumber(formData: FormData): Promise<void> {
  const admin = await requirePlatformAdmin();
  const venueId = String(formData.get("venueId") ?? "").trim();
  if (!venueId) return;
  const raw = String(formData.get("voiceNumber") ?? "").trim();
  const voiceNumber = raw === "" ? null : toE164(raw);
  if (raw !== "" && !voiceNumber) return;

  const [venue] = await db
    .select({ prior: venues.voiceNumber })
    .from(venues)
    .where(eq(venues.id, venueId))
    .limit(1);
  if (!venue) return;

  try {
    await db.update(venues).set({ voiceNumber }).where(eq(venues.id, venueId));
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    await db.insert(platformAuditLog).values({
      actorEmail: admin.email,
      action: "venue_voice_number",
      detail: `${venueId.slice(0, 8)}: ${voiceNumber} REFUSED — already assigned to another venue`,
    });
    revalidatePath(pathFor(venueId));
    return;
  }
  await db.insert(platformAuditLog).values({
    actorEmail: admin.email,
    action: "venue_voice_number",
    detail: `${venueId.slice(0, 8)}: ${venue.prior ?? "none"} → ${voiceNumber ?? "none"}`,
  });
  revalidatePath(pathFor(venueId));
}
