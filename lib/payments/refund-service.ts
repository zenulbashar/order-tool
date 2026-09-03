import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { isUniqueViolation } from "@/lib/db/errors";
import { PAID_ORDER_STATUSES } from "@/lib/db/order-status";
import { orders, refunds } from "@/lib/db/schema";
import { reportError } from "@/lib/observability";
import { compensateFullyRefundedOrder } from "@/lib/payments/refund-compensation";
import {
  normalizeRefundReason,
  orderStatusForRefunds,
  planRefund,
} from "@/lib/payments/refund";
import { getStripe } from "@/lib/stripe";

/**
 * The refund money path (M4 / audit F3). Ordering here is deliberate and is
 * the whole point of the module:
 *
 *   1. Lock the order row (FOR UPDATE, in a transaction), read its
 *      committed-to-date refunds — succeeded AND still-pending, since money in
 *      flight is money already claimed — and PLAN (pure). Two operators
 *      clicking Refund at once serialise here; without the lock both plans
 *      validated against the same headroom and both reached Stripe under
 *      distinct idempotency keys.
 *   2. Write a `pending` refund row FIRST, in that same transaction. Its id is
 *      the Stripe idempotency key, so a retry of the same click can never
 *      double-refund, and a crash mid-call leaves a durable record to
 *      reconcile instead of silent cash movement.
 *   3. Call Stripe on the CONNECTED account (these are direct charges).
 *   4. Record the outcome. Only Stripe's `succeeded` is recorded as succeeded;
 *      a `pending` refund (bank debits take days, and CAN still fail) stays
 *      pending until `charge.refund.updated` settles it. The order's status is
 *      derived from committed refunds — never from a local guess.
 *   5. Compensate the non-cash effects (gift-card credit, points reversal,
 *      restock) only once the order is fully refunded by money that has
 *      ACTUALLY left. Compensating on a pending refund minted stored value
 *      that nothing clawed back when Stripe later reported the refund failed.
 *
 * Nothing in steps 4–5 can un-move the cash, so their failures are reported
 * and reconciled, never surfaced as "the refund failed" (it didn't).
 */

export type RefundOutcome =
  | {
      ok: true;
      refundId: string;
      amountCents: number;
      orderStatus: "partially_refunded" | "refunded";
    }
  | { ok: false; error: string };

