import "server-only";

import { and, eq, gt, inArray, notExists, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  ingredients,
  orderItems,
  orders,
  recipeLines,
  stockMovements,
} from "@/lib/db/schema";

/**
 * Order-driven stock depletion (Track D · D4b). When an order is confirmed, the
 * ingredients its dishes consume are decremented from on-hand: for each ordered
 * line with a recipe, deplete quantity × recipe-line qty of each ingredient,
 * summed to ONE `depletion` movement per (order, ingredient).
 *
 * NEVER on the order money-path: this module is only ever called AFTER an order
 * is already confirmed, and every caller isolates it in its own try/catch (the
 * webhook fast-path) or is the cron sweep. It writes ONLY stock ledger state.
 *
 * Idempotent: the partial unique index stock_movements_order_depletion_uniq
 * makes the insert ON CONFLICT DO NOTHING, and only newly-inserted rows bump the
 * cached on_hand_qty — so webhook replays, sweep overlaps, and concurrent kicks
 * can never double-deplete. Depletion applies to EVERY recipe ingredient
 * regardless of whether it was being tracked; an un-counted ingredient simply
 * goes negative until the owner sets an opening count (a "tell us your starting
 * stock" signal).
 */

/** How far back the sweep re-derives depletion from confirmed orders. */
const SWEEP_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Orders processed per sweep — bounded so a burst spreads across ticks. */
const SWEEP_BATCH = 100;

/**
 * Apply depletion for one already-confirmed order. Returns the number of
 * ingredients newly depleted (0 if the order has no mapped recipes, or was
 * already depleted).
 */
export async function applyDepletionForOrder(
  orderId: string,
  venueId: string,
): Promise<number> {
  // Ordered lines that still resolve to a menu item (a since-deleted item has a
  // null soft ref → no recipe to map → skipped). Multiple lines can share a
  // menu item (different variants/modifiers), so sum quantity per item.
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

  // Recipes for those items, venue-scoped (a forged order can't reach another
  // venue's recipes).
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

  // Sum consumption per ingredient across every ordered serving.
  const consumedByIngredient = new Map<string, number>();
  for (const recipe of recipes) {
    const servings = qtyByMenuItem.get(recipe.menuItemId) ?? 0;
    const amount = servings * recipe.qty;
    if (amount <= 0) continue;
    consumedByIngredient.set(
      recipe.ingredientId,
      (consumedByIngredient.get(recipe.ingredientId) ?? 0) + amount,
    );
  }
  if (consumedByIngredient.size === 0) return 0;

  const rows = [...consumedByIngredient.entries()].map(
    ([ingredientId, consumed]) => ({
      venueId,
      ingredientId,
      deltaQty: -consumed, // depletion = stock out
      reason: "depletion" as const,
      orderId,
    }),
  );

  return db.transaction(async (tx) => {
    // ON CONFLICT DO NOTHING against the partial unique index; RETURNING tells us
    // exactly which movements are new, so the counter bumps once per order.
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

/**
 * Fast-path entry from the Stripe webhook: resolve the order behind a
 * PaymentIntent (only when already 'confirmed', matching the confirm UPDATE's
 * key) and deplete it. Returns ingredients depleted (0 = nothing to do).
 */
export async function depleteStockForOrder(
  paymentIntentId: string,
): Promise<number> {
  const [order] = await db
    .select({ id: orders.id, venueId: orders.venueId })
    .from(orders)
    .where(
      and(
        eq(orders.stripePaymentIntentId, paymentIntentId),
        eq(orders.status, "confirmed"),
      ),
    )
    .limit(1);
  if (!order) return 0;
  return applyDepletionForOrder(order.id, order.venueId);
}

/**
 * The backstop (cron): apply depletion to any recently-confirmed order that has
 * no depletion movement yet — the guarantee that makes the webhook fast-path a
 * latency optimization only. Bounded per invocation; idempotency lets the next
 * tick continue.
 */
export async function sweepStockDepletion(): Promise<number> {
  const since = new Date(Date.now() - SWEEP_WINDOW_MS);
  const pending = await db
    .select({ id: orders.id, venueId: orders.venueId })
    .from(orders)
    .where(
      and(
        eq(orders.status, "confirmed"),
        gt(orders.createdAt, since),
        notExists(
          db
            .select({ one: sql`1` })
            .from(stockMovements)
            .where(
              and(
                eq(stockMovements.orderId, orders.id),
                eq(stockMovements.reason, "depletion"),
              ),
            ),
        ),
      ),
    )
    .limit(SWEEP_BATCH);

  let applied = 0;
  for (const order of pending) {
    try {
      const n = await applyDepletionForOrder(order.id, order.venueId);
      if (n > 0) applied += 1;
    } catch {
      // A single order's depletion failure must not abort the sweep; the next
      // tick retries it (idempotent).
    }
  }
  return applied;
}
