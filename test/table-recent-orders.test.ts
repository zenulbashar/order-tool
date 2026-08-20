import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The tables board tells the truth about what it is counting (audit L6).
 *
 * There is no session. No close-table control, no party lifecycle, no boundary
 * of any kind — the figure is every active dine-in order carrying a table LABEL
 * in the last two hours. A party that leaves at 13:00 having spent $80 and a
 * new party seated at 13:30 land in one bucket, so the board showed the NEW
 * party's order reference beside BOTH parties' money, under the heading
 * "Current session".
 *
 * A dwell-gap heuristic was the obvious fix and was deliberately not taken: it
 * would invent a boundary the product has no concept of, and be confidently
 * wrong on a table that orders drinks, waits forty minutes, then orders mains.
 * Prepay model, so nothing is owed — an accuracy problem, not a money one, and
 * the honest presentation is the whole fix.
 */
function stripComments(src: string): string {
  // Same reason as test/checkout-dead-ends.test.ts: the comments here explain
  // the very strings these assertions require to be absent.
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}
const source = (file: string) =>
  stripComments(readFileSync(join(process.cwd(), file), "utf8"));

describe("tables board", () => {
  const queries = () => source("app/dashboard/tables/queries.ts");
  const board = () => source("app/dashboard/tables/tables-board.tsx");

  it("does not call a 2h label sum a session", () => {
    // The name was the claim. Renaming it is what stops the next reader
    // assuming a boundary exists and building on top of it.
    expect(queries()).not.toContain("TableSession");
    expect(queries()).toContain("TableRecentOrders");
    expect(board()).not.toContain("Current session");
  });

  it("names the window in the UI", () => {
    expect(board()).toContain("last 2h");
  });

  it("never pairs ONE order reference with a COMBINED total", () => {
    // The specific misreading: a single ref beside a summed figure reads as
    // "this order's party spent this much". Asserted PER RENDER SITE, not by
    // counting across the file — mutation-testing caught that weaker version,
    // because removing the tile's guard still left two in the detail panel.
    const src = board();
    const sites = [
      { name: "tile", from: "{table.recent ? (", to: "{table.seats" },
      { name: "detail panel", from: "{selected.recent ? (", to: ") : null}" },
    ];
    for (const site of sites) {
      const start = src.indexOf(site.from);
      expect(start, `${site.name} not found`).toBeGreaterThan(-1);
      const end = src.indexOf(site.to, start);
      const block = src.slice(start, end > start ? end : undefined);
      expect(block, `${site.name} shows the latest reference`).toContain(
        "latestOrderRef",
      );
      expect(
        block,
        `${site.name} must branch on orderCount before pairing a ref with the total`,
      ).toContain("orderCount === 1");
    }
  });

  it("keeps the single-order case exact", () => {
    // The counterweight. When there IS one order, its reference and its amount
    // belong together and both are true — flattening everything to
    // "N orders · $X" would lose real information.
    expect(board()).toContain("latestOrderRef");
  });

  it("still aggregates by label, which is what L7 is about", () => {
    // Deliberately unchanged. Table identity is the free-text label snapshot,
    // so a rename still mis-attributes — but with the session claim gone, the
    // board no longer asserts these orders are one party, which is most of
    // what made that misattribution matter. See the audit's L7 note.
    expect(queries()).toContain("order.tableLabel");
  });
});
