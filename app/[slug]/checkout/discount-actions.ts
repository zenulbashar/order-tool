"use server";

import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { orders, venues } from "@/lib/db/schema";
import { BANK_METHODS, bankDiscountCents } from "@/lib/payments/bank-discount";
import { computeApplicationFeeCents, getStripe } from "@/lib/stripe";

/**
 * Apply (or revert) the pay-by-bank saving on a pending order when the customer
 * changes payment method at checkout (Track B · 3b-ii). This is the ONLY new
 * money-path write in the program — `placeOrder` and the Stripe webhook are
 * untouched. It is deliberately isolated in its own module so the checkout
 * `actions.ts` (placeOrder) stays byte-for-byte.
 *
 * Safety properties:
 *  - SERVER-AUTHORITATIVE: the discount is recomputed from the order's STORED
 *    subtotal + the venue's configured mode/value — the client never supplies an
 *    amount. A forged method just toggles between subtotal and subtotal−discount.
 *  - VENUE + TOKEN SCOPED: resolved by the opaque public_token AND venue (the
 *    same capability the order page uses); pending_payment only.
 *  - ORDER: Stripe PI update FIRST (a succeeded/confirmed PI rejects the update,
 *    so we never lower an order's recorded total after it's paid), then the DB
 *    write guarded on status='pending_payment'.
 *  - The webhook still confirms by PI id and charges the PI's server amount, so
 *    the customer is always charged exactly what the PI holds.
 *
 * Known, accepted v1 limitation: a customer could request the discount (method
 * = payto) then confirm with a card, saving the fee difference. That is a small
 * venue-side revenue leak (never customer harm, never a surcharge) and matches
 * the intrinsic risk of any method-based discount; reconciling it would require
 * touching the webhook, which we keep byte-for-byte.
 */
export type ApplyDiscountResult =
  | { ok: true; totalCents: number; discountCents: number }
  | { ok: false };

export async function applyBankDiscount(
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

  const [order] = await db
    .select({
      id: orders.id,
      subtotalCents: orders.subtotalCents,
      totalCents: orders.totalCents,
      discountCents: orders.discountCents,
      pi: orders.stripePaymentIntentId,
      status: orders.status,
    })
    .from(orders)
    .where(
      and(eq(orders.publicToken, trimmedToken), eq(orders.venueId, venue.id)),
    )
    .limit(1);
  if (!order || order.status !== "pending_payment" || !order.pi) {
    return { ok: false };
  }

  // Server-authoritative recompute from the STORED subtotal. Offered only when
  // PayTo is on, a discount is configured, and the chosen method is a bank one.
  const discount =
    BANK_METHODS.has(method) && venue.paytoEnabled
      ? bankDiscountCents(order.subtotalCents, venue.mode, venue.value)
      : 0;
  const newTotal = order.subtotalCents - discount;

  // Nothing to change — avoid a needless Stripe round-trip on re-selection.
  if (discount === order.discountCents && newTotal === order.totalCents) {
    return { ok: true, totalCents: newTotal, discountCents: discount };
  }

  // Update the PaymentIntent on the connected account: the server-recomputed
  // amount + a re-derived application fee (fee ≤ amount always holds). If the PI
  // is no longer updatable (already confirmed/processing), Stripe throws → we
  // leave the order untouched.
  try {
    await getStripe().paymentIntents.update(
      order.pi,
      {
        amount: newTotal,
        application_fee_amount: computeApplicationFeeCents(newTotal),
      },
      { stripeAccount: venue.stripeAccountId },
    );
  } catch {
    return { ok: false };
  }

  await db
    .update(orders)
    .set({ totalCents: newTotal, discountCents: discount })
    .where(
      and(eq(orders.id, order.id), eq(orders.status, "pending_payment")),
    );

  return { ok: true, totalCents: newTotal, discountCents: discount };
}
