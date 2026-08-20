import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const source = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

/**
 * Comments removed before any ABSENCE assertion.
 *
 * test/authz-coverage.test.ts records this lesson from the other direction —
 * prose satisfying an assertion. It breaks them too: the comment explaining WHY
 * the recipe join was removed has to name the join, and a raw-text scan then
 * reads the explanation as the violation. A codebase where you cannot describe
 * what you deleted is worse than one without the check.
 */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const code = (file: string) => stripComments(source(file));

/**
 * Restock what was taken, not what the recipe says today (audit L3).
 *
 * `restockOrder` re-derived the amount from order_items x TODAY's
 * `recipe_lines`. That is only correct while the recipe has not changed since
 * the order was made. Edit a dish from 5g of saffron to 20g, refund an order
 * from before the edit, and the venue is credited four times the saffron it
 * ever took out — silently, into the ledger it counts against.
 *
 * The depletion movements are exact by construction: lib/stock/depletion.ts
 * writes one row per ingredient with `deltaQty: -consumed`, under a unique
 * index on (order_id, ingredient_id) WHERE reason = 'depletion'. Negating them
 * is the whole computation.
 *
 * Half of this finding was already closed earlier in this series — the guard
 * requiring an observed depletion before restocking, which stopped restocking
 * from nothing. This is the other half: the AMOUNT.
 */
describe("restockOrder", () => {
  const compensation = code("lib/payments/refund-compensation.ts");
  const restock = compensation.slice(
    compensation.indexOf("async function restockOrder("),
  );

  it("reads the order's recorded depletion movements", () => {
    expect(restock).toContain('eq(stockMovements.reason, "depletion")');
    expect(restock).toContain("deltaQty: stockMovements.deltaQty");
  });

  it("does NOT re-derive the amount from recipes or order lines", () => {
    // The whole defect. Either import reappearing here means the amount is
    // being recomputed against data that may have changed since the order.
    expect(restock, "must not read recipe_lines").not.toContain("recipeLines");
    expect(restock, "must not read order_items").not.toContain("orderItems");
  });

  it("drops those imports from the module entirely", () => {
    // Not merely unused inside the function — gone, so a future edit cannot
    // quietly reach for them again.
    expect(compensation).not.toContain("recipeLines");
    expect(compensation).not.toContain("orderItems");
  });

  it("negates the depletion, because depletion rows are negative", () => {
    // depletion.ts writes `deltaQty: -consumed`. Restocking the raw value would
    // subtract stock a second time on every refund.
    expect(restock).toMatch(/-\s*movement\.deltaQty/);
  });

  it("still restocks nothing for an order that never depleted", () => {
    // A missed depletion must not restock from nothing — the guard is now
    // implicit in there being no rows to negate.
    expect(restock).toContain("if (depletions.length === 0) return 0;");
  });
});

/**
 * Promo audience needs the customer at ORDER time (audit L5).
 *
 * `lib/promotions.ts` gates first-timers-only promos with
 * `c.audience === "new" && customerId && returning` — it short-circuits on a
 * falsy `customerId`. The column's only writer was `claimOrder`, which runs
 * AFTER the order exists and is called fire-and-forget with `.catch(() => {})`.
 * So at the moment discounts are evaluated it was null in the ORDINARY case,
 * not merely when that call failed, and a returning signed-in diner was handed
 * a first-timers promo (and lost their loyalty earn with it).
 */
describe("placeOrder customer attribution", () => {
  const actions = code("app/[slug]/checkout/actions.ts");

  it("stamps the order with the signed-in customer", () => {
    expect(actions).toContain("customerId,");
    expect(actions).toContain("getCustomer(venueId)");
  });

  it("resolves the customer from the SESSION, never from input", () => {
    // A client-supplied customer id would let anyone attach an order to another
    // diner's account — a tenant-isolation hole wearing the costume of a form
    // field. getCustomer reads the cookie and is venue-bound.
    expect(actions).not.toMatch(/customerId:\s*data\./);
    expect(actions).not.toMatch(/customerId:\s*input\./);
  });

  it("degrades to null rather than blocking a paying order", () => {
    // Attribution is worth having; it is not worth failing a checkout over.
    const block = actions.slice(
      actions.indexOf("let customerId: string | null = null;"),
      actions.indexOf("const dailyNumber"),
    );
    expect(block).toContain("catch");
    expect(block).toContain("customerId = null;");
  });

  it("leaves the promo guard itself untouched", () => {
    // The fix is upstream: give the guard a customerId to work with. Loosening
    // the guard instead would grant first-timer promos MORE widely.
    expect(code("lib/promotions.ts")).toContain(
      'c.audience === "new" && customerId && returning',
    );
  });
});
