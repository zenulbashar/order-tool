import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  giftCardLedger,
  giftCards,
  ingredients,
  orders,
  pointsLedger,
  stockMovements,
} from "@/lib/db/schema";

/**
 * Compensation for a FULLY refunded order (M4 / audit F3). A Stripe refund
 * only returns the CASH the card was charged; everything else the order
 * consumed has to be unwound here or the platform's ledgers drift from the
 * money — the exact reconciliation gap F3 describes.
 *
 * Three effects, each independently idempotent so the refund action, the
 * `charge.refunded` webhook (which also catches refunds issued out of band
 * from the Stripe Dashboard), and any replay of either can all run safely:
 *
 *  1. LOYALTY — one `refund_reversal` row carrying the NET reversal of every
 *     other ledger row for the order. It cancels the `earn` (points credited
 *     for a purchase that no longer stands) and returns the `redeem` (points
 *     the diner actually spent). Idempotent via UNIQUE(order_id, reason).
 *  2. GIFT CARD — returns the value the card paid toward the order. The card
 *     portion was a DISCOUNT, not cash, so Stripe never refunds it; without
 *     this the diner is short-changed by exactly that amount. Idempotent via
 *     UNIQUE(order_id, reason).
 *  3. STOCK — returns ingredients ONLY for an order the kitchen had not yet
 *     made. See shouldRestock() for why that condition is load-bearing.
 *
 * PARTIAL refunds deliberately compensate NOTHING. Splitting a loyalty accrual
 * or a gift-card balance across an arbitrary partial refund has no correct
 * answer without line-level refunds (which this milestone does not add), and a
 * wrong answer here is a real customer-money error. Partial refunds move cash
 * and nothing else; the order stays 'partially_refunded' and a subsequent
 * refund that completes the total triggers full compensation.
 *
 * Nothing here throws out of `compensateFullyRefundedOrder` — compensation
 * runs behind an already-succeeded money movement, so a failure must be
 * reported and retried, never surfaced as a failed refund.
 */

export type CompensationResult = {
  loyaltyPointsReversed: number;
  giftCardCentsRestored: number;
  ingredientsRestocked: number;
};

const EMPTY: CompensationResult = {
  loyaltyPointsReversed: 0,
  giftCardCentsRestored: 0,
  ingredientsRestocked: 0,
};

/**
 * Whether a refunded order's ingredients should go back on the shelf.
 *
 * Only if the kitchen had NOT yet made it. Once an order reaches 'ready' the
 * food exists — the ingredients really were consumed, and returning them to
 * stock would overstate inventory and, downstream, under-order supplies. A
 * refund for a meal the diner was unhappy with is a cash event, not a stock
 * event. Pure so the rule is unit-testable.
 */
export function shouldRestock(fulfillmentStatus: string): boolean {
  return fulfillmentStatus === "new" || fulfillmentStatus === "preparing";
}

/**
 * Unwind the non-cash effects of a fully refunded order. Safe to call
 * repeatedly; returns what THIS call actually changed (all zeros when the
 * work was already done).
 */
export async function compensateFullyRefundedOrder(
  orderId: string,
): Promise<CompensationResult> {
  const [order] = await db
    .select({
      id: orders.id,
      venueId: orders.venueId,
      customerId: orders.customerId,
      giftCardId: orders.giftCardId,
      giftCardRedeemedCents: orders.giftCardRedeemedCents,
      fulfillmentStatus: orders.fulfillmentStatus,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!order) return EMPTY;

  const loyaltyPointsReversed = await reverseLoyalty(order.id, order.venueId);
  const giftCardCentsRestored = await restoreGiftCard({
    orderId: order.id,
    venueId: order.venueId,
    giftCardId: order.giftCardId,
  });
  const ingredientsRestocked = shouldRestock(order.fulfillmentStatus)
    ? await restockOrder(order.id, order.venueId)
    : 0;

  return {
    loyaltyPointsReversed,
    giftCardCentsRestored,
    ingredientsRestocked,
  };
}

/**
 * Net out every points row for this order with a single reversal row. Reading
 * the ledger (rather than recomputing from the earn rate) means the reversal
 * matches what was ACTUALLY credited, even if the venue's rate changed since.
 */
async function reverseLoyalty(
  orderId: string,
  venueId: string,
): Promise<number> {
  const rows = await db
    .select({
      customerId: pointsLedger.customerId,
      deltaPoints: pointsLedger.deltaPoints,
      reason: pointsLedger.reason,
    })
    .from(pointsLedger)
    .where(eq(pointsLedger.orderId, orderId));
  if (rows.length === 0) return 0;
  // Already reversed (replay) — the unique index would refuse anyway, but
  // bailing here keeps the return value honest about what changed.
  if (rows.some((row) => row.reason === "refund_reversal")) return 0;

  const net = rows.reduce((sum, row) => sum + row.deltaPoints, 0);
  if (net === 0) return 0;

  const inserted = await db
    .insert(pointsLedger)
    .values({
      venueId,
      customerId: rows[0].customerId,
      orderId,
      deltaPoints: -net,
      reason: "refund_reversal",
      note: "Order refunded",
    })
    .onConflictDoNothing()
    .returning({ deltaPoints: pointsLedger.deltaPoints });
  return inserted[0]?.deltaPoints ?? 0;
}

/**
 * Return the value a gift card ACTUALLY paid toward this order, once.
 *
 * Read from the LEDGER, not from `orders.gift_card_redeemed_cents`. That column
 * is the RESERVATION, written before payment; the debit lands later, in a
 * swallowed after() block with a daily cron as its only backstop. Trusting the
 * reservation therefore credited value that was never taken, in two real
 * situations:
 *
 *  - an order charged but never confirmed (a declined-then-retried card, before
 *    that was fixed) refunded from the Stripe Dashboard — reconcileRefunds
 *    resolves by PaymentIntent with no status filter, so compensation ran on an
 *    order whose debit could not have happened;
 *  - a normally-confirmed order refunded before its deferred debit committed.
 *
 * Either way the card gained value it never lost, the ledger stayed internally
 * self-consistent (so no reconciliation sweep would flag it), and the
 * non-negative CHECK is a floor rather than a ceiling so nothing errored.
 *
 * This is the shape reverseLoyalty already used: observe what happened, reverse
 * exactly that, and return 0 when nothing did.
 */
async function restoreGiftCard(input: {
  orderId: string;
  venueId: string;
  giftCardId: string | null;
}): Promise<number> {
  if (!input.giftCardId) return 0;

  const rows = await db
    .select({
      deltaCents: giftCardLedger.deltaCents,
      reason: giftCardLedger.reason,
    })
    .from(giftCardLedger)
    .where(eq(giftCardLedger.orderId, input.orderId));
  if (rows.length === 0) return 0;
  // Already reversed (replay). The unique index would refuse anyway; bailing
  // here keeps the returned figure honest about what this call changed.
  if (rows.some((row) => row.reason === "refund_reversal")) return 0;

  // Net of every row this order wrote against the card. A redeem is negative,
  // so the amount to give back is its negation. Zero or positive means no value
  // was ever taken — nothing to restore.
  const net = rows.reduce((sum, row) => sum + row.deltaCents, 0);
  const cents = -net;
  if (cents <= 0) return 0;

  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(giftCardLedger)
      .values({
        venueId: input.venueId,
        giftCardId: input.giftCardId!,
        orderId: input.orderId,
        deltaCents: cents, // refund = value back on the card
        reason: "refund_reversal",
        note: "Order refunded",
      })
      .onConflictDoNothing()
      .returning({ id: giftCardLedger.id });
    if (inserted.length === 0) return 0; // already restored (replay)

    await tx
      .update(giftCards)
      .set({
        balanceCents: sql`${giftCards.balanceCents} + ${cents}`,
        updatedAt: new Date(),
      })
      .where(eq(giftCards.id, input.giftCardId!));
    return cents;
  });
}

