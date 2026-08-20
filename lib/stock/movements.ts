import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  ingredients,
  stockMovementReason,
  stockMovements,
} from "@/lib/db/schema";

/** The transaction executor drizzle hands to a `db.transaction` callback. */
export type StockTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * DERIVED from the pgEnum, not hand-listed.
 *
 * The hand-written union had drifted: it carried six of the enum's seven
 * values, silently omitting `refund_restock` — which refund compensation
 * writes. Anything typing a map or a switch on this therefore looked complete
 * to the compiler while missing a real case, which is exactly how the stock
 * overview ended up printing a raw `REFUND_RESTOCK` in its movement feed.
 * Deriving it makes the next enum value a build error instead.
 */
export type MovementReason = (typeof stockMovementReason.enumValues)[number];

/**
 * Record ONE stock movement and keep the ingredient's cached on-hand counter in
 * lockstep — both writes in the caller's transaction so the ledger (the audit
 * source of truth) and `ingredients.on_hand_qty` can never drift apart. The
 * counter update is venue- AND ingredient-scoped, so the CALLER must have
 * already confirmed the ingredient belongs to the venue (a forged id updates no
 * row, but the ledger insert would still write — validate upstream).
 *
 * A zero delta is a no-op (a stocktake that matches the count records nothing)
 * — EXCEPT for an `opening` count, which is a state transition rather than a
 * quantity change. `on_hand_qty` starts NULL meaning "never counted", and the
 * stock form sets reason `opening` precisely when it is still NULL. Bailing on
 * the zero delta skipped the counter UPDATE as well as the ledger insert, so an
 * owner counting an ingredient as genuinely zero got a success redirect and a
 * row still reading NULL — indistinguishable from never having been counted.
 *
 * That is the DEFAULT path, not an edge case: the form pre-selects `set`
 * exactly when `on_hand_qty` is null, and its placeholder is literally "0".
 */
export async function recordStockMovement(
  tx: StockTx,
  input: {
    venueId: string;
    ingredientId: string;
    deltaQty: number;
    reason: MovementReason;
    orderId?: string | null;
    note?: string | null;
  },
): Promise<void> {
  if (input.deltaQty === 0 && input.reason !== "opening") return;

  await tx.insert(stockMovements).values({
    venueId: input.venueId,
    ingredientId: input.ingredientId,
    deltaQty: input.deltaQty,
    reason: input.reason,
    orderId: input.orderId ?? null,
    note: input.note ?? null,
  });

  await tx
    .update(ingredients)
    .set({
      onHandQty: sql`COALESCE(${ingredients.onHandQty}, 0) + ${input.deltaQty}`,
    })
    .where(
      and(
        eq(ingredients.id, input.ingredientId),
        eq(ingredients.venueId, input.venueId),
      ),
    );
}
