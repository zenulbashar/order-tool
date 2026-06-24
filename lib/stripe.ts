import Stripe from "stripe";

/**
 * Server-only Stripe client + the platform's per-order fee rule.
 *
 * The client is LAZILY constructed (first call, not module load): the Stripe
 * constructor throws when the secret key is absent, so deferring construction
 * keeps `next build` / `tsc` working with no Stripe env present — the same lazy
 * contract as the Neon pool in lib/db/index.ts. By the time any request calls
 * getStripe(), the runtime env is guaranteed present.
 */

// Pinned to the API version bundled with the installed SDK (stripe@22.2.3) so
// behaviour is deterministic across deploys rather than following the account
// default. Bump this together with the `stripe` package.
const STRIPE_API_VERSION = "2026-05-27.dahlia";

let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (client) return client;
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set — cannot initialise the Stripe client.",
    );
  }
  client = new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION,
    typescript: true,
  });
  return client;
}

/**
 * Publishable key for the browser (Stripe.js / Payment Element). Read at
 * runtime and handed to the client by the checkout action — it is publishable,
 * so sending it to the browser is expected. Lazy for the same build-time reason.
 */
export function getStripePublishableKey(): string {
  const key = process.env.STRIPE_PUBLISHABLE_KEY;
  if (!key) {
    throw new Error("STRIPE_PUBLISHABLE_KEY is not set.");
  }
  return key;
}

/* -------------------------------------------------------------------------- */
/* Platform application fee — SINGLE SOURCE OF TRUTH                           */
/*                                                                            */
/* The per-order fee the platform takes from each venue's direct charge.      */
/* Change the fee by editing ONLY these two constants. It is computed entirely */
/* server-side and never accepts a client value. The result is clamped to      */
/* [0, total) because Stripe requires 0 <= application_fee_amount < amount on   */
/* a direct charge.                                                            */
/* -------------------------------------------------------------------------- */
const APPLICATION_FEE_BPS = 175; // 1.75% (175 basis points)
const APPLICATION_FEE_FLAT_CENTS = 30; // + $0.30 per order

export function computeApplicationFeeCents(orderTotalCents: number): number {
  if (!Number.isFinite(orderTotalCents) || orderTotalCents <= 0) return 0;
  const percentCents = Math.round(
    (orderTotalCents * APPLICATION_FEE_BPS) / 10_000,
  );
  const fee = APPLICATION_FEE_FLAT_CENTS + percentCents;
  // Never let the fee reach the charge amount (Stripe rejects fee >= amount).
  const maxFee = orderTotalCents - 1;
  return Math.min(Math.max(fee, 0), maxFee);
}
