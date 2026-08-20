/**
 * Postgres error classification.
 *
 * Two call sites now need to tell "this row already exists" apart from "the
 * database is broken", and getting that distinction wrong in either direction
 * is expensive: swallow a real failure and data is silently lost; treat a
 * benign conflict as a failure and — on the refund path — an operator is told a
 * refund that DID move money failed, and retries it.
 */

/**
 * `23505 unique_violation`.
 *
 * Matched on the SQLSTATE code rather than the message, because the message is
 * driver- and locale-dependent while the code is part of the Postgres contract.
 */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}
