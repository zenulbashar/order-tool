import type { OpeningHoursEntry } from "@/lib/db/schema";

/**
 * Opening hours as an agent (or a diner) would want them said: is the venue
 * open right now in ITS zone, today's ranges, and the weekly table. The app's
 * weekday convention is 0=Monday … 6=Sunday (OpeningHoursEntry.day). Pure.
 */

export const DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export type HoursSummary = {
  timeZone: string;
  openNow: boolean;
  today: { day: string; ranges: { opens: string; closes: string }[] };
  week: { day: string; ranges: { opens: string; closes: string }[] }[];
};

function minutesOfDay(time: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** The venue-local weekday (0=Monday) and minute of day for an instant. */
export function venueClock(
  now: Date,
  timeZone: string,
): { weekday: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const jsDay = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  const weekday = ((jsDay === -1 ? 0 : jsDay) + 6) % 7;
  const minute = Number(get("hour")) * 60 + Number(get("minute"));
  return { weekday, minute };
}

export function summariseHours(
  openingHours: OpeningHoursEntry[] | null,
  timeZone: string,
  now: Date,
): HoursSummary {
  const clock = venueClock(now, timeZone);
  const week = DAY_NAMES.map((day, index) => ({
    day,
    ranges: (openingHours ?? [])
      .filter((entry) => entry.day === index)
      .filter(
        (entry) =>
          minutesOfDay(entry.opens) !== null &&
          minutesOfDay(entry.closes) !== null &&
          (minutesOfDay(entry.opens) as number) < (minutesOfDay(entry.closes) as number),
      )
      .sort((a, b) => (minutesOfDay(a.opens) ?? 0) - (minutesOfDay(b.opens) ?? 0))
      .map((entry) => ({ opens: entry.opens, closes: entry.closes })),
  }));
  const today = week[clock.weekday];
  const openNow = today.ranges.some((range) => {
    const open = minutesOfDay(range.opens) ?? 0;
    const close = minutesOfDay(range.closes) ?? 0;
    return clock.minute >= open && clock.minute < close;
  });
  return { timeZone, openNow, today, week };
}
