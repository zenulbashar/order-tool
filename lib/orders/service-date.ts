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

/** One venue-local calendar day: its `YYYY-MM-DD` key and a Date to label from. */
export type VenueDay = {
  /** Matches what `venueDayFormatter(tz).format(instant)` returns. */
  key: string;
  /**
   * The same day as a Date built in UTC. It is a CALENDAR DATE, not an instant,
   * so anything formatting it must pass `timeZone: "UTC"` — otherwise the
   * process zone shifts it and the label names a different day than the key.
   */
  date: Date;
};

/**
 * The last `count` venue-local calendar days, oldest first.
 *
 * Both the owner Overview and Reports draw a daily revenue chart from the same
 * order rows, and only one of them was doing it by calendar day. Reports bucketed
 * `[dayEnd − 24h, dayEnd)` anchored to the REQUEST INSTANT and labelled the
 * result with no `timeZone` at all, so on Vercel (no `TZ` set, process runs UTC)
 * a Sydney venue opening Reports at 09:00 Wednesday saw its last bar labelled
 * Tuesday, covering 09:00 Tue -> 09:00 Wed. Wednesday morning's takings appeared
 * under Tuesday, Tuesday evening's split across two bars, and the Overview on
 * the same dashboard reported those same takings under "Today".
 *
 * The bar HEIGHTS were wrong, not just the labels, which is why this is a
 * bucketing fix rather than a formatting one.
 *
 * Deriving the series by calendar arithmetic on the venue-local "today" — rather
 * than subtracting 86_400_000 from an instant — is also what makes it survive a
 * DST week, where a local day is 23 or 25 hours long.
 *
 * `offsetDays` shifts the whole window back, for a caller comparing this week
 * against the one before it.
 */
export function venueCalendarDays(
  timeZone: string,
  now: Date,
  count: number,
  offsetDays = 0,
): VenueDay[] {
  const [year, month, day] = venueServiceDate(now, timeZone)
    .split("-")
    .map(Number);
  return Array.from({ length: count }, (_, i) => {
    // Date.UTC normalises an out-of-range day (0, -3, 32) into the right month,
    // so no month-boundary arithmetic is needed here.
    const date = new Date(
      Date.UTC(year, month - 1, day - offsetDays - (count - 1 - i)),
    );
    return { key: date.toISOString().slice(0, 10), date };
  });
}
