import { describe, expect, it } from "vitest";

import {
  buildBookingSlots,
  fitsCapacity,
  validateBookingRequest,
  type BookingConfig,
} from "./availability";

/**
 * Booking availability. The public form is anonymous, so this module is the only
 * thing standing between a crafted request and a table held for nobody — and the
 * capacity arithmetic is the part that is quietly wrong if it is wrong at all.
 *
 * Times are Brisbane (UTC+10, no DST) so the expected instants are unambiguous.
 */
const HOURS = [
  // Monday-Sunday, 09:00-17:00. mondayZero weekday indexing, matching
  // lib/schedule.ts's OpeningHoursEntry contract.
  { day: 0, opens: "09:00", closes: "17:00" },
  { day: 1, opens: "09:00", closes: "17:00" },
  { day: 2, opens: "09:00", closes: "17:00" },
  { day: 3, opens: "09:00", closes: "17:00" },
  { day: 4, opens: "09:00", closes: "17:00" },
  { day: 5, opens: "09:00", closes: "17:00" },
  { day: 6, opens: "09:00", closes: "17:00" },
];

const CONFIG: BookingConfig = {
  timeZone: "Australia/Brisbane",
  openingHours: HOURS,
  leadMinutes: 60,
  maxDaysAhead: 30,
  maxPartySize: 12,
  durationMinutes: 90,
};

/** 2026-08-10 is a Monday. 00:00 UTC = 10:00 Brisbane. */
const MONDAY_10AM_BNE = Date.UTC(2026, 7, 10, 0, 0);

