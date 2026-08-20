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
