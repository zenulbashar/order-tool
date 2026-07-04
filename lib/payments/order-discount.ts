import { MIN_TOTAL_CENTS } from "./bank-discount";

/**
 * The ONE order-discount composition (Track E2d). Both a platform promotion and
 * the pay-by-bank saving are combined HERE and clamped ONCE — never each on its
 * own — so they can never sum past the subtotal or push the payable total below
 * Stripe's minimum charge. The split is deterministic: the promotion applies
 * first (it is unconditional), then the bank saving fills whatever room is left.
 * This is why `orders.promo_discount_cents` is persisted separately — the
 * combined `discount_cents` alone can't say how much was promo vs bank.
 *
 * Pure — no I/O, no deps — so the exact same math runs server-side (the
 * authoritative apply) and could be shown client-side.
 */
export function promoDiscountRawCents(
  subtotalCents: number,
  type: "percent" | "amount",
  value: number,
): number {
  if (subtotalCents <= 0 || value <= 0) return 0;
  return type === "percent"
    ? Math.round((subtotalCents * value) / 100)
    : value;
}

export function composeOrderDiscount({
  subtotalCents,
  promoRaw,
  bankRaw,
}: {
  subtotalCents: number;
  promoRaw: number;
  bankRaw: number;
}): { discountCents: number; promoDiscountCents: number; totalCents: number } {
  const maxDiscount = Math.max(0, subtotalCents - MIN_TOTAL_CENTS);
  const promoDiscountCents = Math.max(0, Math.min(promoRaw, maxDiscount));
  const bankDiscount = Math.max(
    0,
    Math.min(bankRaw, maxDiscount - promoDiscountCents),
  );
  const discountCents = promoDiscountCents + bankDiscount;
  return { discountCents, promoDiscountCents, totalCents: subtotalCents - discountCents };
}
