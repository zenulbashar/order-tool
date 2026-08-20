/**
 * The venue-local SERVICE DAY of an instant, as `YYYY-MM-DD`.
 *
 * "Which trading day does this belong to" is asked in two very different places
 * — the per-venue call-number counter, which resets at local midnight, and the
 * dashboard's daily revenue buckets — and each had grown its own copy. They had
 * already drifted: the dashboard's caught a malformed `venues.timezone` and fell
 * back to UTC, while the counter's did not, so a bad timezone fell into that
 * function's outer catch and silently cost the order its call number entirely.
 * One definition, one fallback.
 *
 * `en-CA` is used purely because it formats as ISO-ordered `YYYY-MM-DD`, which
 * is what `venue_order_sequences.service_date` stores and what sorts correctly
 * as a string.
 *
 * Formatting an instant INTO a local date is DST-safe on its own — Intl resolves
 * the offset actually in effect at that instant. That is the opposite direction
 * from `lib/schedule.ts`'s wall-clock-to-instant conversion, which has to pick
 * an offset before it knows the instant and is where DST bugs actually live.
 *
 * Pure: no I/O, no clock of its own.
 */

const DAY_OPTS: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
};

/**
 * A reusable formatter, for callers that bucket MANY instants — constructing an
 * Intl.DateTimeFormat per row is measurably slower than reusing one.
 *
 * Falls back to UTC on a timezone Intl rejects. A venue whose timezone is
 * corrupt should get days in the wrong zone, not no days at all.
 */
export function venueDayFormatter(timeZone: string): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat("en-CA", { ...DAY_OPTS, timeZone });
  } catch {
    return new Intl.DateTimeFormat("en-CA", { ...DAY_OPTS, timeZone: "UTC" });
  }
}

/** The service day of ONE instant. `YYYY-MM-DD` in the venue's timezone. */
export function venueServiceDate(instant: Date, timeZone: string): string {
  return venueDayFormatter(timeZone).format(instant);
}
