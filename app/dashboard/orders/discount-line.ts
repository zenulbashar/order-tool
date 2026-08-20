import { formatCents } from "@/lib/validation";

/**
 * The Subtotal + Discount lines an owner surface prints ABOVE its Total, or
 * null when the order needs no reconciliation.
 *
 * `applyOrderDiscounts` writes `totalCents = subtotal − promo − bank − points −
 * giftCard` but never rewrites `orders.subtotalCents` or
 * `order_items.line_total_cents`, so the itemised rows always sum to the
 * SUBTOTAL. Printing those rows straight above a discounted Total gives paper
 * that does not add up: 3 × Burger $30.00, then Total $25.00, with nothing
 * accounting for the missing $5.
 *
 * That matters more here than it would on a status screen. `print-context.tsx`
 * calls this print kind "the customer receipt", the docket ends with "Thank
 * you", and it now carries a GST line — so it is the artefact a diner is handed
 * and a venue keeps for its records. A tax invoice whose lines do not reconcile
 * to its total is a bookkeeping problem, not a cosmetic one.
 *
 * The diner's own receipt page and the notification email already print this
 * breakdown for the identical order (`lib/customer/order-email.ts` carries the
 * comment explaining why). This is the same decision for the three owner
 * surfaces, which had been left behind.
 *
 * As with `taxLineText`, only the DECISION lives here. The board card, the
 * drawer and the thermal docket style these lines differently — the docket is
 * monochrome and bold — but they must agree on WHEN the breakdown appears and
 * what it says, and that is the part that would otherwise drift apart again.
 */
export type OrderDiscountLine = {
  /** Pre-discount sum of the itemised rows, formatted (no currency symbol). */
  subtotal: string;
  /** The amount taken off, formatted as a positive figure. */
  discount: string;
};

export function orderDiscountLine(
  subtotalCents: number,
  totalCents: number,
): OrderDiscountLine | null {
  // `<=` not `<`: an undiscounted order needs no breakdown, and a total ABOVE
  // subtotal must not render "Discount −$-3.00". The product charges no
  // per-order fee, so that case means data we do not understand — and an
  // unexplained Total is a smaller error than a confidently wrong breakdown.
  if (subtotalCents <= totalCents) return null;
  return {
    subtotal: formatCents(subtotalCents),
    discount: formatCents(subtotalCents - totalCents),
  };
}

/**
 * The "Refunded" line for an order that has had money go back, or null.
 *
 * A partially refunded order stays on the board — ACTIVE_ORDER_STATUSES
 * includes `partially_refunded`, deliberately, because a goodwill refund on a
 * late order does not cancel the food. But it kept printing `Total $55.00 /
 * incl. GST $5.00` with a plain fulfilment badge, so the docket a venue files
 * still claimed the full amount after $10 had gone back. `refundedCents` was
 * already on KitchenOrder; its only consumer was RefundControl, inside a drawer
 * nobody opens to read a receipt.
 *
 * Deliberately NOT netted into the Total. The Total is what was CHARGED, and
 * the refund is a separate movement against it — collapsing them would leave a
 * receipt that cannot be reconciled against either the Stripe charge or the
 * refund. Printing both, with the net beneath, is what makes the paper add up.
 */
export type OrderRefundLine = {
  /** What has gone back, formatted as a positive figure. */
  refunded: string;
  /** Charged less refunded — what the venue actually kept. */
  net: string;
};

export function orderRefundLine(
  totalCents: number,
  refundedCents: number,
): OrderRefundLine | null {
  // Clamped rather than trusted, same discipline as netOrderMoney: this reads a
  // stored aggregate, and a receipt must never print a negative kept amount.
  const refunded = Math.min(Math.max(refundedCents, 0), Math.max(totalCents, 0));
  if (refunded <= 0) return null;
  return {
    refunded: formatCents(refunded),
    net: formatCents(Math.max(totalCents - refunded, 0)),
  };
}
