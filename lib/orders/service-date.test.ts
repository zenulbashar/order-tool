import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  venueCalendarDays,
  venueDayFormatter,
  venueServiceDate,
} from "./service-date";

/**
 * The service day behind a venue's call number (audit P11).
 *
 * `assignDailyNumber` used to derive its service date from `new Date()` while
 * the order's own `scheduledForInstant` sat resolved 140 lines above it. So a
 * Thursday pre-order placed on Monday took MONDAY's number — and on Thursday
 * the counter restarted and handed the same number to a walk-in. Two cards
 * badged #5, two dockets headed ORDER 5, and two station labels reading `5-K`.
 *
 * The card, ticket and docket at least carry a createdAt line to tell the pair
 * apart. The STATION LABEL carries none at all, and it is the one surface
 * designed to be sorted by eye on a pass.
 */
describe("venueServiceDate", () => {
  // Sydney is UTC+11 in January (AEDT) and UTC+10 in July (AEST).
  const SYD = "Australia/Sydney";

  it("returns the venue-local day, not the UTC one", () => {
    // 2026-07-14T23:30Z is already the 15th in Sydney (+10). Numbering this
    // against the UTC day would reset the counter mid-service.
    expect(venueServiceDate(new Date("2026-07-14T23:30:00Z"), SYD)).toBe(
      "2026-07-15",
    );
  });

  it("resolves the offset in effect AT that instant, not today's", () => {
    // The same wall-clock hour lands on different UTC days across a DST change.
    // 13:30Z is the 15th in AEDT (+11) but still the 14th... in AEST (+10) it is
    // 23:30 on the 14th. Formatting an instant is DST-safe precisely because
    // Intl picks the offset for THAT instant.
    expect(venueServiceDate(new Date("2026-01-14T13:30:00Z"), SYD)).toBe(
      "2026-01-15",
    );
    expect(venueServiceDate(new Date("2026-07-14T13:30:00Z"), SYD)).toBe(
      "2026-07-14",
    );
  });

  it("formats as YYYY-MM-DD, which is what the counter column stores", () => {
    expect(venueServiceDate(new Date("2026-03-05T02:00:00Z"), SYD)).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
  });

  it("gives a FUTURE instant the future day, which is the whole fix", () => {
    // Placing a Thursday pre-order on Monday must take Thursday's number.
    const thursday = new Date("2026-07-16T02:00:00Z"); // 12:00 Thu in Sydney
    expect(venueServiceDate(thursday, SYD)).toBe("2026-07-16");
  });

  it("falls back to UTC on a timezone Intl rejects, rather than throwing", () => {
    // venues.timezone is free text with a default. A corrupt value used to fall
    // into assignDailyNumber's outer catch and cost the order its number
    // entirely; days in the wrong zone are strictly better than no number.
    expect(venueServiceDate(new Date("2026-07-14T23:30:00Z"), "Not/AZone")).toBe(
      "2026-07-14",
    );
  });

  it("reuses one formatter for many instants", () => {
    const fmt = venueDayFormatter(SYD);
    expect(fmt.format(new Date("2026-07-14T23:30:00Z"))).toBe("2026-07-15");
    expect(fmt.format(new Date("2026-07-15T23:30:00Z"))).toBe("2026-07-16");
  });
});

describe("assignDailyNumber's caller", () => {
  const source = (file: string) =>
    readFileSync(join(process.cwd(), file), "utf8");

  it("numbers the order against the day it is FOR", () => {
    // The defect was a wall-clock read inside a function that already had the
    // scheduled instant available. Pinned at the call site because that is
    // where the decision is now made.
    expect(source("app/[slug]/checkout/actions.ts")).toMatch(
      /assignDailyNumber\(\s*venueId,\s*scheduledForInstant \?\? new Date\(\),?\s*\)/,
    );
  });

  it("takes the instant as a REQUIRED argument", () => {
    // A default of `new Date()` would silently reintroduce the bug for the next
    // caller. The signature has to force the decision.
    const src = source("lib/orders/daily-number.ts");
    expect(src).toMatch(/serviceInstant:\s*Date\b/);
    expect(src, "no default — a defaulted clock is the bug").not.toMatch(
      /serviceInstant:\s*Date\s*=/,
    );
  });

  it("reads no clock of its own", () => {
    expect(
      /new Date\(\)/.test(source("lib/orders/daily-number.ts")),
      "assignDailyNumber must not consult the wall clock",
    ).toBe(false);
  });

  it("leaves exactly one venue-local day-key implementation", () => {
    // Two copies had already drifted on the malformed-timezone fallback. Any
    // new inline en-CA day formatter is that drift starting again.
    for (const file of [
      "app/dashboard/page.tsx",
      "lib/orders/daily-number.ts",
    ]) {
      expect(source(file), `${file} must use the shared helper`).not.toContain(
        'Intl.DateTimeFormat("en-CA"',
      );
    }
  });
});

/**
 * The daily revenue series (audit P13).
 *
 * Two charts on the same dashboard drew from the same order rows and only one
 * bucketed by calendar day. Reports sliced rolling `[dayEnd − 24h, dayEnd)`
 * windows anchored to the request instant, and labelled them with
 * `toLocaleDateString` and NO timeZone — so on Vercel, where nothing sets `TZ`
 * and the process runs UTC, a Sydney venue opening Reports at 09:00 Wednesday
 * saw its last bar labelled Tuesday and covering 09:00 Tue -> 09:00 Wed.
 * Wednesday morning's takings appeared under Tuesday, Tuesday evening's trade
 * split across two bars, and the Overview reported the same money under "Today".
 */
