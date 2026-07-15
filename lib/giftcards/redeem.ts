import "server-only";

import { and, eq, gt, notExists, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { giftCardLedger, giftCards, orders } from "@/lib/db/schema";

/**
 * Gift-card redemption DEBIT (Gift cards PR2). The DISCOUNT is applied
 * pre-payment by applyOrderDiscounts (which records orders.gift_card_id +
 * gift_card_redeemed_cents as a reservation and lowers the charge); this writes
 * the matching ledger DEBIT and lowers the card's cached balance once the order
 * is CONFIRMED — so value only leaves the card when paid, and an abandoned
 * order's reservation lapses.
 *
 * Same contract as loyalty redemption: called only AFTER confirmation, isolated
 * by the webhook's try/catch or run by the cron sweep, idempotent via the
 * ledger's unique(order_id, reason) index. The balance bump is clamped at 0 so
 * a race can never drive it negative (the CHECK would otherwise reject it).
 */

const SWEEP_WINDOW_MS = 24 * 60 * 60 * 1000;
const SWEEP_BATCH = 100;

async function insertDebit(row: {
  orderId: string;
  venueId: string;
  giftCardId: string;
  cents: number;
}): Promise<number> {
  if (row.cents <= 0) return 0;
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(giftCardLedger)
      .values({
        venueId: row.venueId,
        giftCardId: row.giftCardId,
        orderId: row.orderId,
        deltaCents: -row.cents, // redemption = value out
        reason: "redeem",
      })
      .onConflictDoNothing()
      .returning({ id: giftCardLedger.id });
    if (inserted.length === 0) return 0; // already debited (replay)

    await tx
      .update(giftCards)
      .set({
        balanceCents: sql`GREATEST(${giftCards.balanceCents} - ${row.cents}, 0)`,
        updatedAt: new Date(),
      })
      .where(eq(giftCards.id, row.giftCardId));
    return row.cents;
  });
}

/**
 * Fast-path entry from the Stripe webhook: debit the gift card a confirmed order
 * redeemed. No-op unless confirmed, linked to a card, and value was redeemed.
 */
export async function redeemGiftCardForOrder(
  paymentIntentId: string,
): Promise<number> {
  const [order] = await db
    .select({
      id: orders.id,
      venueId: orders.venueId,
      giftCardId: orders.giftCardId,
      cents: orders.giftCardRedeemedCents,
    })
    .from(orders)
    .where(
      and(
        eq(orders.stripePaymentIntentId, paymentIntentId),
        eq(orders.status, "confirmed"),
      ),
    )
    .limit(1);

  if (!order || !order.giftCardId || order.cents <= 0) return 0;
  return insertDebit({
    orderId: order.id,
    venueId: order.venueId,
    giftCardId: order.giftCardId,
    cents: order.cents,
  });
}

/**
 * Cron backstop: debit any recently-confirmed order that redeemed a gift card
 * but has no `redeem` ledger row yet. Bounded; idempotent.
 */
export async function sweepGiftCardRedeem(): Promise<number> {
  const since = new Date(Date.now() - SWEEP_WINDOW_MS);
  const pending = await db
    .select({
      id: orders.id,
      venueId: orders.venueId,
      giftCardId: orders.giftCardId,
      cents: orders.giftCardRedeemedCents,
    })
    .from(orders)
    .where(
      and(
        eq(orders.status, "confirmed"),
        gt(orders.createdAt, since),
        gt(orders.giftCardRedeemedCents, 0),
        notExists(
          db
            .select({ one: sql`1` })
            .from(giftCardLedger)
            .where(
              and(
                eq(giftCardLedger.orderId, orders.id),
                eq(giftCardLedger.reason, "redeem"),
              ),
            ),
        ),
      ),
    )
    .limit(SWEEP_BATCH);

  let applied = 0;
  for (const row of pending) {
    if (!row.giftCardId) continue;
    try {
      const n = await insertDebit({
        orderId: row.id,
        venueId: row.venueId,
        giftCardId: row.giftCardId,
        cents: row.cents,
      });
      if (n > 0) applied += 1;
    } catch {
      // A single order's debit failure must not abort the sweep.
    }
  }
  return applied;
}
