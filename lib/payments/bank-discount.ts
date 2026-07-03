export type PaytoDiscountMode = "off" | "flat" | "percent";

/** Async bank methods eligible for the pay-by-bank saving. */
export const BANK_METHODS = new Set(["payto", "au_becs_debit"]);

/** Stripe's AUD minimum charge — keep the discounted total at or above it. */
export const MIN_TOTAL_CENTS = 50;

/**
 * The pay-by-bank saving for a subtotal, in cents (>= 0). PURE — used both
 * client-side (the "Save $X" callout) and server-side (the authoritative
 * recompute in applyBankDiscount). Clamped so it never exceeds the subtotal nor
 * drops the payable total below Stripe's minimum charge. `flat` value is cents;
 * `percent` value is a whole percentage of subtotal.
 */
export function bankDiscountCents(
  subtotalCents: number,
  mode: PaytoDiscountMode,
  value: number,
): number {
  if (mode === "off" || value <= 0 || subtotalCents <= 0) return 0;
  const raw =
    mode === "flat" ? value : Math.round((subtotalCents * value) / 100);
  const maxDiscount = Math.max(0, subtotalCents - MIN_TOTAL_CENTS);
  return Math.max(0, Math.min(raw, maxDiscount));
}
