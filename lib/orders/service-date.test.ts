import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { venueDayFormatter, venueServiceDate } from "./service-date";

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
