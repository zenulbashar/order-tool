import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { recordStockMovement, type MovementReason } from "./movements";
import { stockMovementReason } from "@/lib/db/schema";

/**
 * The zero-delta bail (audit L2).
 *
 * `on_hand_qty` starts NULL meaning "never counted". The stock form sets reason
 * `opening` precisely when it is still NULL, and its placeholder is literally
 * "0" — so counting an ingredient as genuinely zero is the DEFAULT path, not an
 * edge case.
 *
 * That path computed `deltaQty = 0 - 0 = 0`, hit the no-op bail, and wrote
 * NOTHING — no ledger row and, worse, no counter UPDATE. The action redirected
 * as success while the row still read NULL, indistinguishable from an
 * ingredient nobody had ever counted.
 */
function fakeTx() {
  const inserted: Record<string, unknown>[] = [];
  const updated: Record<string, unknown>[] = [];
  return {
    inserted,
    updated,
    tx: {
      insert: vi.fn(() => ({
        values: (v: Record<string, unknown>) => {
          inserted.push(v);
          return Promise.resolve();
        },
      })),
      update: vi.fn(() => ({
        set: (v: Record<string, unknown>) => ({
          where: () => {
            updated.push(v);
            return Promise.resolve();
          },
        }),
      })),
    },
  };
}

const base = { venueId: "ven_1", ingredientId: "ing_1", note: null };

describe("recordStockMovement", () => {
  it("records an opening count of ZERO", async () => {
    // The whole finding. A quantity of nothing is still a count.
    const { tx, inserted, updated } = fakeTx();
    await recordStockMovement(tx as never, {
      ...base,
      deltaQty: 0,
      reason: "opening",
    });
    expect(inserted, "the ledger must show the count happened").toHaveLength(1);
    expect(updated, "on_hand_qty must move from NULL to 0").toHaveLength(1);
  });

  it("still skips a zero-delta stocktake", async () => {
    // The counterweight: a stocktake matching the count really is a no-op, and
    // recording one would fill the feed with rows saying nothing changed.
    const { tx, inserted, updated } = fakeTx();
    await recordStockMovement(tx as never, {
      ...base,
      deltaQty: 0,
      reason: "stocktake",
    });
    expect(inserted).toHaveLength(0);
    expect(updated).toHaveLength(0);
  });

  it("records a non-zero movement of any reason", async () => {
    const { tx, inserted, updated } = fakeTx();
    await recordStockMovement(tx as never, {
      ...base,
      deltaQty: -3,
      reason: "depletion",
    });
    expect(inserted).toHaveLength(1);
    expect(updated).toHaveLength(1);
  });
});

describe("MovementReason", () => {
  it("covers every value the database enum can hold", () => {
    // It was hand-written and had drifted to six of seven, silently omitting
    // refund_restock — so any map or switch typed on it looked exhaustive to
    // the compiler while missing a real case.
    const fromEnum = [...stockMovementReason.enumValues].sort();
    const declared: MovementReason[] = [
      "opening",
      "receiving",
      "adjustment",
      "wastage",
      "stocktake",
      "depletion",
      "refund_restock",
    ];
    expect([...declared].sort()).toEqual(fromEnum);
  });

  it("is derived from the enum rather than re-listed", () => {
    // The assertion above passes for a hand-list that happens to be correct
    // TODAY. This is what stops the next enum value drifting again.
    const src = readFileSync(
      join(process.cwd(), "lib/stock/movements.ts"),
      "utf8",
    );
    expect(src).toContain("typeof stockMovementReason.enumValues");
  });
});

describe("stock overview usage", () => {
  const src = () =>
    readFileSync(
      join(process.cwd(), "app/dashboard/stock/overview/page.tsx"),
      "utf8",
    );

  it("nets refund restocks off consumption", () => {
    // A refund_restock only fires for an UNMADE order, so those ingredients
    // never left the shelf. Counting them as consumed overstated usage,
    // run-rate, days-of-cover and COGS together — one omission, four wrong
    // numbers.
    expect(src()).toContain('inArray(stockMovements.reason, ["depletion", "refund_restock"])');
    expect(src(), "must no longer filter on depletion alone").not.toContain(
      'eq(stockMovements.reason, "depletion")',
    );
  });

  it("types its label map so a missing reason is a build error", () => {
    expect(src()).toContain("Record<MovementReason, string>");
    expect(src()).toContain("refund_restock:");
  });
});
