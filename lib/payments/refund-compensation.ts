import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  giftCardLedger,
  giftCards,
  ingredients,
  orderItems,
  orders,
  pointsLedger,
  recipeLines,
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
    cents: order.giftCardRedeemedCents,
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

/** Return the value a gift card paid toward this order, once. */
async function restoreGiftCard(input: {
  orderId: string;
  venueId: string;
  giftCardId: string | null;
  cents: number;
}): Promise<number> {
  if (!input.giftCardId || input.cents <= 0) return 0;
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(giftCardLedger)
      .values({
        venueId: input.venueId,
        giftCardId: input.giftCardId!,
        orderId: input.orderId,
        deltaCents: input.cents, // refund = value back on the card
        reason: "refund_reversal",
        note: "Order refunded",
      })
      .onConflictDoNothing()
      .returning({ id: giftCardLedger.id });
    if (inserted.length === 0) return 0; // already restored (replay)

    await tx
      .update(giftCards)
      .set({
        balanceCents: sql`${giftCards.balanceCents} + ${input.cents}`,
        updatedAt: new Date(),
      })
      .where(eq(giftCards.id, input.giftCardId!));
    return input.cents;
  });
}

/**
 * Mirror of applyDepletionForOrder with the sign flipped: re-derive what the
 * order consumed and put it back. Guarded by its own partial unique index
 * (order, ingredient) WHERE reason='refund_restock'.
 */
async function restockOrder(
  orderId: string,
  venueId: string,
): Promise<number> {
  const lines = await db
    .select({ menuItemId: orderItems.menuItemId, quantity: orderItems.quantity })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));

  const qtyByMenuItem = new Map<string, number>();
  for (const line of lines) {
    if (!line.menuItemId) continue;
    qtyByMenuItem.set(
      line.menuItemId,
      (qtyByMenuItem.get(line.menuItemId) ?? 0) + line.quantity,
    );
  }
  if (qtyByMenuItem.size === 0) return 0;

  const recipes = await db
    .select({
      menuItemId: recipeLines.menuItemId,
      ingredientId: recipeLines.ingredientId,
      qty: recipeLines.qty,
    })
    .from(recipeLines)
    .where(
      and(
        eq(recipeLines.venueId, venueId),
        inArray(recipeLines.menuItemId, [...qtyByMenuItem.keys()]),
      ),
    );
  if (recipes.length === 0) return 0;

  const restoredByIngredient = new Map<string, number>();
  for (const recipe of recipes) {
    const servings = qtyByMenuItem.get(recipe.menuItemId) ?? 0;
    const amount = servings * recipe.qty;
    if (amount <= 0) continue;
    restoredByIngredient.set(
      recipe.ingredientId,
      (restoredByIngredient.get(recipe.ingredientId) ?? 0) + amount,
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
