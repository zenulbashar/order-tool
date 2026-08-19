import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ACTIVE_ORDER_STATUSES,
  CONFIRMABLE_ORDER_STATUSES,
  PAID_ORDER_STATUSES,
  HOLDING_ORDER_STATUSES,
} from "@/lib/db/order-status";

/**
 * A declined-then-retried card must still confirm its order.
 *
 * Checkout retries against the SAME PaymentIntent — Stripe returns a declined
 * PI to `requires_payment_method` precisely so it can be re-confirmed — so the
 * ordinary "card declined, try another card" flow delivers
 * `payment_intent.payment_failed` and THEN `payment_intent.succeeded` for one
 * `pi_`. While the confirm write required `pending_payment`, that second event
 * matched zero rows and the order was stranded: no kitchen ticket, no POS
 * mirror, no stock depletion, no loyalty, no receipt, no alert (the
 * charge-vs-order backstop runs inside the confirmed loop), no in-product refund
 * (refundOrder rejects a non-paid order), and a diner-facing page stating in
 * writing that no charge had been made.
 *
 * The mock DB in the sibling webhook spec does not evaluate WHERE clauses, so
 * the predicate is asserted from source here — the same approach
 * test/checkout-minimum-total.test.ts uses for its ordering property.
 */
const WEBHOOK = readFileSync(
  join(process.cwd(), "app/api/stripe/webhook/route.ts"),
  "utf8",
);

describe("CONFIRMABLE_ORDER_STATUSES", () => {
  it("lets a retried payment reclaim a declined order", () => {
    expect([...CONFIRMABLE_ORDER_STATUSES]).toContain("payment_failed");
    expect([...CONFIRMABLE_ORDER_STATUSES]).toContain("pending_payment");
  });

  it("EXCLUDES confirmed, which is what keeps the write idempotent", () => {
    // A redelivered success must still match zero rows, or every value-moving
    // after() block fires twice.
    expect([...CONFIRMABLE_ORDER_STATUSES]).not.toContain("confirmed");
  });

  it("EXCLUDES every paid/refund state, so money already returned is never resurrected", () => {
    for (const paid of PAID_ORDER_STATUSES) {
      expect(
        [...CONFIRMABLE_ORDER_STATUSES] as string[],
        `${paid} must not be confirmable`,
      ).not.toContain(paid);
    }
  });

  it("EXCLUDES cancelled — a cancelled order paying is a case for a human", () => {
    expect([...CONFIRMABLE_ORDER_STATUSES]).not.toContain("cancelled");
  });
});

describe("the webhook actually uses it", () => {
  it("confirms on the group, not on a bare pending_payment equality", () => {
    expect(WEBHOOK).toContain("CONFIRMABLE_ORDER_STATUSES");
    // The success branch must not have been left with the old narrow predicate.
    const successBranch = WEBHOOK.slice(
      WEBHOOK.indexOf('case "payment_intent.succeeded"'),
      WEBHOOK.indexOf('case "payment_intent.payment_failed"'),
    );
    expect(successBranch.length).toBeGreaterThan(0);
    expect(successBranch).toContain("CONFIRMABLE_ORDER_STATUSES");
    expect(successBranch).not.toMatch(
      /eq\(orders\.status,\s*"pending_payment"\)/,
    );
  });

  it("keeps the FAILURE write narrow, so a late decline cannot unconfirm a paid order", () => {
    // Events can arrive out of order. payment_failed must only ever act on a
    // still-pending order — never on one already confirmed.
    const failBranch = WEBHOOK.slice(
      WEBHOOK.indexOf('case "payment_intent.payment_failed"'),
    );
    expect(failBranch).toMatch(/eq\(orders\.status,\s*"pending_payment"\)/);
    expect(failBranch).not.toContain("CONFIRMABLE_ORDER_STATUSES");
  });
});

describe("HOLDING_ORDER_STATUSES", () => {
  it("holds gift-card and points value through a decline", () => {
    // If a decline released the hold, a second order could spend the same value
    // before the retry, and the retry would be honoured against value already
    // gone — the gift-card debit clamps at zero, absorbing it silently.
    expect([...HOLDING_ORDER_STATUSES]).toContain("payment_failed");
    expect([...HOLDING_ORDER_STATUSES]).toContain("pending_payment");
  });

  it("KEEPS holding while the order is live, because the debit lands later", () => {
    // The debit runs in a swallowed after() that itself requires 'confirmed',
    // so it can only happen after the status flip. Releasing the hold at the
    // flip is exactly the window that let one card be spent twice.
    for (const active of ACTIVE_ORDER_STATUSES) {
      expect([...HOLDING_ORDER_STATUSES] as string[]).toContain(active);
    }
  });

  it("releases a fully refunded order — its value came back", () => {
    expect([...HOLDING_ORDER_STATUSES]).not.toContain("refunded");
  });

  it("is applied at BOTH value sites, each paired with a not-yet-debited check", () => {
    // The status group alone would double-subtract once the debit lands: the
    // balance would already reflect it AND the reservation would still count.
    // The ledger absence is what releases the hold at the right moment.
    for (const file of ["lib/giftcards/queries.ts", "lib/loyalty/balance.ts"]) {
      const src = readFileSync(join(process.cwd(), file), "utf8");
      expect(src, `${file} must hold on the group`).toContain(
        "HOLDING_ORDER_STATUSES",
      );
      expect(src, `${file} must pair it with a not-exists debit check`).toMatch(
        /not exists/i,
      );
      expect(src, `${file} must not use the old narrow predicate`).not.toMatch(
        /eq\(orders\.status,\s*"pending_payment"\)/,
      );
    }
  });
});
