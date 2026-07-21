import { describe, expect, it } from "vitest";

import { buildPickupSlots, validateScheduledForConfig } from "./schedule";
import type { SchedulingConfig } from "./schedule";

// UTC so the naive wall-clock equals the absolute instant — keeps the assertions
// timezone-independent and DST-free. Monday 2026-01-05, open 09:00–17:00.
const config: SchedulingConfig = {
  timeZone: "UTC",
  openingHours: [{ day: 0, opens: "09:00", closes: "17:00" }],
  leadMinutes: 30,
  maxDaysAhead: 7,
};
const NOW = Date.UTC(2026, 0, 5, 9, 0); // Mon 09:00 UTC

describe("validateScheduledForConfig", () => {
  it("accepts an in-hours slot past the lead time and returns the instant", () => {
    const r = validateScheduledForConfig(config, "2026-01-05T12:00", NOW);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.instant.getTime()).toBe(Date.UTC(2026, 0, 5, 12, 0));
  });

  it("rejects a venue with no opening hours", () => {
    const r = validateScheduledForConfig(
      { ...config, openingHours: [] },
      "2026-01-05T12:00",
      NOW,
    );
    expect(r).toEqual({
      ok: false,
      error: "This venue isn't taking scheduled orders right now.",
    });
  });

  it("rejects a malformed wall-clock", () => {
    expect(validateScheduledForConfig(config, "not-a-time", NOW).ok).toBe(false);
  });

  it("rejects a time outside opening hours", () => {
    const r = validateScheduledForConfig(config, "2026-01-05T18:00", NOW);
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.error).toMatch(/opening hours/);
  });

  it("rejects a different weekday with no configured hours", () => {
    // 2026-01-06 is a Tuesday; only Monday (day 0) has hours.
    const r = validateScheduledForConfig(config, "2026-01-06T12:00", NOW);
    expect(r.ok).toBe(false);
  });

  it("rejects a time inside the lead window", () => {
    const r = validateScheduledForConfig(config, "2026-01-05T09:15", NOW);
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.error).toMatch(/later pickup time/);
  });

  it("rejects a time beyond the max-days-ahead horizon", () => {
    // 2026-01-19 is a Monday (in hours) but 14 days out, past maxDaysAhead=7.
    const r = validateScheduledForConfig(config, "2026-01-19T12:00", NOW);
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.error).toMatch(/too far ahead/);
  });
});

describe("buildPickupSlots", () => {
  it("offers today's slots starting after the lead time, on the 15-min grid", () => {
    const days = buildPickupSlots(config, NOW);
    expect(days.length).toBeGreaterThan(0);

    const today = days[0];
    expect(today.date).toBe("2026-01-05");
    expect(today.label).toBe("Today");
    // Lead is 30 min from 09:00 → first offered slot is 09:30 (09:00/09:15 dropped).
    expect(today.times[0]).toBe("09:30");
    // All slots are within hours and strictly ascending.
    for (const t of today.times) {
      expect(t >= "09:30" && t < "17:00").toBe(true);
    }
    const sorted = [...today.times].sort();
    expect(today.times).toEqual(sorted);
  });

  it("returns nothing when the venue has no opening hours", () => {
    expect(buildPickupSlots({ ...config, openingHours: [] }, NOW)).toEqual([]);
  });
});
