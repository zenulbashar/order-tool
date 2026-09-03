import { describe, expect, it } from "vitest";

import {
  dayBoundsInTimeZone,
  formatVenueTime,
  timeZoneForAustralianState,
} from "./time";

describe("formatVenueTime", () => {
  it("renders in the venue timezone, not the server's UTC", () => {
    // 02:30 UTC = 12:30 in Brisbane (UTC+10, no DST).
    const out = formatVenueTime(
      new Date(Date.UTC(2026, 0, 5, 2, 30)),
      "Australia/Brisbane",
    );
    expect(out).toMatch(/12:30/);
    expect(out).toMatch(/Jan/);
    expect(out).toMatch(/[ap]m/i);
    expect(out).not.toMatch(/UTC/);
  });

  it("falls back to a labelled UTC render on a malformed timezone (never throws)", () => {
    const out = formatVenueTime(
      new Date(Date.UTC(2026, 0, 5, 2, 30)),
      "Not/AZone",
    );
    expect(out).toMatch(/UTC$/);
    expect(out).toMatch(/2:30/); // the underlying UTC time
  });
});

describe("dayBoundsInTimeZone", () => {
  it("ends a Brisbane date at the END of that day there, not 10am", () => {
    // A code advertised "until 15 March" must still work at 9pm on the 15th.
    const bounds = dayBoundsInTimeZone("2026-03-15", "Australia/Brisbane");
    expect(bounds?.start.toISOString()).toBe("2026-03-14T14:00:00.000Z");
    expect(bounds?.end.toISOString()).toBe("2026-03-15T13:59:59.999Z");
  });

  it("honours daylight saving in the venue's zone", () => {
    // Sydney is UTC+11 in January.
    const jan = dayBoundsInTimeZone("2026-01-10", "Australia/Sydney");
    expect(jan?.start.toISOString()).toBe("2026-01-09T13:00:00.000Z");
    // …and UTC+10 in June.
    const jun = dayBoundsInTimeZone("2026-06-10", "Australia/Sydney");
    expect(jun?.start.toISOString()).toBe("2026-06-09T14:00:00.000Z");
  });

  it("differs from the UTC-midnight reading the form used to get", () => {
    const utcMidnight = new Date("2026-03-15").getTime();
    const bounds = dayBoundsInTimeZone("2026-03-15", "Australia/Brisbane");
    expect(bounds?.start.getTime()).not.toBe(utcMidnight);
    expect(bounds?.end.getTime()).toBeGreaterThan(utcMidnight);
  });

  it("rejects malformed and impossible dates and unknown zones", () => {
    expect(dayBoundsInTimeZone("15/03/2026", "Australia/Brisbane")).toBeNull();
    expect(dayBoundsInTimeZone("2026-02-30", "Australia/Brisbane")).toBeNull();
    expect(dayBoundsInTimeZone("", "Australia/Brisbane")).toBeNull();
    expect(dayBoundsInTimeZone("2026-03-15", "Mars/Olympus")).toBeNull();
  });
});

describe("timeZoneForAustralianState", () => {
  it("maps each state and territory, by abbreviation or name, any case", () => {
    expect(timeZoneForAustralianState("NSW")).toBe("Australia/Sydney");
    expect(timeZoneForAustralianState("new south wales")).toBe("Australia/Sydney");
    expect(timeZoneForAustralianState("Vic")).toBe("Australia/Melbourne");
    expect(timeZoneForAustralianState("QLD")).toBe("Australia/Brisbane");
    expect(timeZoneForAustralianState("S.A.")).toBe("Australia/Adelaide");
    expect(timeZoneForAustralianState("WA")).toBe("Australia/Perth");
    expect(timeZoneForAustralianState("Tasmania")).toBe("Australia/Hobart");
    expect(timeZoneForAustralianState("NT")).toBe("Australia/Darwin");
    expect(timeZoneForAustralianState("ACT")).toBe("Australia/Sydney");
  });

  it("returns null rather than guess for anything else", () => {
    expect(timeZoneForAustralianState("Auckland")).toBeNull();
    expect(timeZoneForAustralianState("")).toBeNull();
    expect(timeZoneForAustralianState(null)).toBeNull();
  });
});
