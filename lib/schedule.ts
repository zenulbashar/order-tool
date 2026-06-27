import type { OpeningHoursEntry } from "@/lib/db/schema";

/**
 * Scheduled-pickup time math (Phase 8). PURE + dependency-free (the same Intl-only
 * approach as lib/time.ts) so it is safe to import from BOTH the client picker
 * and the server validation gate — the offered slots and the accepted slots are
 * computed by the SAME code and therefore cannot drift.
 *
 * Everything is reasoned about in the VENUE's timezone, never the server's or the
 * customer's device. A chosen pickup time travels as a NAIVE wall-clock string
 * "YYYY-MM-DDTHH:MM" (no offset); the venue timezone is applied here. The server
 * gate is authoritative — the picker is convenience only.
 */

export type SchedulingConfig = {
  timeZone: string;
  openingHours: OpeningHoursEntry[] | null;
  leadMinutes: number;
  maxDaysAhead: number;
};

export type ScheduleResult =
  | { ok: true; instant: Date }
  | { ok: false; error: string };

const WALL_CLOCK_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const SLOT_STEP_MINUTES = 15;
const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** A naive wall-clock broken into numeric parts (no timezone applied yet). */
type WallParts = {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number; // 0-59
};

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function toWallClockString(p: WallParts): string {
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}T${pad2(p.hour)}:${pad2(p.minute)}`;
}

function parseWallClock(value: string): WallParts | null {
  const m = WALL_CLOCK_RE.exec(value);
  if (!m) return null;
  return {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: Number(m[4]),
    minute: Number(m[5]),
  };
}

/** App weekday convention: 0=Monday … 6=Sunday (matches OpeningHoursEntry.day). */
function mondayZeroWeekday(year: number, month: number, day: number): number {
  // A calendar date's weekday is timezone-invariant, so compute it from the date
  // components via a fixed UTC date. getUTCDay() is 0=Sunday … 6=Saturday; remap.
  const jsDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return (jsDay + 6) % 7;
}

/** The venue-local wall-clock parts of an absolute instant, via Intl (DST-correct). */
function instantToVenueParts(instant: Date, timeZone: string): WallParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(instant);
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);
  let hour = get("hour");
  // Some Intl builds emit "24" for midnight with hour12:false; normalize to 0.
  if (hour === 24) hour = 0;
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour,
    minute: get("minute"),
  };
}

/**
 * Interpret a naive wall-clock as an absolute instant in `timeZone` (the hard
 * direction Intl doesn't do directly). Treat the components as if they were UTC,
 * see what wall-clock that provisional instant shows in the venue zone, and
 * subtract the difference (the zone offset). One pass is exact for every
 * wall-clock that actually exists; the only ill-defined input is the nonexistent
 * hour at a spring-forward DST transition, which the caller rejects via a
 * round-trip equality check.
 */
function venueWallClockToInstant(parts: WallParts, timeZone: string): Date {
  const asUTC = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
  );
  const seen = instantToVenueParts(new Date(asUTC), timeZone);
  const seenAsUTC = Date.UTC(
    seen.year,
    seen.month - 1,
    seen.day,
    seen.hour,
    seen.minute,
  );
  const offset = seenAsUTC - asUTC;
  return new Date(asUTC - offset);
}

/** Valid "HH:MM" -> minutes since midnight, or null if malformed. */
function minutesOfDay(time: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Open ranges (minute spans) for a Monday-0 weekday; skips malformed/overnight rows. */
function rangesForDay(
  openingHours: OpeningHoursEntry[],
  weekday: number,
): { open: number; close: number }[] {
  const ranges: { open: number; close: number }[] = [];
  for (const entry of openingHours) {
    if (entry.day !== weekday) continue;
    const open = minutesOfDay(entry.opens);
    const close = minutesOfDay(entry.closes);
    // Defensive: the data is valid by construction (opens < closes, same day),
    // but never crash checkout on a hand-edited row — just ignore a bad one.
    if (open === null || close === null || open >= close) continue;
    ranges.push({ open, close });
  }
  return ranges;
}

/**
 * Server-authoritative validation of a chosen pickup wall-clock against the
 * venue's config. PURE: callers pass `nowMs` (server Date.now()) and the config,
 * so it never reads the clock or the DB — deterministic and identical to what the
 * picker offered. Returns the resolved absolute instant to store.
 */
export function validateScheduledForConfig(
  config: SchedulingConfig,
  wallClock: string,
  nowMs: number,
): ScheduleResult {
  if (!config.openingHours || config.openingHours.length === 0) {
    return {
      ok: false,
      error: "This venue isn't taking scheduled orders right now.",
    };
  }

  const parts = parseWallClock(wallClock);
  if (!parts) return { ok: false, error: "Choose a valid pickup time." };

  // Open-hours check uses the LITERAL wall-clock components (timezone-free): a
  // calendar date's weekday is fixed, and the time-of-day is what the customer
  // picked in venue-local terms.
  const weekday = mondayZeroWeekday(parts.year, parts.month, parts.day);
  const wantMinutes = parts.hour * 60 + parts.minute;
  const withinHours = rangesForDay(config.openingHours, weekday).some(
    (range) => wantMinutes >= range.open && wantMinutes < range.close,
  );
  if (!withinHours) {
    return {
      ok: false,
      error: "That time is outside the venue's opening hours.",
    };
  }

  const instant = venueWallClockToInstant(parts, config.timeZone);

  // Round-trip guard: a nonexistent (spring-forward) wall-clock, or a rolled-over
  // date (e.g. "02-30"), won't reformat back to the same wall-clock — reject it.
  const roundTrip = instantToVenueParts(instant, config.timeZone);
  if (toWallClockString(roundTrip) !== toWallClockString(parts)) {
    return { ok: false, error: "That time isn't available. Please pick another." };
  }

  const ms = instant.getTime();
  if (Number.isNaN(ms)) return { ok: false, error: "Choose a valid pickup time." };
  if (ms < nowMs + config.leadMinutes * MS_PER_MINUTE) {
    return { ok: false, error: "Please choose a later pickup time." };
  }
  if (ms > nowMs + config.maxDaysAhead * MS_PER_DAY) {
    return { ok: false, error: "That pickup time is too far ahead." };
  }

  return { ok: true, instant };
}

export type PickupDay = {
  /** "YYYY-MM-DD" venue-local date. */
  date: string;
  /** Human label, e.g. "Today", "Tomorrow", or "Wed 15 Jul". */
  label: string;
  /** Valid "HH:MM" times for this day, ascending. */
  times: string[];
};

function dayLabel(offset: number, year: number, month: number, day: number): string {
  if (offset === 0) return "Today";
  if (offset === 1) return "Tomorrow";
  const weekday = mondayZeroWeekday(year, month, day);
  return `${WEEKDAY_SHORT[weekday]} ${day} ${MONTH_SHORT[month - 1]}`;
}

/**
 * Build the valid venue-local pickup slots for the picker (client convenience).
 * Mirrors validateScheduledForConfig's rules (open hours + lead + max) so a slot
 * the UI offers always passes the server gate. `nowMs` should be Date.now().
 */
export function buildPickupSlots(
  config: SchedulingConfig,
  nowMs: number,
): PickupDay[] {
  if (!config.openingHours || config.openingHours.length === 0) return [];

  const earliestMs = nowMs + config.leadMinutes * MS_PER_MINUTE;
  const latestMs = nowMs + config.maxDaysAhead * MS_PER_DAY;

  // Start from "today" in the venue tz, then walk calendar days forward. Date
  // math is tz-free (we only use the y/m/d); each slot's instant is resolved in
  // the venue tz and filtered by the same lead/max bounds the server enforces.
  const today = instantToVenueParts(new Date(nowMs), config.timeZone);
  const days: PickupDay[] = [];

  for (let offset = 0; offset <= config.maxDaysAhead; offset += 1) {
    const base = new Date(Date.UTC(today.year, today.month - 1, today.day));
    base.setUTCDate(base.getUTCDate() + offset);
    const year = base.getUTCFullYear();
    const month = base.getUTCMonth() + 1;
    const day = base.getUTCDate();

    const ranges = rangesForDay(config.openingHours, mondayZeroWeekday(year, month, day));
    if (ranges.length === 0) continue;

    const times: string[] = [];
    for (const range of ranges) {
      const start = Math.ceil(range.open / SLOT_STEP_MINUTES) * SLOT_STEP_MINUTES;
      for (let mins = start; mins < range.close; mins += SLOT_STEP_MINUTES) {
        const parts: WallParts = {
          year,
          month,
          day,
          hour: Math.floor(mins / 60),
          minute: mins % 60,
        };
        const ms = venueWallClockToInstant(parts, config.timeZone).getTime();
        if (ms < earliestMs || ms > latestMs) continue;
        times.push(`${pad2(parts.hour)}:${pad2(parts.minute)}`);
      }
    }
    if (times.length === 0) continue;

    days.push({
      date: `${year}-${pad2(month)}-${pad2(day)}`,
      label: dayLabel(offset, year, month, day),
      times,
    });
  }

  return days;
}

/**
 * Request-time "now" in epoch ms. Wrapped so a dynamic server component can read
 * the current instant (a legitimately request-time value) without an impure call
 * in render scope, and so the storefront/checkout can pass ONE stable timestamp
 * into the client picker — no client clock read, hence no hydration mismatch. The
 * server gate re-derives its own Date.now() at submit; this only offers slots.
 */
export function requestNowMs(): number {
  return Date.now();
}
