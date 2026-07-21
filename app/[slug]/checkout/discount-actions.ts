"use server";

import { and, eq, ne, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { giftCards, orders, venues } from "@/lib/db/schema";
import {
  getAvailableGiftCardCents,
  resolveGiftCardForRedemption,
} from "@/lib/giftcards/queries";
import { getAvailablePoints } from "@/lib/loyalty/balance";
import {
  BANK_METHODS,
  MIN_TOTAL_CENTS,
  bankDiscountCents,
} from "@/lib/payments/bank-discount";
import { composeOrderDiscount } from "@/lib/payments/order-discount";
import { inclusiveTaxCents } from "@/lib/payments/tax";
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
      // Loyalty points cash value redeemed on this order (0 when not redeeming).
      pointsDiscountCents: number;
      // Points actually consumed for that value (0 when not redeeming).
      pointsRedeemed: number;
      // Gift-card cash value redeemed on this order (0 when no card applies).
      giftCardDiscountCents: number;
      // True when a gift-card code was entered AND put value toward the order
      // (so the checkout can confirm "applied" vs report an invalid/empty card).
      giftCardApplied: boolean;
      // True only when a diner-entered CODE selected the applied promo (so the
      // checkout can confirm "code applied" vs an auto promo). An invalid code
      // leaves this false while any auto discount still applies.
      codeApplied: boolean;
    }
  | { ok: false };