describe("venueCalendarDays", () => {
  const SYD = "Australia/Sydney";

  it("returns whole venue-local calendar days, oldest first", () => {
    // 09:00 Wed 5 Aug 2026 in Sydney.
    const now = new Date("2026-08-04T23:00:00Z");
    expect(venueCalendarDays(SYD, now, 3).map((d) => d.key)).toEqual([
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
    ]);
  });

  it("ends on the venue's today, not the server's", () => {
    // 09:00 Wed in Sydney is still 23:00 TUESDAY in UTC. A series anchored to
    // the process zone ends a day early and every bar shifts with it.
    const now = new Date("2026-08-04T23:00:00Z");
    const days = venueCalendarDays(SYD, now, 7);
    expect(days[days.length - 1].key).toBe("2026-08-05");
    expect(days[days.length - 1].key).toBe(venueServiceDate(now, SYD));
  });

  it("produces keys that match what the bucketing formatter emits", () => {
    // The two have to agree exactly or every lookup misses and the chart reads
    // zero — the quiet failure this shape invites.
    const now = new Date("2026-08-04T23:00:00Z");
    const keyOf = venueDayFormatter(SYD);
    // 21:30 Tue 4 Aug Sydney — an order placed in the evening trade.
    expect(keyOf.format(new Date("2026-08-04T11:30:00Z"))).toBe("2026-08-04");
    expect(venueCalendarDays(SYD, now, 3).map((d) => d.key)).toContain(
      "2026-08-04",
    );
  });

  it("labels each day as the day its own key names", () => {
    // `date` is a calendar date built in UTC, so a formatter without
    // timeZone: "UTC" would shift it and label a bar with its neighbour's date.
    const now = new Date("2026-08-04T23:00:00Z");
    for (const day of venueCalendarDays(SYD, now, 5)) {
      const labelled = new Intl.DateTimeFormat("en-CA", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        timeZone: "UTC",
      }).format(day.date);
      expect(labelled).toBe(day.key);
    }
  });

  it("crosses a month boundary without inventing a day", () => {
    // Date.UTC normalises day 0 and below into the previous month.
    const now = new Date("2026-03-02T00:00:00Z"); // 11:00 Mon 2 Mar Sydney
    expect(venueCalendarDays(SYD, now, 4).map((d) => d.key)).toEqual([
      "2026-02-27",
      "2026-02-28",
      "2026-03-01",
      "2026-03-02",
    ]);
  });

  it("stays a whole day across a DST change, where a local day is 23h", () => {
    // AEDT begins Sun 4 Oct 2026, making that local day 23 hours long. Series
    // built by subtracting 86_400_000 from an instant drift by an hour here and
    // eventually skip or repeat a day; calendar arithmetic does not.
    const now = new Date("2026-10-05T02:00:00Z"); // 13:00 Mon 5 Oct Sydney
    expect(venueCalendarDays(SYD, now, 4).map((d) => d.key)).toEqual([
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
      "2026-10-05",
    ]);
  });

  it("offsets the whole window for a prior-period comparison", () => {
    // The Overview's Delta baseline: the 7 days before the current 7.
    const now = new Date("2026-08-04T23:00:00Z");
    const current = venueCalendarDays(SYD, now, 7);
    const prior = venueCalendarDays(SYD, now, 7, 7);
    expect(prior[prior.length - 1].key).toBe("2026-07-29");
    expect(current[0].key).toBe("2026-07-30");
    // Adjacent, non-overlapping — a gap or an overlap silently distorts every
    // percentage on the page.
    expect(new Set([...current, ...prior].map((d) => d.key)).size).toBe(14);
  });
});

describe("the two revenue charts", () => {
  const source = (file: string) =>
    readFileSync(join(process.cwd(), file), "utf8");

  const CHARTS = ["app/dashboard/page.tsx", "app/dashboard/reports/page.tsx"];

  it("both bucket by venue-local calendar day from the shared series", () => {
    for (const file of CHARTS) {
      expect(source(file), `${file} must use the shared day series`).toContain(
        "venueCalendarDays(venue.timezone",
      );
      expect(source(file), `${file} must bucket on the venue timezone`).toContain(
        "venueDayFormatter(venue.timezone)",
      );
    }
  });

  it("neither slices rolling windows off the request instant", () => {
    // The original shape: `now - d * dayMs` with a 24h span. It is wrong by
    // construction on any day that is not exactly 24 hours long, and it files
    // this morning's trade under yesterday.
    for (const file of CHARTS) {
      expect(source(file), file).not.toMatch(/now\s*-\s*d\s*\*\s*dayMs/);
    }
  });

  it("never formats a chart label without a timeZone", () => {
    // toLocaleDateString with no timeZone silently uses the process zone, which
    // is UTC on Vercel because nothing sets TZ. That is how the labels drifted
    // away from the buckets they name.
    for (const file of CHARTS) {
      expect(source(file), `${file} must not use bare toLocaleDateString`).not.toContain(
        "toLocaleDateString(",
      );
    }
  });
});