/** Either the pool or a transaction handle — both run the same query shapes. */
type DbExecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Sum of refunds that actually moved money for an order (Stripe: succeeded). */
export async function refundedCentsForOrder(orderId: string): Promise<number> {
  const [row] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${refunds.amountCents}), 0)::int`,
    })
    .from(refunds)
    .where(
      and(eq(refunds.orderId, orderId), eq(refunds.status, "succeeded")),
    );
  return row?.total ?? 0;
}

/**
 * Sum of refunds that have moved money OR are still in flight at Stripe. This
 * is the headroom figure: a refund Stripe reports as `pending` will (almost
 * always) complete, so a second refund must not be planned against the cents
 * it has already claimed.
 */
export async function committedRefundCentsForOrder(
  orderId: string,
  executor: DbExecutor = db,
): Promise<number> {
  const [row] = await executor
    .select({
      committed: sql<number>`COALESCE(SUM(${refunds.amountCents}), 0)::int`,
    })
    .from(refunds)
    .where(
      and(
        eq(refunds.orderId, orderId),
        inArray(refunds.status, ["pending", "succeeded"]),
      ),
    );
  return row?.committed ?? 0;
}

/**
 * Has every cent of the order come back as SETTLED money? Compensation keys
 * off this, not off the order's `refunded` status: the status is (rightly)
 * optimistic about pending refunds, the stored-value ledgers must not be.
 */
async function isFullyRefundedBySettledMoney(orderId: string): Promise<boolean> {
  const [order] = await db
    .select({ totalCents: orders.totalCents })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!order) return false;
  return (await refundedCentsForOrder(orderId)) >= order.totalCents;
}

/**
 * Refund an order, in whole or in part. `venueId` is the CALLER'S venue and
 * is part of the order lookup, so a forged order id from another tenant
 * resolves to nothing rather than moving that venue's money.
 */
export async function refundOrder(input: {
  orderId: string;
  venueId: string;
  actorUserId: string | null;
  /** null/undefined = refund everything still outstanding. */
  amountCents?: number | null;
  reason?: unknown;
  note?: string | null;
}): Promise<RefundOutcome> {
  // (1)+(2) Lock, plan and record in ONE transaction. The row lock is what
  // serialises two concurrent refunds on the same order: the second waits,
  // then plans against headroom that already includes the first's pending row.
  const planned = await db.transaction(async (tx) => {
    const [order] = await tx
      .select({
        id: orders.id,
        status: orders.status,
        totalCents: orders.totalCents,
        paymentIntentId: orders.stripePaymentIntentId,
      })
      .from(orders)
      .where(
        and(eq(orders.id, input.orderId), eq(orders.venueId, input.venueId)),
      )
      .limit(1)
      .for("update");
    if (!order) return { ok: false as const, error: "Order not found." };
    if (!order.paymentIntentId) {
      return {
        ok: false as const,
        error: "This order has no payment to refund.",
      };
    }

    const alreadyRefundedCents = await committedRefundCentsForOrder(order.id, tx);
    const plan = planRefund({
      orderTotalCents: order.totalCents,
      alreadyRefundedCents,
      requestedCents: input.amountCents,
      orderStatus: order.status,
    });
    if (!plan.ok) return { ok: false as const, error: plan.error };

    // Durable record BEFORE any money moves.
    const [pending] = await tx
      .insert(refunds)
      .values({
        venueId: input.venueId,
        orderId: order.id,
        amountCents: plan.amountCents,
        status: "pending",
        reason: normalizeRefundReason(input.reason) ?? null,
        note: input.note?.trim() || null,
        actorUserId: input.actorUserId,
      })
      .returning({ id: refunds.id });
    return {
      ok: true as const,
      // Re-stated so the narrowing above survives the return type.
      order: { ...order, paymentIntentId: order.paymentIntentId },
      plan,
      pending,
    };
  });
  if (!planned.ok) return { ok: false, error: planned.error };
  const { order, plan, pending } = planned;

  // (3) Stripe, on the venue's connected account. The order's PaymentIntent
  // lives there, so the refund must be created there too.
  const venueStripeAccountId = await stripeAccountForVenue(input.venueId);
  if (!venueStripeAccountId) {
    await markRefundFailed(pending.id, "Venue has no connected Stripe account.");
    return { ok: false, error: "This venue is not connected to Stripe." };
  }

  let stripeRefundId: string;
  let stripeStatus: string | null;
  try {
    const refund = await getStripe().refunds.create(
      {
        payment_intent: order.paymentIntentId,
        amount: plan.amountCents,
        ...(normalizeRefundReason(input.reason)
          ? { reason: normalizeRefundReason(input.reason) }
          : {}),
        // Give back the platform's cut in proportion to the refund. Keeping a
        // fee on money the diner got back would leave the venue out of pocket
        // for the platform's benefit.
        refund_application_fee: true,
      },
      {
        stripeAccount: venueStripeAccountId,
        // The pending row's id — a retried submission reuses this exact
        // refund rather than creating a second one.
        idempotencyKey: pending.id,
      },
    );
    stripeRefundId = refund.id;
    stripeStatus = refund.status;
  } catch (error) {
    await markRefundFailed(pending.id, scrubStripeError(error));
    await reportError(error, {
      context: "refund.stripe-create",
      tags: { venue_id: input.venueId },
      extra: { orderId: order.id, refundId: pending.id },
    });
    return {
      ok: false,
      error: "Stripe declined the refund. Nothing was charged back.",
    };
  }

  // (4) Record the outcome. Stripe reports 'pending' for some payment methods
  // (bank debits): the cash will almost always leave, but it has not yet and
  // a pending refund CAN still fail. It is recorded as pending — it counts
  // toward headroom and the order's refund status, and `charge.refund.updated`
  // promotes it (and triggers compensation) once Stripe says succeeded. Only
  // 'failed'/'canceled' mean no money moved.
  const settled: "pending" | "succeeded" | "failed" | "canceled" =
    stripeStatus === "failed" || stripeStatus === "canceled"
      ? stripeStatus
      : stripeStatus === "succeeded"
        ? "succeeded"
        : "pending";
  // Stamping the Stripe id onto our pending row can COLLIDE. `stripe_refund_id`
  // carries a partial unique index, and `charge.refunded` for this very refund
  // may land between refunds.create() returning and this UPDATE, inserting a
  // row that already claims the id.
  //
  // Left to throw, that 23505 was expensive out of all proportion to its
  // rarity. The action reported a refund that HAD moved money as failed, wrote
  // no venue_audit row, and orphaned the pending row forever. Worse, on a
  // PARTIAL refund the operator retries — and the retry is not blocked, because
  // planRefund only checks headroom: the webhook's row makes alreadyRefunded
  // $10 of a $55 order, leaving $45 remaining, so a second $10 refund passes
  // validation and creates a second REAL Stripe refund under a fresh
  // idempotency key. The diner is refunded twice.
  //
  // So the conflict is handled as what it actually is: the webhook already
  // recorded this exact refund. Adopt its row — giving it the actor, reason and
  // note it could not know — and drop our duplicate. The money moved once and
  // the caller is told it succeeded, because it did.
  try {
    await db
      .update(refunds)
      .set({ status: settled, stripeRefundId, updatedAt: new Date() })
      .where(eq(refunds.id, pending.id));
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    await db.transaction(async (tx) => {
      await tx
        .update(refunds)
        .set({
          actorUserId: input.actorUserId,
          reason: normalizeRefundReason(input.reason) ?? null,
          note: input.note?.trim() || null,
          updatedAt: new Date(),
        })
        .where(eq(refunds.stripeRefundId, stripeRefundId));
      // Never became a distinct refund — it IS the row the webhook inserted.
      // Leaving it as `pending` would strand it; leaving it `canceled` would
      // imply a second attempt that failed, which did not happen.
      await tx.delete(refunds).where(eq(refunds.id, pending.id));
    });
  }

  if (settled === "failed" || settled === "canceled") {
    return {
      ok: false,
      error: "Stripe could not complete the refund. Nothing was charged back.",
    };
  }

  const orderStatus = await syncOrderRefundStatus(order.id);

  // (5) Non-cash compensation, only once the order is fully refunded by
  // money that has actually settled (a pending refund defers this to the
  // webhook that settles it).
  if (orderStatus === "refunded" && (await isFullyRefundedBySettledMoney(order.id))) {
    try {
      await compensateFullyRefundedOrder(order.id);
    } catch (error) {
      // The cash HAS moved; a compensation failure must not report a failed
      // refund. Reported for reconciliation instead.
      await reportError(error, {
        context: "refund.compensation",
        tags: { venue_id: input.venueId },
        extra: { orderId: order.id, refundId: pending.id },
      });
    }
  }

  return {
    ok: true,
    refundId: pending.id,
    amountCents: plan.amountCents,
    orderStatus: orderStatus === "refunded" ? "refunded" : "partially_refunded",
  };
}

/**
 * Reconcile a PaymentIntent's refunds from Stripe (M4 / audit F3) — the
 * answer to "a merchant's only real option is the Stripe Dashboard, which
 * leaves the platform record inconsistent with the actual money movement".
 *
 * Driven by the `charge.refunded` / `charge.refund.updated` webhooks, it
 * lists the authoritative refunds on the connected account and inserts any
 * this platform has no row for. Refunds issued from the Stripe Dashboard
 * therefore land in the order record, flip its status, and trigger the same
 * loyalty/gift-card/stock compensation as an in-product refund.
 *
 * Idempotent twice over: the unique `stripe_refund_id` index absorbs replays,
 * and compensation is independently idempotent.
 */
export async function reconcileRefundsForPaymentIntent(
  paymentIntentId: string,
  stripeAccount?: string,
): Promise<number> {
  const [order] = await db
    .select({ id: orders.id, venueId: orders.venueId })
    .from(orders)
    .where(eq(orders.stripePaymentIntentId, paymentIntentId))
    .limit(1);
  if (!order) return 0;

  const account = stripeAccount ?? (await stripeAccountForVenue(order.venueId));
  if (!account) return 0;

  const list = await getStripe().refunds.list(
    { payment_intent: paymentIntentId, limit: 100 },
    { stripeAccount: account },
  );

  let inserted = 0;
  for (const refund of list.data) {
    // A refund Stripe now reports as failed/canceled must be DEMOTED, not
    // skipped. refundOrder optimistically records every non-terminal Stripe
    // status ('pending', 'requires_action') as 'succeeded' and immediately
    // drives the order status and the compensation off it. `charge.refund.updated`
    // exists precisely to carry the later transition, and skipping here made it
    // a no-op for pending -> failed: the order stayed 'refunded', the customer's
    // gift-card value stayed restored, and the venue believed it had returned
    // money it still held.
    if (refund.status === "failed" || refund.status === "canceled") {
      await db
        .update(refunds)
        .set({
          status: "failed",
          lastError: `Stripe reported the refund ${refund.status}.`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(refunds.stripeRefundId, refund.id),
            // Only demote a row we currently count. Without this a redelivery
            // would keep rewriting an already-failed row's timestamp.
            inArray(refunds.status, ["pending", "succeeded"]),
          ),
        );
      continue;
    }
    // Mirror Stripe's settlement, not an optimistic guess: a refund Stripe
    // still reports as pending is recorded pending.
    const settled = refund.status === "succeeded" ? "succeeded" : "pending";
    const rows = await db
      .insert(refunds)
      .values({
        venueId: order.venueId,
        orderId: order.id,
        amountCents: refund.amount,
        status: settled,
        reason: normalizeRefundReason(refund.reason) ?? null,
        // No actor: nobody clicked a button in this product.
        actorUserId: null,
        stripeRefundId: refund.id,
        note: "Reconciled from Stripe",
      })
      .onConflictDoNothing()
      .returning({ id: refunds.id });
    inserted += rows.length;
    if (rows.length === 0 && settled === "succeeded") {
      // The row already exists (ours, or an earlier reconcile) and Stripe now
      // says the money has left: promote it. This is the pending -> succeeded
      // transition `charge.refund.updated` exists to deliver.
      await db
        .update(refunds)
        .set({ status: "succeeded", updatedAt: new Date() })
        .where(
          and(
            eq(refunds.stripeRefundId, refund.id),
            eq(refunds.status, "pending"),
          ),
        );
    }
  }

  const status = await syncOrderRefundStatus(order.id);
  if (status === "refunded" && (await isFullyRefundedBySettledMoney(order.id))) {
    try {
      await compensateFullyRefundedOrder(order.id);
    } catch (error) {
      await reportError(error, {
        context: "refund.compensation",
        tags: { venue_id: order.venueId },
        extra: { orderId: order.id, source: "reconcile" },
      });
    }
  }
  return inserted;
}

/**
 * Recompute an order's payment status from its succeeded refunds. The single
 * writer of the refunded statuses, shared by the action and the webhook, so
 * the derived value can never disagree with the ledger.
 */
export async function syncOrderRefundStatus(
  orderId: string,
): Promise<"confirmed" | "partially_refunded" | "refunded"> {
  const [order] = await db
    .select({ totalCents: orders.totalCents, status: orders.status })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!order) return "confirmed";

  // Only an order that TOOK money can be moved into a refunded state. Refund
  // reconciliation resolves the order by PaymentIntent with no status filter, so
  // without this an order that was charged but never confirmed could be promoted
  // straight from 'payment_failed' to 'refunded' — which then triggers the
  // compensation arm and credits value that was never debited.
  if (!(PAID_ORDER_STATUSES as readonly string[]).includes(order.status)) {
    await reportError(
      new Error("Refund reconciled against an order that never took money."),
      {
        context: "refund.sync-status",
        extra: { orderId, status: order.status },
      },
    );
    return "confirmed";
  }

  // Committed = succeeded + pending. The status is deliberately optimistic
  // about a pending refund (the diner has been told, the kitchen should stop),
  // while compensation waits for settlement — see isFullyRefundedBySettledMoney.
  const refunded = await committedRefundCentsForOrder(orderId);
  const status = orderStatusForRefunds(order.totalCents, refunded);
  await db
    .update(orders)
    .set({ status })
    .where(
      and(
        eq(orders.id, orderId),
        // Re-checked in the WHERE so a concurrent transition cannot be
        // overwritten between the read above and this write.
        inArray(orders.status, PAID_ORDER_STATUSES),
      ),
    );
  return status;
}

async function stripeAccountForVenue(venueId: string): Promise<string | null> {
  const { venues } = await import("@/lib/db/schema");
  const [venue] = await db
    .select({ stripeAccountId: venues.stripeAccountId })
    .from(venues)
    .where(eq(venues.id, venueId))
    .limit(1);
  return venue?.stripeAccountId ?? null;
}

async function markRefundFailed(
  refundId: string,
  message: string,
): Promise<void> {
  await db
    .update(refunds)
    .set({ status: "failed", lastError: message, updatedAt: new Date() })
    .where(eq(refunds.id, refundId));
}

/** Message text only — no stacks, no payloads, nothing token-shaped. */
function scrubStripeError(error: unknown): string {
  const message =
    error instanceof Error ? error.message : "Unknown refund error.";
  return message.replace(/[A-Za-z0-9_\-.]{40,}/g, "…").slice(0, 300);
}
