import "server-only";

import { and, eq, gt, isNotNull, notExists, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { orders, pointsLedger, venues } from "@/lib/db/schema";

/**
 * Loyalty points EARNING (PR1 — money-inert). When an order is confirmed, a
 * logged-in customer earns points on the order's SUBTOTAL (pre-discount, so a
 * later redemption never feeds back into what's earned). Earning writes ONE
 * `earn` ledger row per order.
 *
 * NEVER on the order money-path: only ever called AFTER an order is confirmed,
 * isolated in its own try/catch by the webhook fast-path or run by the cron
 * sweep. It writes ONLY loyalty ledger state — no charge, fee, or PI touch.
 *
 * Idempotent: the unique index points_ledger_order_reason_idx makes the insert
 * ON CONFLICT DO NOTHING, so webhook replays, sweep overlaps, and concurrent
 * kicks can never double-credit. Guests (null customer_id) and loyalty-disabled
 * venues are no-ops.
 */

/** How far back the sweep re-derives earning from confirmed orders. */
const SWEEP_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Orders processed per sweep — bounded so a burst spreads across ticks. */
const SWEEP_BATCH = 100;

/** Points earned for a subtotal at a per-dollar rate (whole dollars only). */
export function earnedPointsFor(
  subtotalCents: number,
  earnRatePerDollar: number,
): number {
  if (subtotalCents <= 0 || earnRatePerDollar <= 0) return 0;
  return Math.floor(subtotalCents / 100) * earnRatePerDollar;
}

/**
 * Write the idempotent `earn` row for one confirmed, loyalty-eligible order.
 * Returns the points credited (0 if nothing to earn or already credited).
 */
async function insertEarn(row: {
  id: string;
  venueId: string;
  customerId: string;
  subtotalCents: number;
  earnRatePerDollar: number;
}): Promise<number> {
  const earned = earnedPointsFor(row.subtotalCents, row.earnRatePerDollar);
  if (earned <= 0) return 0;

  const inserted = await db
    .insert(pointsLedger)
    .values({
      venueId: row.venueId,
      customerId: row.customerId,
      orderId: row.id,
      deltaPoints: earned,
      reason: "earn",
    })
    .onConflictDoNothing()
    .returning({ id: pointsLedger.id });

  return inserted.length > 0 ? earned : 0;
}

/**
 * Fast-path entry from the Stripe webhook: resolve the order behind a
 * PaymentIntent (only when already 'confirmed', matching the confirm UPDATE's
 * key) and credit its loyalty points. Returns points earned (0 = nothing).
 */
export async function earnPointsForOrder(
  paymentIntentId: string,
): Promise<number> {
  const [row] = await db
    .select({
      id: orders.id,
      venueId: orders.venueId,
      customerId: orders.customerId,
      subtotalCents: orders.subtotalCents,
      loyaltyEnabled: venues.loyaltyEnabled,
      earnRatePerDollar: venues.loyaltyEarnRatePerDollar,
    })
    .from(orders)
    .innerJoin(venues, eq(venues.id, orders.venueId))
    .where(
      and(
        eq(orders.stripePaymentIntentId, paymentIntentId),
        eq(orders.status, "confirmed"),
      ),
    )
    .limit(1);

  if (!row || !row.customerId || !row.loyaltyEnabled) return 0;
  return insertEarn({
    id: row.id,
    venueId: row.venueId,
    customerId: row.customerId,
    subtotalCents: row.subtotalCents,
    earnRatePerDollar: row.earnRatePerDollar,
  });
}

/**
 * The backstop (cron): credit points for any recently-confirmed, loyalty-
 * eligible order that has no `earn` row yet — the guarantee that makes the
 * webhook fast-path a latency optimization only. Bounded per invocation;
 * idempotency lets the next tick continue.
 */
export async function sweepLoyaltyEarn(): Promise<number> {
  const since = new Date(Date.now() - SWEEP_WINDOW_MS);
  const pending = await db
    .select({
      id: orders.id,
      venueId: orders.venueId,
      customerId: orders.customerId,
      subtotalCents: orders.subtotalCents,
      earnRatePerDollar: venues.loyaltyEarnRatePerDollar,
    })
    .from(orders)
    .innerJoin(venues, eq(venues.id, orders.venueId))
    .where(
      and(
        eq(orders.status, "confirmed"),
        gt(orders.createdAt, since),
        isNotNull(orders.customerId),
        eq(venues.loyaltyEnabled, true),
        notExists(
          db
            .select({ one: sql`1` })
            .from(pointsLedger)
            .where(
              and(
                eq(pointsLedger.orderId, orders.id),
                eq(pointsLedger.reason, "earn"),
              ),
            ),
        ),
      ),
    )
    .limit(SWEEP_BATCH);

  let applied = 0;
  for (const row of pending) {
    if (!row.customerId) continue;
    try {
      const n = await insertEarn({
        id: row.id,
        venueId: row.venueId,
        customerId: row.customerId,
        subtotalCents: row.subtotalCents,
        earnRatePerDollar: row.earnRatePerDollar,
      });
      if (n > 0) applied += 1;
    } catch {
      // A single order's earning failure must not abort the sweep; the next
      // tick retries it (idempotent).
    }
  }
  return applied;
}
