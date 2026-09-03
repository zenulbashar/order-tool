import "server-only";

import type Stripe from "stripe";

import { reportBankDiscountMismatch } from "@/lib/observability";
import { BANK_METHODS } from "@/lib/payments/bank-discount";
import { getStripe } from "@/lib/stripe";

/** Metadata key applyOrderDiscounts stamps on the PaymentIntent. */
export const BANK_DISCOUNT_METADATA_KEY = "bank_discount_cents";

/** The pay-by-bank saving recorded on a PaymentIntent, or 0. Pure. */
export function bankDiscountCentsFromIntent(
  intent: Pick<Stripe.PaymentIntent, "metadata">,
): number {
  const raw = intent.metadata?.[BANK_DISCOUNT_METADATA_KEY];
  const cents = raw ? Number(raw) : 0;
  return Number.isInteger(cents) && cents > 0 ? cents : 0;
}

/**
 * After a bank-discounted order confirms, check what actually paid for it.
 * One charge retrieve on the connected account (direct charges live there),
 * only for orders that carried the saving. Reports; never throws.
 */
export async function checkBankDiscountSettlement(input: {
  orderId: string;
  intent: Pick<Stripe.PaymentIntent, "id" | "metadata" | "latest_charge">;
  stripeAccount: string | undefined;
}): Promise<void> {
  const bankDiscountCents = bankDiscountCentsFromIntent(input.intent);
  if (bankDiscountCents === 0) return;
  const chargeId =
    typeof input.intent.latest_charge === "string"
      ? input.intent.latest_charge
      : input.intent.latest_charge?.id ?? null;
  let paymentMethodType: string | null = null;
  if (chargeId) {
    const charge = await getStripe().charges.retrieve(
      chargeId,
      {},
      input.stripeAccount ? { stripeAccount: input.stripeAccount } : {},
    );
    paymentMethodType = charge.payment_method_details?.type ?? null;
  }
  await reportBankDiscountMismatch({
    orderId: input.orderId,
    paymentIntentId: input.intent.id,
    bankDiscountCents,
    paymentMethodType,
    bankMethods: BANK_METHODS,
  });
}
