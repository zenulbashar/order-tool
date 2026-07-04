import "server-only";

import { and, count, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { orders, promotions, promotionVenues } from "@/lib/db/schema";
import { promoDiscountRawCents } from "@/lib/payments/order-discount";

/**
 * Resolve the best active promotion for an order (Track E2d + E2d-2). A promo
 * qualifies when it is active, inside its window, meets the minimum basket, AND
 * passes its guardrails:
 *  - SCOPE: `selected` promos apply only at their targeted venues.
 *  - BUDGET: a promo with a spend cap stops applying once confirmed orders'
 *    promo discount reaches it (a soft cap — pending/abandoned orders don't
 *    count, so it can overshoot slightly under a burst; acceptable for a
 *    marketing guardrail).
 *  - AUDIENCE: `new` promos apply only to customers with no prior CONFIRMED
 *    order at the venue; guests (untracked) count as new — a documented
 *    limitation (a guest could reuse it).
 * When several qualify, the largest discount wins. Returns the raw (unclamped)
 * discount + id; the caller composes + clamps it. Read-only.
 */
export async function resolveActivePromo(
  venueId: string,
  subtotalCents: number,
  customerId: string | null,
): Promise<{ id: string; raw: number } | null> {
  if (subtotalCents <= 0) return null;

  const now = new Date();
  const candidates = await db
    .select({
      id: promotions.id,
      type: promotions.type,
      value: promotions.value,
      scope: promotions.scope,
      audience: promotions.audience,
      budgetCents: promotions.budgetCents,
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
  if (candidates.length === 0) return null;

  // SCOPE — which selected-scope promos target this venue.
  const selectedIds = candidates.filter((c) => c.scope === "selected").map((c) => c.id);
  let targeted = new Set<string>();
  if (selectedIds.length > 0) {
    const rows = await db
      .select({ promotionId: promotionVenues.promotionId })
      .from(promotionVenues)
      .where(
        and(
          inArray(promotionVenues.promotionId, selectedIds),
          eq(promotionVenues.venueId, venueId),
        ),
      );
    targeted = new Set(rows.map((r) => r.promotionId));
  }

  // BUDGET — spend so far per capped promo (confirmed orders only).
  const budgetIds = candidates.filter((c) => c.budgetCents != null).map((c) => c.id);
  const spent = new Map<string, number>();
  if (budgetIds.length > 0) {
    const rows = await db
      .select({
        promoId: orders.appliedPromoId,
        total: sql<number>`coalesce(sum(${orders.promoDiscountCents}), 0)`,
      })
      .from(orders)
      .where(
        and(
          inArray(orders.appliedPromoId, budgetIds),
          eq(orders.status, "confirmed"),
        ),
      )
      .groupBy(orders.appliedPromoId);
    for (const r of rows) if (r.promoId) spent.set(r.promoId, Number(r.total));
  }

  // AUDIENCE — is this (known) customer a returning one at the venue?
  let returning = false;
  if (customerId && candidates.some((c) => c.audience === "new")) {
    const [row] = await db
      .select({ n: count() })
      .from(orders)
      .where(
        and(
          eq(orders.venueId, venueId),
          eq(orders.customerId, customerId),
          eq(orders.status, "confirmed"),
        ),
      );
    returning = (row?.n ?? 0) > 0;
  }

  let best: { id: string; raw: number } | null = null;
  for (const c of candidates) {
    if (c.scope === "selected" && !targeted.has(c.id)) continue;
    if (c.budgetCents != null && (spent.get(c.id) ?? 0) >= c.budgetCents) continue;
    if (c.audience === "new" && customerId && returning) continue;
    const raw = promoDiscountRawCents(subtotalCents, c.type, c.value);
    if (raw > 0 && (!best || raw > best.raw)) best = { id: c.id, raw };
  }
  return best;
}
