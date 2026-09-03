import "server-only";

import { and, asc, eq, exists, gt, inArray, notExists, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { ACTIVE_ORDER_STATUSES } from "@/lib/db/order-status";
import {
  ingredients,
  orderItems,
  orders,
  recipeLines,
  stockMovements,
} from "@/lib/db/schema";
import {
  consumptionByIngredient,
  sumQuantityByMenuItem,
} from "@/lib/stock/depletion-plan";
import { advanceSweepWatermark, sweepLookbackSince } from "@/lib/sweep-watermark";

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

/**
 * How far back the sweep re-derives depletion from confirmed orders. 72h — must
 * exceed the worst-case gap between successful daily cron runs (Vercel cron
 * never retries a failed run, and runs jitter within the hour), or orders in a
 * missed run's gap are permanently skipped. See the rationale on
 * lib/integrations/dispatch.ts SWEEP_WINDOW_MS; keep all five in lockstep.
 */
const SWEEP_WINDOW_MS = 72 * 60 * 60 * 1000;
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

  const qtyByMenuItem = sumQuantityByMenuItem(lines);
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

  // Sum consumption per ingredient across every ordered serving. Extracted to
  // lib/stock/depletion-plan.ts so the arithmetic is testable without a DB.
  const consumedByIngredient = consumptionByIngredient(qtyByMenuItem, recipes);
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
  const startedAt = new Date();
  // Anchored to the last SUCCESSFUL sweep (M2) — the 72h window is the floor,
  // an outage longer than it widens the lookback instead of orphaning orders.
  const since = await sweepLookbackSince("stock_depletion", SWEEP_WINDOW_MS);
  const pending = await db
    .select({ id: orders.id, venueId: orders.venueId })
    .from(orders)
    .where(
      and(
        // A partially refunded order was still cooked from real stock, so it
        // still owes its depletion; excluding it left the counts overstating
        // what is on the shelf forever. `refunded` stays out — restockOrder
        // handles the full-refund case, and depleting here would fight it.
        inArray(orders.status, ACTIVE_ORDER_STATUSES),
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
        // Only orders that CAN deplete: at least one line whose menu item has
        // a recipe. An order of recipe-less items never gets a depletion row,
        // so without this filter the same recipe-less orders filled the batch
        // every tick once more than SWEEP_BATCH of them sat in the lookback —
        // the watermark never advanced and a real missed depletion behind
        // them was never reached.
        exists(
          db
            .select({ one: sql`1` })
            .from(orderItems)
            .innerJoin(
              recipeLines,
              and(
                eq(recipeLines.menuItemId, orderItems.menuItemId),
                eq(recipeLines.venueId, orders.venueId),
              ),
            )
            .where(eq(orderItems.orderId, orders.id)),
        ),
      ),
    )
    // Oldest first, so a backlog drains in order instead of the same
    // arbitrary hundred being returned each tick.
    .orderBy(asc(orders.createdAt))
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
  // Advance the watermark only when this sweep saw its WHOLE backlog — a
  // batch-capped tick leaves it alone so the remainder stays inside the next
  // lookback even past the 72h floor.
  if (pending.length < SWEEP_BATCH) {
    await advanceSweepWatermark("stock_depletion", startedAt);
  }
  return applied;
}
