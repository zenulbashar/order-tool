"use server";

import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { orders, venues } from "@/lib/db/schema";
import { BANK_METHODS, bankDiscountCents } from "@/lib/payments/bank-discount";
import { composeOrderDiscount } from "@/lib/payments/order-discount";
import { resolveActivePromo } from "@/lib/promotions";
import { computeApplicationFeeCents, getStripe } from "@/lib/stripe";

/**
 * The SINGLE order-discount apply (Track B · 3b-ii + Track E2d). Recomputes an
 * order's discount from the two sources — an active platform PROMOTION (always)
 * and the pay-by-bank SAVING (only when a bank method is selected) — composes
 * them into one clamped total, updates the PaymentIntent, and records the
 * breakdown. Called from the payment step: once on mount (so a promo applies
 * automatically) and again on every method change (so the bank saving follows).
 * Both triggers route through here, so the two discounts STACK instead of
 * clobbering each other.
 *
 * This is the only new diner money-path write in the program — `placeOrder` and
 * the Stripe webhook stay byte-for-byte unchanged.
 *
 * Safety:
 *  - SERVER-AUTHORITATIVE: both discounts are recomputed from the order's STORED
 *    subtotal; the client only names the selected method. It can never set an
 *    amount.
 *  - SERIALIZED: the order row is locked FOR UPDATE for the duration, so two
 *    concurrent applies (mount + method-change) can't race the PaymentIntent and
 *    the DB into disagreement. The DB is written first and the PI update is last
 *    inside the same transaction, so a Stripe failure rolls the DB back — PI and
 *    DB never diverge on the common failure paths.
 *  - IDEMPOTENT: the PI update carries an idempotency key keyed to the target
 *    amount, so a retry to the same amount replays rather than double-applies.
 *  - CLAMPED ONCE: composeOrderDiscount sums promo + bank then clamps to
 *    [0, subtotal − Stripe minimum]; neither can ever produce a negative or
 *    sub-minimum charge, and it is never a surcharge.
 *  - The webhook still confirms by PI id and charges exactly what the PI holds.
 */
export type ApplyDiscountResult =
  | {
      ok: true;
      totalCents: number;
      discountCents: number;
      promoDiscountCents: number;
    }
  | { ok: false };

export async function applyOrderDiscounts(
  slug: string,
  token: string,
  method: string,
): Promise<ApplyDiscountResult> {
  const trimmedToken = token.trim();
  if (!trimmedToken) return { ok: false };

  const [venue] = await db
    .select({
      id: venues.id,
      stripeAccountId: venues.stripeAccountId,
      paytoEnabled: venues.paytoEnabled,
      mode: venues.paytoDiscountMode,
      value: venues.paytoDiscountValue,
    })
    .from(venues)
    .where(eq(venues.slug, slug))
    .limit(1);
  if (!venue || !venue.stripeAccountId) return { ok: false };

  // Subtotal is immutable after creation, so resolve the promo + bank raw
  // discounts from the first read; the transaction below re-locks for the
  // authoritative state + write.
  const [pre] = await db
    .select({
      id: orders.id,
      subtotalCents: orders.subtotalCents,
      status: orders.status,
      pi: orders.stripePaymentIntentId,
      customerId: orders.customerId,
    })
    .from(orders)
    .where(
      and(eq(orders.publicToken, trimmedToken), eq(orders.venueId, venue.id)),
    )
    .limit(1);
  if (!pre || pre.status !== "pending_payment" || !pre.pi) return { ok: false };

  const promo = await resolveActivePromo(
    venue.id,
    pre.subtotalCents,
    pre.customerId,
  );
  const promoRaw = promo?.raw ?? 0;
  const bankRaw =
    BANK_METHODS.has(method) && venue.paytoEnabled
      ? bankDiscountCents(pre.subtotalCents, venue.mode, venue.value)
      : 0;
  const { discountCents, promoDiscountCents, totalCents } = composeOrderDiscount({
    subtotalCents: pre.subtotalCents,
    promoRaw,
    bankRaw,
  });
  const appliedPromoId = promoDiscountCents > 0 ? promo?.id ?? null : null;
  // The platform's co-funded share of the (post-clamp) promo discount — a
  // tracked liability, settled out of band. Does not change the charge or fee.
  const platformFundedCents =
    appliedPromoId && promo
      ? Math.round((promoDiscountCents * promo.platformFundedPercent) / 100)
      : 0;

  let result: ApplyDiscountResult = { ok: false };
  try {
    await db.transaction(async (tx) => {
      // Lock the order row — serializes concurrent applies on THIS order.
      const [locked] = await tx
        .select({
          id: orders.id,
          status: orders.status,
          pi: orders.stripePaymentIntentId,
          totalCents: orders.totalCents,
          discountCents: orders.discountCents,
          promoDiscountCents: orders.promoDiscountCents,
          appliedPromoId: orders.appliedPromoId,
        })
        .from(orders)
        .where(and(eq(orders.id, pre.id), eq(orders.venueId, venue.id)))
        .for("update")
        .limit(1);
      if (!locked || locked.status !== "pending_payment" || !locked.pi) return;

      // No-op guard keyed off the FULL target (not a single scalar), so an equal
      // combined discount with a different composition still applies correctly.
      if (
        locked.totalCents === totalCents &&
        locked.discountCents === discountCents &&
        locked.promoDiscountCents === promoDiscountCents &&
        (locked.appliedPromoId ?? null) === appliedPromoId
      ) {
        result = { ok: true, totalCents, discountCents, promoDiscountCents };
        return;
      }

      // DB first, PI last — a Stripe failure rolls the whole transaction back so
      // the PI and the order can't disagree.
      await tx
        .update(orders)
        .set({
          totalCents,
          discountCents,
          promoDiscountCents,
          appliedPromoId,
          platformFundedCents,
        })
        .where(and(eq(orders.id, locked.id), eq(orders.status, "pending_payment")));

      await getStripe().paymentIntents.update(
        locked.pi,
        {
          amount: totalCents,
          application_fee_amount: computeApplicationFeeCents(totalCents),
        },
        {
          stripeAccount: venue.stripeAccountId!,
          idempotencyKey: `${locked.id}-disc-${totalCents}`,
        },
      );

      result = { ok: true, totalCents, discountCents, promoDiscountCents };
    });
  } catch {
    return { ok: false };
  }

  return result;
}
