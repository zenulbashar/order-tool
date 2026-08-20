/**
 * Net an order's money down by what has been refunded on it (audit P8).
 *
 * Two conventions for "revenue over 30 days" existed side by side, and they
 * disagreed on the same order. `getConfirmedSalesSummary` (the Payments card)
 * counts `PAID_ORDER_STATUSES` gross and subtracts succeeded refunds; Reports,
 * the owner home and both admin surfaces filtered `status = 'confirmed'` alone.
 * Since `syncOrderRefundStatus` rewrites the status the moment any money goes
 * back, a single refunded cent removed a $55 order from Reports entirely —
 * Revenue $0.00, Orders 0, GST $0.00, "No sales yet" — while Payments read
 * "$45.00" and the docket for that same order still printed $55.00.
 *
 * This is the arithmetic half of settling that. `PlatformAudit-2026-07.md`
 * already asserts "Revenue reporting is now net of refunds"; the aggregates
 * simply never honoured it.
 *
 * GST is APPORTIONED rather than looked up, because the `refunds` table stores
 * `amount_cents` and nothing else — there is no tax component on a refund row
 * to read. So the GST that goes back with a refund is the same fraction of the
 * order's own recorded `taxCents` as the refund is of its total. That is the
 * standard treatment for a decreasing adjustment, and deriving it from the
 * order's STORED tax rather than re-applying a rate matters: a venue can change
 * its GST setting, and a refund must unwind the tax the order actually carried,
 * not the tax the venue charges today.
 *
 * Apportioning per ORDER, never across a window's totals, is the other half of
 * that. Orders inside one 30-day window can carry different tax treatment — a
 * venue that turned GST off mid-window leaves `taxCents = 0` on everything
 * after — so one global ratio would push tax onto orders that never carried any.
 *
 * Pure: no I/O, no clock, integer cents in and out.
 */
export type NetOrderMoney = {
  /** Total less refunds, floored at 0. */
  netTotalCents: number;
  /** The GST component still inside netTotalCents, floored at 0. */
  netTaxCents: number;
  /** What was actually subtracted, after clamping. */
  refundedCents: number;
};

export function netOrderMoney(
  totalCents: number,
  taxCents: number,
  refundedCents: number,
): NetOrderMoney {
  // planRefund enforces that succeeded refunds cannot exceed the total, but
  // this reads aggregated rows rather than enforcing that invariant, so it
  // clamps instead of trusting: a bad row must not produce negative revenue.
  const refunded = Math.min(Math.max(refundedCents, 0), Math.max(totalCents, 0));
  const netTotalCents = Math.max(totalCents - refunded, 0);

  // A zero-total order (fully discounted) has no ratio to apportion by, and no
  // tax to give back either.
  if (totalCents <= 0 || taxCents <= 0) {
    return { netTotalCents, netTaxCents: Math.max(taxCents, 0), refundedCents: refunded };
  }

  // Round the REFUNDED tax and subtract, rather than rounding the remainder.
  // Both are defensible to the cent, but this keeps a full refund landing on
  // exactly 0 tax rather than a stray cent left behind by rounding.
  const refundedTax = Math.round((taxCents * refunded) / totalCents);
  return {
    netTotalCents,
    netTaxCents: Math.max(taxCents - refundedTax, 0),
    refundedCents: refunded,
  };
}
