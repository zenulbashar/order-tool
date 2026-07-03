import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { ingredients, stockMovements } from "@/lib/db/schema";

/** The transaction executor drizzle hands to a `db.transaction` callback. */
export type StockTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type MovementReason =
  | "opening"
  | "receiving"
  | "adjustment"
  | "wastage"
  | "stocktake"
  | "depletion";

/**
 * Record ONE stock movement and keep the ingredient's cached on-hand counter in
 * lockstep — both writes in the caller's transaction so the ledger (the audit
 * source of truth) and `ingredients.on_hand_qty` can never drift apart. The
 * counter update is venue- AND ingredient-scoped, so the CALLER must have
 * already confirmed the ingredient belongs to the venue (a forged id updates no
 * row, but the ledger insert would still write — validate upstream).
 *
 * A zero delta is a no-op (a stocktake that matches the count records nothing).
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
  if (input.deltaQty === 0) return;

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
