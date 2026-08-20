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

/**
 * DST (audit P10).
 *
 * The config above deliberately pins `timeZone: "UTC"` and calls itself
 * "DST-free", which is exactly why this suite stayed green while the conversion
 * was wrong. `venueWallClockToInstant` sampled the zone offset at the
 * PROVISIONAL instant — the wall-clock components read as UTC — which for a
 * UTC+10 zone sits ten to eleven hours earlier than the answer. Any transition
 * in that gap was applied from the wrong side.
 *
 * Measured before the fix, with the real exported functions: 16 slots offered,
 * 0 accepted, 16 rejected as "That time isn't available."
 *
 * Sydney is the case that matters — every Australian zone except Queensland,
 * the Northern Territory and Western Australia observes DST, and
 * `venues.timezone` defaults to Brisbane only because nothing writes it yet.
 */
const sydney: SchedulingConfig = {
  timeZone: "Australia/Sydney",
  // Saturday 17:00-21:00. AEDT begins Sun 4 Oct 2026 (02:00 AEST -> 03:00 AEDT),
  // so Sat 3 Oct is the last day before the change.
  openingHours: [{ day: 5, opens: "17:00", closes: "21:00" }],
  leadMinutes: 30,
  maxDaysAhead: 7,
};
const SYD_NOW = Date.UTC(2026, 9, 1, 22, 0); // Fri 2 Oct, 09:00 Sydney

describe("DST — offered slots and accepted slots cannot drift", () => {
  it("accepts EVERY slot the picker offers, across a DST transition", () => {
    // The invariant the module's docblock claims, asserted directly rather than
    // by testing the offset arithmetic. This is the regression that matters: a
    // diner picking a time the UI showed them and being told it is unavailable.
    const days = buildPickupSlots(sydney, SYD_NOW);
    const offered = days.flatMap((d) => d.times.map((t) => `${d.date}T${t}`));
    expect(offered.length).toBeGreaterThan(0);

    const rejected = offered.filter(
      (when) => !validateScheduledForConfig(sydney, when, SYD_NOW).ok,
    );
    expect(
      rejected,
      `${rejected.length}/${offered.length} offered slots were refused by the validator`,
    ).toEqual([]);
  });

  it("resolves a pre-transition wall-clock at the pre-transition offset", () => {
    // Sat 3 Oct 17:00 Sydney is AEST (+10) -> 07:00Z. Sampling the offset at the
    // provisional instant read it as Sun 04:00 AEDT and returned +11, landing an
    // hour early on 06:00Z.
    const r = validateScheduledForConfig(sydney, "2026-10-03T17:00", SYD_NOW);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.instant.toISOString()).toBe("2026-10-03T07:00:00.000Z");
  });

  it("resolves a post-transition wall-clock at the post-transition offset", () => {
    // Sat 10 Oct 17:00 Sydney is AEDT (+11) -> 06:00Z. Quoted from Fri 9 Oct,
    // because maxDaysAhead is 7 and this date is 8 days past SYD_NOW.
    const laterNow = Date.UTC(2026, 9, 8, 22, 0); // Fri 9 Oct, 09:00 Sydney
    const r = validateScheduledForConfig(sydney, "2026-10-10T17:00", laterNow);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.instant.toISOString()).toBe("2026-10-10T06:00:00.000Z");
  });

  it("rejects the hour that does not exist at spring-forward", () => {
    // 02:00-02:59 on 4 Oct 2026 never happens in Sydney. There is no instant to
    // return, so the only honest answer is a refusal.
    const open: SchedulingConfig = {
      ...sydney,
      openingHours: [{ day: 6, opens: "00:00", closes: "23:45" }],
      leadMinutes: 0,
    };
    const r = validateScheduledForConfig(open, "2026-10-04T02:30", SYD_NOW);
    expect(r.ok).toBe(false);
  });

  it("never OFFERS the nonexistent hour either", () => {
    // The half that was missing. The validator always refused 02:30; the picker
    // used the unguarded conversion and listed it anyway.
    const open: SchedulingConfig = {
      ...sydney,
      openingHours: [{ day: 6, opens: "00:00", closes: "23:45" }],
      leadMinutes: 0,
    };
    const sunday = buildPickupSlots(open, SYD_NOW).find(
      (d) => d.date === "2026-10-04",
    );
    expect(sunday?.times ?? []).not.toContain("02:30");
  });

  it("handles the repeated hour at fall-back without offering a dead slot", () => {
    // AEDT ends Sun 5 Apr 2026 (03:00 AEDT -> 02:00 AEST), so 02:00-02:59 occurs
    // TWICE. Both readings exist, so a slot there must be accepted, not refused
    // — the mirror of the spring-forward case and easy to over-correct into.
    const autumn: SchedulingConfig = {
      ...sydney,
      openingHours: [{ day: 6, opens: "00:00", closes: "23:45" }],
      leadMinutes: 0,
    };
    const now = Date.UTC(2026, 3, 3, 22, 0); // Fri 4 Apr, 09:00 Sydney
    const r = validateScheduledForConfig(autumn, "2026-04-05T02:30", now);
    expect(r.ok).toBe(true);
  });
});