export async function applyOrderDiscounts(
  slug: string,
  token: string,
  method: string,
  code?: string,
  redeemPoints?: boolean,
  giftCardCode?: string,
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
      loyaltyEnabled: venues.loyaltyEnabled,
      loyaltyRedeemValueCents: venues.loyaltyRedeemValueCents,
      loyaltyMinRedeemPoints: venues.loyaltyMinRedeemPoints,
      taxEnabled: venues.taxEnabled,
      taxRateBps: venues.taxRateBps,
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
    code,
  );
  const promoRaw = promo?.raw ?? 0;
  const bankRaw =
    BANK_METHODS.has(method) && venue.paytoEnabled
      ? bankDiscountCents(pre.subtotalCents, venue.mode, venue.value)
      : 0;
  const {
    discountCents: baseDiscount,
    promoDiscountCents,
    totalCents: baseTotal,
  } = composeOrderDiscount({
    subtotalCents: pre.subtotalCents,
    promoRaw,
    bankRaw,
  });

  // Loyalty redemption fills whatever discount room promo + bank leave. Kept
  // OUTSIDE composeOrderDiscount so that proven promo/bank clamp is untouched:
  // points are bounded by the room left (maxDiscount − promo − bank), so the
  // combined discount can never exceed the subtotal or push the charge below
  // Stripe's minimum. Server-authoritative — the client only asks to redeem;
  // the amount is derived from the customer's available balance (net of points
  // reserved on their other pending orders) in whole points × the point value.
  let pointsRedeemed = 0;
  let pointsDiscountCents = 0;
  if (redeemPoints && venue.loyaltyEnabled && pre.customerId) {
    const redeemValue =
      venue.loyaltyRedeemValueCents > 0 ? venue.loyaltyRedeemValueCents : 1;
    const available = await getAvailablePoints(
      venue.id,
      pre.customerId,
      pre.id,
    );
    const roomLeft = Math.max(
      0,
      pre.subtotalCents - MIN_TOTAL_CENTS - baseDiscount,
    );
    const candidate = Math.min(available, Math.floor(roomLeft / redeemValue));
    // All-or-nothing above the venue's minimum: redeem as many points as fit.
    if (candidate >= Math.max(1, venue.loyaltyMinRedeemPoints)) {
      pointsRedeemed = candidate;
      pointsDiscountCents = pointsRedeemed * redeemValue;
    }
  }

  // Gift card fills whatever room is left after promo + bank + points (the
  // customer paying down the remainder with their own stored value). Cents-
  // denominated, so no rounding — just bounded by the room left, which keeps the
  // charge ≥ Stripe's minimum. A gift card can therefore cover all-but-MIN of an
  // order, never reduce the PI to $0 (documented v1 limit).
  let giftCardId: string | null = null;
  let giftCardRedeemedCents = 0;
  if (giftCardCode && giftCardCode.trim()) {
    const card = await resolveGiftCardForRedemption(venue.id, giftCardCode);
    if (card) {
      const available = await getAvailableGiftCardCents(
        card.id,
        card.balanceCents,
        pre.id,
      );
      const roomLeft = Math.max(
        0,
        pre.subtotalCents - MIN_TOTAL_CENTS - baseDiscount - pointsDiscountCents,
      );
      const redeem = Math.min(available, roomLeft);
      if (redeem > 0) {
        giftCardId = card.id;
        giftCardRedeemedCents = redeem;
      }
    }
  }

  // giftCardId / giftCardRedeemedCents above are the amount the customer
  // REQUESTED, derived from an UNLOCKED availability read. The authoritative
  // redemption — and therefore the final discount/total/tax — is recomputed under
  // a gift-card row lock INSIDE the transaction below, so two orders can't both
  // reserve the same balance (double-spend of a bearer instrument).
  const appliedPromoId = promoDiscountCents > 0 ? promo?.id ?? null : null;
  // The platform's co-funded share of the (post-clamp) promo discount — a
  // tracked liability, settled out of band. Does not change the charge or fee.
  const platformFundedCents =
    appliedPromoId && promo
      ? Math.round((promoDiscountCents * promo.platformFundedPercent) / 100)
      : 0;
  // The code "took" only if a diner-entered code selected the promo AND it
  // survived the clamp — reported so the checkout can confirm/deny the code.
  const codeApplied = promo?.viaCode === true && promoDiscountCents > 0;

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
          pointsDiscountCents: orders.pointsDiscountCents,
          pointsRedeemed: orders.pointsRedeemed,
          giftCardId: orders.giftCardId,
          giftCardRedeemedCents: orders.giftCardRedeemedCents,
          appliedPromoId: orders.appliedPromoId,
        })
        .from(orders)
        .where(and(eq(orders.id, pre.id), eq(orders.venueId, venue.id)))
        .for("update")
        .limit(1);
      if (!locked || locked.status !== "pending_payment" || !locked.pi) return;

      // Re-derive the gift-card redemption UNDER a row lock so two orders can't
      // both reserve the same balance (a bearer instrument; the order-row lock
      // above doesn't cover the card). The pre-tx availability read is unlocked
      // and optimistic — clamp the requested amount to what's actually free now.
      // Lock order is orders → giftCards here and giftCardLedger → giftCards on
      // the confirm/debit path, so there is no cross-path lock cycle.
      let finalGiftCardId = giftCardId;
      let finalGiftCardCents = giftCardRedeemedCents;
      if (giftCardId) {
        const [card] = await tx
          .select({
            balanceCents: giftCards.balanceCents,
            status: giftCards.status,
          })
          .from(giftCards)
          .where(eq(giftCards.id, giftCardId))
          .for("update")
          .limit(1);
        if (!card || card.status !== "active") {
          finalGiftCardId = null;
          finalGiftCardCents = 0;
        } else {
          const [reservedRow] = await tx
            .select({
              reserved: sql<number>`coalesce(sum(${orders.giftCardRedeemedCents}), 0)`,
            })
            .from(orders)
            .where(
              and(
                eq(orders.giftCardId, giftCardId),
                eq(orders.status, "pending_payment"),
                ne(orders.id, locked.id),
              ),
            );
          const available = Math.max(
            0,
            card.balanceCents - Number(reservedRow?.reserved ?? 0),
          );
          finalGiftCardCents = Math.min(giftCardRedeemedCents, available);
          if (finalGiftCardCents <= 0) {
            finalGiftCardId = null;
            finalGiftCardCents = 0;
          }
        }
      }

      // Finals composed from the locked gift-card amount. promo + bank + points
      // were clamped upstream and are unaffected by the card. Reducing the card
      // redemption only ever RAISES the charge, so the total stays ≥ Stripe's
      // minimum. taxCents (inclusive) re-snapshots off the final total.
      const finalDiscountCents =
        baseDiscount + pointsDiscountCents + finalGiftCardCents;
      const finalTotalCents = baseTotal - pointsDiscountCents - finalGiftCardCents;
      const finalTaxCents = venue.taxEnabled
        ? inclusiveTaxCents(finalTotalCents, venue.taxRateBps)
        : 0;

      const successResult: ApplyDiscountResult = {
        ok: true,
        totalCents: finalTotalCents,
        discountCents: finalDiscountCents,
        promoDiscountCents,
        pointsDiscountCents,
        pointsRedeemed,
        giftCardDiscountCents: finalGiftCardCents,
        giftCardApplied: finalGiftCardCents > 0,
        codeApplied,
      };

      // No-op guard keyed off the FULL target (not a single scalar), so an equal
      // combined discount with a different composition still applies correctly.
      if (
        locked.totalCents === finalTotalCents &&
        locked.discountCents === finalDiscountCents &&
        locked.promoDiscountCents === promoDiscountCents &&
        locked.pointsDiscountCents === pointsDiscountCents &&
        locked.pointsRedeemed === pointsRedeemed &&
        (locked.giftCardId ?? null) === finalGiftCardId &&
        locked.giftCardRedeemedCents === finalGiftCardCents &&
        (locked.appliedPromoId ?? null) === appliedPromoId
      ) {
        result = successResult;
        return;
      }

      // DB first, PI last — a Stripe failure rolls the whole transaction back so
      // the PI and the order can't disagree.
      await tx
        .update(orders)
        .set({
          totalCents: finalTotalCents,
          taxCents: finalTaxCents,
          discountCents: finalDiscountCents,
          promoDiscountCents,
          pointsDiscountCents,
          pointsRedeemed,
          giftCardId: finalGiftCardId,
          giftCardRedeemedCents: finalGiftCardCents,
          appliedPromoId,
          platformFundedCents,
        })
        .where(and(eq(orders.id, locked.id), eq(orders.status, "pending_payment")));

      await getStripe().paymentIntents.update(
        locked.pi,
        {
          amount: finalTotalCents,
          application_fee_amount: computeApplicationFeeCents(finalTotalCents),
        },
        {
          stripeAccount: venue.stripeAccountId!,
          idempotencyKey: `${locked.id}-disc-${finalTotalCents}`,
        },
      );

      result = successResult;
    });
  } catch {
    return { ok: false };
  }

  return result;
}
