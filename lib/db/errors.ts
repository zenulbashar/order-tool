/**
 * Postgres error classification.
 *
 * Two call sites now need to tell "this row already exists" apart from "the
 * database is broken", and getting that distinction wrong in either direction
 * is expensive: swallow a real failure and data is silently lost; treat a
 * benign conflict as a failure and — on the refund path — an operator is told a
 * refund that DID move money failed, and retries it.
 */

const UNIQUE_VIOLATION = "23505";

/**
 * The SQLSTATE code on an error, looking THROUGH wrappers. drizzle-orm wraps
 * every driver error in a DrizzleQueryError whose `cause` is the original
 * Postgres error, so the code lives one level down (and the driver may add a
 * level of its own). Matching only the top-level `code` classified every
 * conflict as an unknown failure.
 */
function sqlState(error: unknown): string | null {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && typeof current === "object" && current; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") return code;
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

/**
 * `23505 unique_violation`.
 *
 * Matched on the SQLSTATE code rather than the message, because the message is
 * driver- and locale-dependent while the code is part of the Postgres contract.
 */
export function isUniqueViolation(error: unknown): boolean {
  return sqlState(error) === UNIQUE_VIOLATION;
}
