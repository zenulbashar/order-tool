import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A handed-off order still has to be reachable (audit P12).
 *
 * The COMPLETED column rendered `onOpen={isCompleted ? undefined : ...}` and
 * `compact={isCompleted}`, and the compact card carried no click handler, no
 * OrderStatusControls and no PrintButton. With `onOpen` absent the enlarge
 * button was not rendered either — so the card was a dead end, and there is no
 * other order-detail route anywhere in the dashboard.
 *
 * Order handed over at 12:40; customer returns at 12:55 wanting a refund. There
 * was nothing to click. After RECENT_COMPLETED_WINDOW_MS the order leaves the
 * board entirely.
 *
 * A Stripe-Dashboard refund does still reconcile — `charge.refunded` inserts the
 * refunds row idempotently, rewrites orders.status and runs compensation — so
 * the loss was actor attribution, not money: actorUserId null, note "Reconciled
 * from Stripe", and no recordVenueAudit("order_refunded") entry.
 */
describe("completed orders stay actionable", () => {
  const source = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

  it("opens the drawer for completed orders, not only live ones", () => {
    const board = source("app/dashboard/orders/orders-board.tsx");
    expect(board, "the board must not withhold onOpen").not.toMatch(
      /onOpen=\{\s*isCompleted \? undefined/,
    );
    expect(board).toContain("onOpen={() => setActiveId(order.id)}");
  });

  it("renders the enlarge affordance on the compact card", () => {
    // Passing onOpen alone was not enough: the enlarge button lived only in the
    // full card's header, so the compact branch stayed unclickable.
    //
    // Asserted on the shared component, not on inline markup. The first version
    // of this test looked for `onClick={onOpen}` inside the branch, which
    // pinned the implementation rather than the behaviour and went red the
    // moment button-literal-drift forced the button into one definition — the
    // structure improved and the test called it a regression.
    const card = source("app/dashboard/orders/order-card.tsx");
    const compactBranch = card.slice(
      card.indexOf("if (compact) {"),
      card.indexOf("return (\n    <li"),
    );
    expect(compactBranch, "compact card must offer the enlarge button").toContain(
      "<OpenTicketButton",
    );
    // And the shared button must actually be wired to open something.
    expect(card).toContain("onClick={onOpen}");
  });

  it("keeps the drawer's refund and step-back controls unconditional", () => {
    // Verified rather than assumed: the finding implied drawer work, but the
    // drawer already mounted all three. Pinning it means the fix cannot be
    // undone from the other end by making these conditional on fulfilment.
    const drawer = source("app/dashboard/orders/ticket-drawer.tsx");
    for (const control of ["RefundControl", "OrderStatusControls", "PrintButton"]) {
      expect(drawer, `${control} must be mounted`).toContain(`<${control}`);
    }
    expect(
      drawer,
      "no fulfilment-status branch may hide the drawer's controls",
    ).not.toMatch(/fulfillmentStatus\s*===\s*"completed"/);
  });

  it("refunds gate on PAYMENT status, which is why a completed order qualifies", () => {
    // The load-bearing detail behind the test above. RefundControl reads
    // orders.status (confirmed / partially_refunded), never fulfillmentStatus —
    // so "completed" on the board says nothing about refundability.
    const refund = source("app/dashboard/orders/refund-control.tsx");
    expect(refund).toContain('status === "confirmed"');
    expect(refund).toContain('status === "partially_refunded"');
    expect(refund).not.toContain("fulfillmentStatus");
  });

  it("keeps a back-one-step transition defined for completed", () => {
    // BACKWARD.completed is what makes the "Back to ready" correction possible.
    // It was defined and unreachable; the board was the reason.
    const controls = source("app/dashboard/orders/order-status-controls.tsx");
    expect(controls).toMatch(/completed:\s*\{\s*prev:\s*"ready"/);
  });

  it("no longer claims completed cards render no controls", () => {
    // The comment contradicted the table above it. A reader trusting it would
    // conclude the back-one-step path did not exist and build it again.
    const controls = source("app/dashboard/orders/order-status-controls.tsx");
    expect(controls).not.toContain("Completed cards render no controls");
  });
});
