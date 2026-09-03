/**
 * Format an order's placed-at instant in the VENUE's timezone (e.g.
 * "Australia/Brisbane"), never the server's UTC. Used on the owner kitchen view
 * so times read as the venue's wall clock. A short date is included so orders
 * that span midnight — or the completed history — stay unambiguous.
 *
 * venues.timezone is NOT NULL with a sane default, but a malformed IANA zone
 * would make Intl throw and take down the whole kitchen page, so fall back to
 * UTC rather than crash.
 */
export function formatVenueTime(date: Date, timeZone: string): string {
  const options: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  };
  try {
    return new Intl.DateTimeFormat("en-AU", { ...options, timeZone }).format(date);
  } catch {
    return `${new Intl.DateTimeFormat("en-AU", { ...options, timeZone: "UTC" }).format(date)} UTC`;
  }
}

/**
 * The zone a venue starts in (matches the venues.timezone column default) and
 * the zone platform-wide dates — admin promotions — are interpreted in.
 */
export const DEFAULT_VENUE_TIME_ZONE = "Australia/Brisbane";

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Wall-clock components of an instant in a zone, as a UTC-based timestamp. */
function wallClockAsUtc(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  return Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
}

/**
 * The instants a calendar date begins and ends in a time zone.
 *
 * `<input type="date">` submits "YYYY-MM-DD", and `new Date("YYYY-MM-DD")`
 * reads that as UTC MIDNIGHT — 10:00 or 11:00 in the morning on Australia's
 * east coast. Stored as a promotion's end, the code stopped working mid-morning
 * on its advertised last day; as a start, it did not begin until mid-morning.
 * This resolves the date in the zone the wall clock belongs to: `start` is
 * 00:00:00.000 and `end` is 23:59:59.999 of that day THERE. Returns null for
 * anything that is not a real calendar date or a zone Intl knows. Pure.
 */
export function dayBoundsInTimeZone(
  dateOnly: string,
  timeZone: string,
): { start: Date; end: Date } | null {
  const match = DATE_ONLY.exec(dateOnly.trim());
  if (!match) return null;
  const [, y, m, d] = match.map(Number) as [unknown, number, number, number];
  const localMidnightAsUtc = Date.UTC(y, m - 1, d);
  // Reject impossible dates (e.g. 2026-02-30 rolls over in Date.UTC).
  const check = new Date(localMidnightAsUtc);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) {
    return null;
  }
  try {
    // Two passes converge across a DST edge: the offset at the guessed instant
    // may differ from the offset at the true local midnight.
    let instant = localMidnightAsUtc;
    for (let i = 0; i < 2; i++) {
      const offset = wallClockAsUtc(new Date(instant), timeZone) - instant;
      instant = localMidnightAsUtc - offset;
    }
    const nextLocalMidnightAsUtc = Date.UTC(y, m - 1, d + 1);
    let next = nextLocalMidnightAsUtc;
    for (let i = 0; i < 2; i++) {
      const offset = wallClockAsUtc(new Date(next), timeZone) - next;
      next = nextLocalMidnightAsUtc - offset;
    }
    return { start: new Date(instant), end: new Date(next - 1) };
  } catch {
    return null;
  }
}

/**
 * IANA zone for an Australian state/territory as entered at onboarding (any
 * case, full name or abbreviation). The venues.timezone column defaulted every
 * venue to Australia/Brisbane and nothing ever wrote it, so a Sydney or Perth
 * venue's pickup slots, opening-hours windows and daily order numbers ran on
 * Queensland time. Returns null when the state is not recognised so the caller
 * keeps the column default rather than guessing. Pure.
 */
export function timeZoneForAustralianState(state: string | null | undefined): string | null {
  if (!state) return null;
  const key = state.toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim();
  const zones: Record<string, string> = {
    qld: "Australia/Brisbane",
    queensland: "Australia/Brisbane",
    nsw: "Australia/Sydney",
    "new south wales": "Australia/Sydney",
    act: "Australia/Sydney",
    "australian capital territory": "Australia/Sydney",
    vic: "Australia/Melbourne",
    victoria: "Australia/Melbourne",
    tas: "Australia/Hobart",
    tasmania: "Australia/Hobart",
    sa: "Australia/Adelaide",
    "south australia": "Australia/Adelaide",
    nt: "Australia/Darwin",
    "northern territory": "Australia/Darwin",
    wa: "Australia/Perth",
    "western australia": "Australia/Perth",
  };
  return zones[key] ?? null;
}
