import "server-only";

import { and, eq, gte, isNull, lte, or } from "drizzle-orm";

import { db } from "@/lib/db";
import { promotions } from "@/lib/db/schema";
import { promoDiscountRawCents } from "@/lib/payments/order-discount";

/**
 * Resolve the best active platform promotion for an order subtotal (Track E2d).
 * v1 is platform-wide (every venue); per-venue targeting is a later additive
 * build. A promo qualifies when it is active, inside its window, and the
 * subtotal meets its minimum basket. When several qualify, the one giving the
 * largest discount wins. Returns the raw (unclamped) discount + its id; the
 * caller composes + clamps it (lib/payments/order-discount.ts). Read-only.
 */
export async function resolveActivePromo(
  subtotalCents: number,
): Promise<{ id: string; raw: number } | null> {
  if (subtotalCents <= 0) return null;

  const now = new Date();
  const rows = await db
    .select({
      id: promotions.id,
      type: promotions.type,
      value: promotions.value,
    })
    .from(promotions)
    .where(
      and(
        eq(promotions.isActive, true),
        or(isNull(promotions.startsAt), lte(promotions.startsAt, now)),
        or(isNull(promotions.endsAt), gte(promotions.endsAt, now)),
        lte(promotions.minBasketCents, subtotalCents),
      ),
    );

  let best: { id: string; raw: number } | null = null;
  for (const promo of rows) {
    const raw = promoDiscountRawCents(subtotalCents, promo.type, promo.value);
    if (raw > 0 && (!best || raw > best.raw)) best = { id: promo.id, raw };
  }
  return best;
}