/**
 * Mirror of applyDepletionForOrder with the sign flipped: re-derive what the
 * order consumed and put it back. Guarded by its own partial unique index
 * (order, ingredient) WHERE reason='refund_restock'.
 *
 * Gated on a DEPLETION having actually happened, not on fulfilment status
 * alone. `fulfillment_status` defaults to 'new', so shouldRestock() is true for
 * an order that was never confirmed and therefore never depleted anything —
 * restocking it would ADD inventory the venue never had. Depletion runs in a
 * swallowed after() block with a daily cron backstop, so "confirmed" does not
 * imply "debited" either. Observing the movement is the only honest test, and it
 * matches how the gift-card and loyalty arms now work.
 */
async function restockOrder(
  orderId: string,
  venueId: string,
): Promise<number> {
  // Restock EXACTLY what was taken, read back from the depletion movements this
  // order actually wrote.
  //
  // This used to re-derive the amount from order_items x TODAY's recipe_lines,
  // which is only correct while the recipe has not changed since the order was
  // made. Edit a dish to use 20g of saffron instead of 5g, refund an order from
  // before the edit, and the venue is credited four times the saffron it ever
  // took out. The stock ledger is what a venue counts against; silently
  // inventing 15g of it is worse than restocking nothing.
  //
  // The movements are exact by construction: lib/stock/depletion.ts writes one
  // row per ingredient with `deltaQty: -consumed`, under a unique index on
  // (order_id, ingredient_id) WHERE reason = 'depletion'. Negating them is the
  // whole computation, and it removes the orderItems/recipeLines join entirely.
  //
  // An order with no depletion rows still restocks nothing — the guard is now
  // implicit in there being nothing to negate, rather than a separate check.
  const depletions = await db
    .select({
      ingredientId: stockMovements.ingredientId,
      deltaQty: stockMovements.deltaQty,
    })
    .from(stockMovements)
    .where(
      and(
        eq(stockMovements.orderId, orderId),
        eq(stockMovements.reason, "depletion"),
      ),
    );
  if (depletions.length === 0) return 0;

  const restoredByIngredient = new Map<string, number>();
  for (const movement of depletions) {
    // Depletion rows are negative (stock out), so the amount to give back is
    // their negation. A non-negative row is not a depletion this can reverse.
    const restored = -movement.deltaQty;
    if (restored <= 0) continue;
    restoredByIngredient.set(
      movement.ingredientId,
      (restoredByIngredient.get(movement.ingredientId) ?? 0) + restored,
    );
  }
  if (restoredByIngredient.size === 0) return 0;

  const rows = [...restoredByIngredient.entries()].map(
    ([ingredientId, restored]) => ({
      venueId,
      ingredientId,
      deltaQty: restored, // restock = stock in
      reason: "refund_restock" as const,
      orderId,
    }),
  );

  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(stockMovements)
      .values(rows)
      .onConflictDoNothing()
      .returning({
        ingredientId: stockMovements.ingredientId,
        deltaQty: stockMovements.deltaQty,
      });

    for (const row of inserted) {
      await tx
        .update(ingredients)
        .set({
          onHandQty: sql`COALESCE(${ingredients.onHandQty}, 0) + ${row.deltaQty}`,
        })
        .where(
          and(
            eq(ingredients.id, row.ingredientId),
            eq(ingredients.venueId, venueId),
          ),
        );
    }
    return inserted.length;
  });
}