describe("validateBookingRequest — party size", () => {
  it("rejects a party larger than the venue's cap", () => {
    const result = validateBookingRequest(
      CONFIG,
      "2026-08-10T14:00",
      13,
      MONDAY_10AM_BNE,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("12");
  });

  it("accepts a party exactly at the cap", () => {
    const result = validateBookingRequest(
      CONFIG,
      "2026-08-10T14:00",
      12,
      MONDAY_10AM_BNE,
    );
    expect(result.ok).toBe(true);
  });

  it("rejects zero, negative and fractional parties", () => {
    for (const size of [0, -3, 2.5]) {
      const result = validateBookingRequest(
        CONFIG,
        "2026-08-10T14:00",
        size,
        MONDAY_10AM_BNE,
      );
      expect(result.ok, `party size ${size}`).toBe(false);
    }
  });
});

describe("validateBookingRequest — time", () => {
  it("resolves a venue-local wall clock to the right absolute instant", () => {
    const result = validateBookingRequest(
      CONFIG,
      "2026-08-10T14:00",
      2,
      MONDAY_10AM_BNE,
    );
    expect(result.ok).toBe(true);
    // 14:00 Brisbane == 04:00 UTC. Pinning the INSTANT is the point: storing a
    // local string would make this booking mean different moments to different
    // readers.
    if (result.ok) {
      expect(result.instant.toISOString()).toBe("2026-08-10T04:00:00.000Z");
    }
  });

  it("rejects a time inside the lead window", () => {
    // 10:30 is only 30 minutes out; the venue needs 60.
    const result = validateBookingRequest(
      CONFIG,
      "2026-08-10T10:30",
      2,
      MONDAY_10AM_BNE,
    );
    expect(result.ok).toBe(false);
  });

  it("rejects a time outside opening hours", () => {
    const result = validateBookingRequest(
      CONFIG,
      "2026-08-10T21:00",
      2,
      MONDAY_10AM_BNE,
    );
    expect(result.ok).toBe(false);
  });

  it("rejects a time beyond the horizon", () => {
    const result = validateBookingRequest(
      CONFIG,
      "2026-12-25T12:00",
      2,
      MONDAY_10AM_BNE,
    );
    expect(result.ok).toBe(false);
  });

  it("rejects a malformed wall clock rather than guessing", () => {
    const result = validateBookingRequest(
      CONFIG,
      "not-a-time",
      2,
      MONDAY_10AM_BNE,
    );
    expect(result.ok).toBe(false);
  });
});

describe("buildBookingSlots", () => {
  it("only offers times the validator accepts", () => {
    // The contract that makes the picker trustworthy: every slot it shows must
    // survive the server gate, or a diner picks a time and is then refused.
    const days = buildBookingSlots(CONFIG, MONDAY_10AM_BNE);
    expect(days.length).toBeGreaterThan(0);
    for (const day of days) {
      for (const time of day.times) {
        const result = validateBookingRequest(
          CONFIG,
          `${day.date}T${time}`,
          2,
          MONDAY_10AM_BNE,
        );
        expect(result.ok, `${day.date}T${time} should be bookable`).toBe(true);
      }
    }
  });

  it("offers nothing when the venue has no opening hours", () => {
    expect(
      buildBookingSlots({ ...CONFIG, openingHours: null }, MONDAY_10AM_BNE),
    ).toEqual([]);
  });
});

describe("fitsCapacity", () => {
  const at = (hoursFromBase: number) =>
    MONDAY_10AM_BNE + hoursFromBase * 3_600_000;

  it("allows anything when capacity is unknown (no tables configured)", () => {
    // Deliberate: an unknown limit must not silently refuse real customers.
    expect(fitsCapacity(CONFIG, 0, [], at(4), 50)).toBe(true);
  });

  it("rejects a party larger than the whole venue", () => {
    expect(fitsCapacity(CONFIG, 10, [], at(4), 11)).toBe(false);
  });

  it("allows a booking that fits alongside an overlapping one", () => {
    const existing = [{ bookedForMs: at(4), partySize: 4 }];
    expect(fitsCapacity(CONFIG, 10, existing, at(4), 6)).toBe(true);
  });

  it("rejects a booking that would exceed capacity at the same time", () => {
    const existing = [{ bookedForMs: at(4), partySize: 6 }];
    expect(fitsCapacity(CONFIG, 10, existing, at(4), 6)).toBe(false);
  });

  it("ignores bookings that do not overlap", () => {
    // 90-minute sittings: 12:00 and 14:00 never share a moment.
    const existing = [{ bookedForMs: at(2), partySize: 10 }];
    expect(fitsCapacity(CONFIG, 10, existing, at(4), 10)).toBe(true);
  });

  it("treats a booking ending exactly as another starts as NOT overlapping", () => {
    // at(4) + 90min == at(5.5). A sitting starting then is a clean handover.
    const existing = [{ bookedForMs: at(4), partySize: 10 }];
    expect(fitsCapacity(CONFIG, 10, existing, at(5.5), 10)).toBe(true);
  });

  it("catches a collision in the MIDDLE of an earlier sitting", () => {
    // The case a start-instant-only check misses: the request starts clear of
    // the first booking's start, but both are seated together from 13:00.
    const existing = [
      { bookedForMs: at(3), partySize: 6 }, // 13:00-14:30
    ];
    // 14:00 request overlaps 14:00-14:30 of the above.
    expect(fitsCapacity(CONFIG, 10, existing, at(4), 6)).toBe(false);
  });

  it("evaluates every rise in occupancy, not just the request's own start", () => {
    // Request at 13:00 for 4 (capacity 10). Alone with either neighbour it fits;
    // at 14:00 all three are seated (4+3+4 = 11) and it does not.
    const existing = [
      { bookedForMs: at(3.5), partySize: 3 },
      { bookedForMs: at(4), partySize: 4 },
    ];
    expect(fitsCapacity(CONFIG, 10, existing, at(3), 4)).toBe(false);
  });

  it("allows exactly filling capacity", () => {
    const existing = [{ bookedForMs: at(4), partySize: 6 }];
    expect(fitsCapacity(CONFIG, 10, existing, at(4), 4)).toBe(true);
  });
});
