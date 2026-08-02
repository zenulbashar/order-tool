/**
 * Stripe idempotency key for the PaymentIntent re-price in applyOrderDiscounts.
 *
 * An idempotency key must identify a state TRANSITION. The original key was
 * `${orderId}-disc-${targetAmount}` — a function of the DESTINATION only — and
 * that was a live money bug:
 *
 *   1. Apply the bank saving   -> total 1800c, key "…-disc-1800" burnt, PI 1800
 *   2. Apply a $5 gift card    -> total 1300c, key "…-disc-1300",      PI 1300
 *   3. Clear the gift card     -> total 1800c, key "…-disc-1800" AGAIN
 *
 * Discounts are composable, so step 3 is an ordinary thing for a diner to do —
 * and the request body Stripe sees is byte-identical to step 1's, because the
 * application fee is a pure function of the amount. Stripe therefore REPLAYS the
 * cached response rather than rejecting the reuse: no update runs, the PI stays
 * at 1300, and the order row — already written earlier in the same transaction —
 * says 1800. The replay is an HTTP 200, so nothing throws and nothing rolls back.
 *
 * It is symmetric, so it is not only an attack: a diner ticking points on, off,
 * and on again lands the PI on the HIGHER amount and is overcharged.
 *
 * Verifying the RETURNED PaymentIntent would not have caught it either — the
 * replayed body IS the earlier successful response, so it already carries the
 * expected amount. Only a key that cannot repeat closes this.
 *
 * ## Why BOTH the revision and the amount
 *
 * The revision is what fixes the bug: it is monotonic per order, so it stays
 * unique across an A->B->A->B oscillation, which a from/to pair would not.
 *
 * The target amount is here for the rollback case, and dropping it would trade
 * one defect for another. The DB write and the Stripe call share a transaction,
 * so if the COMMIT fails after Stripe already succeeded, the revision reverts
 * with everything else. The next apply then reuses that revision — and if the
 * diner has since changed the discount, it would reuse it with a DIFFERENT body.
 * Stripe answers a key reused with different parameters by ERRORING, not
 * replaying, so the update would throw, the transaction would roll back, and
 * every retry would reproduce it: the order wedges, unable to re-price at all.
 *
 * Including the amount means the key only repeats when the revision AND the
 * destination both repeat. On any committed path that is the SAME transition
 * being retried, and replaying is correct: it re-applies the identical update
 * the rolled-back attempt made. That is what an idempotency key is for, and it
 * is the property the original comment claimed but the original key did not have.
 *
 * Not a total guarantee, and worth stating honestly: TWO consecutive
 * rollbacks-after-Stripe-succeeded on one order, at different targets, could
 * re-mint an earlier key (r1->1800 rolled back, r1->1300 rolled back, then a
 * third apply back to 1800 replays r1-1800 against a PI now at 1300). That needs
 * two commit failures in a row on the same order, each after Stripe had already
 * accepted the update — and the webhook's charge-vs-order backstop catches the
 * result if it ever happens. Strictly better than keying on the amount alone;
 * closing it completely would need the revision persisted outside the
 * transaction, which trades a rarer fault for a permanent extra write.
 */
export function discountIdempotencyKey(
  orderId: string,
  revision: number,
  targetTotalCents: number,
): string {
  if (!Number.isInteger(revision) || revision < 1) {
    // Revisions come from `locked.discountRevision + 1`, so this is a
    // programming error, not a diner input. Fail loudly rather than mint a key
    // that could collide with a previous one.
    throw new Error(`discountIdempotencyKey: bad revision ${revision}`);
  }
  if (!Number.isInteger(targetTotalCents) || targetTotalCents < 0) {
    throw new Error(
      `discountIdempotencyKey: bad target ${targetTotalCents}`,
    );
  }
  return `${orderId}-disc-r${revision}-${targetTotalCents}`;
}
