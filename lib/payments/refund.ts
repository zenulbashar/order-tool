/**
 * Refund policy (M4 / audit F3) — pure decisions, no database and no Stripe,
 * so the money rules are unit-testable in isolation.
 *
 * The invariants this file exists to hold:
 *  - You can never refund more cash than the order actually charged, across
 *    ANY number of partial refunds.
 *  - The order's refund state is DERIVED from the sum of succeeded refunds,
 *    so the two can never drift apart.
 *  - Only a PAID order can be refunded. `cancelled` and `payment_failed`
 *    orders never took money; refunding them would move cash that was never
 *    collected.
 */

/** Statuses a refund may be requested from — i.e. money was actually taken. */
export const REFUNDABLE_ORDER_STATUSES = [
  "confirmed",
  "partially_refunded",
] as const;

export type RefundableOrderStatus = (typeof REFUNDABLE_ORDER_STATUSES)[number];

/** The order's refund-derived payment status. */
export type RefundedOrderStatus =
  | "confirmed"
  | "partially_refunded"
  | "refunded";

export type RefundPlanInput = {
  /** What the card was actually charged — orders.total_cents. */
  orderTotalCents: number;
  /** Sum of already-SUCCEEDED refunds on this order. */
  alreadyRefundedCents: number;
  /** Requested amount, or null/undefined to mean "the rest of it". */
  requestedCents?: number | null;
  orderStatus: string;
};

export type RefundPlan =
  | {
      ok: true;
      /** Amount to send to Stripe. */
      amountCents: number;
      /** What the order's status becomes once this refund succeeds. */
      nextOrderStatus: Exclude<RefundedOrderStatus, "confirmed">;
      /** True when this refund takes the order to fully refunded. */
      isFullRefund: boolean;
    }
  | { ok: false; error: string };

/** Cash still refundable on an order. Never negative. */
export function remainingRefundableCents(
  orderTotalCents: number,
  alreadyRefundedCents: number,
): number {
  return Math.max(0, orderTotalCents - alreadyRefundedCents);
}

/**
 * Decide whether a refund request is allowed and what it does to the order.
 * A missing/blank amount means "refund everything still outstanding", which
 * is the overwhelmingly common merchant intent and avoids a rounding
 * mismatch when the UI would otherwise have to compute the remainder itself.
 */
export function planRefund(input: RefundPlanInput): RefundPlan {
  const { orderTotalCents, alreadyRefundedCents, orderStatus } = input;

  if (
    !REFUNDABLE_ORDER_STATUSES.includes(orderStatus as RefundableOrderStatus)
  ) {
    return {
      ok: false,
      error:
        orderStatus === "refunded"
          ? "This order is already fully refunded."
          : "Only a paid order can be refunded.",
    };
  }

  const remaining = remainingRefundableCents(
    orderTotalCents,
    alreadyRefundedCents,
  );
  if (remaining <= 0) {
    return { ok: false, error: "This order is already fully refunded." };
  }

  const requested = input.requestedCents ?? remaining;
  if (!Number.isInteger(requested)) {
    return { ok: false, error: "Enter a refund amount in whole cents." };
  }
  if (requested <= 0) {
    return { ok: false, error: "Enter a refund amount greater than zero." };
  }
  if (requested > remaining) {
    return {
      ok: false,
      error: `You can refund at most ${formatCents(remaining)} on this order.`,
    };
  }

  const isFullRefund = requested === remaining;
  return {
    ok: true,
    amountCents: requested,
    nextOrderStatus: isFullRefund ? "refunded" : "partially_refunded",
    isFullRefund,
  };
}

/**
 * The order status implied by refunds to date. The single place this mapping
 * lives, so the action, the webhook, and any backfill agree by construction.
 */
export function orderStatusForRefunds(
  orderTotalCents: number,
  refundedCents: number,
): RefundedOrderStatus {
  if (refundedCents <= 0) return "confirmed";
  if (refundedCents >= orderTotalCents) return "refunded";
  return "partially_refunded";
}

/** "$12.34" — used in operator-facing validation messages only. */
function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Stripe's refund `reason` vocabulary. Anything else is dropped rather than
 * passed through, so a hostile or stale client value can never reach Stripe.
 */
export const STRIPE_REFUND_REASONS = [
  "requested_by_customer",
  "duplicate",
  "fraudulent",
] as const;

export type StripeRefundReason = (typeof STRIPE_REFUND_REASONS)[number];

export function normalizeRefundReason(
  value: unknown,
): StripeRefundReason | undefined {
  return STRIPE_REFUND_REASONS.includes(value as StripeRefundReason)
    ? (value as StripeRefundReason)
    : undefined;
}
