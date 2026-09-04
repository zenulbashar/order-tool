import { describe, expect, it } from "vitest";

import { summariseHours, venueClock } from "./hours";

describe("hours summary for agents", () => {
  // Mon–Fri 11:00–14:30 and 17:00–21:00; Saturday 17:00–22:00; Sunday closed.
  const hours = [
    ...[0, 1, 2, 3, 4].flatMap((day) => [
      { day, opens: "11:00", closes: "14:30" },
      { day, opens: "17:00", closes: "21:00" },
    ]),
    { day: 5, opens: "17:00", closes: "22:00" },
  ];

  it("reads the venue's weekday and minute in its own zone (0 = Monday)", () => {
    // 2026-03-04 is a Wednesday. 02:15 UTC = 12:15 Brisbane (UTC+10).
    expect(venueClock(new Date("2026-03-04T02:15:00Z"), "Australia/Brisbane")).toEqual({
      weekday: 2,
      minute: 12 * 60 + 15,
    });
    // The same instant is still Tuesday evening in Los Angeles.
    expect(venueClock(new Date("2026-03-04T02:15:00Z"), "America/Los_Angeles").weekday).toBe(1);
  });

  it("says open during a range and closed between ranges, in venue time", () => {
    const lunch = summariseHours(hours, "Australia/Brisbane", new Date("2026-03-04T02:15:00Z"));
    expect(lunch.openNow).toBe(true);
    expect(lunch.today.day).toBe("Wednesday");
    // 15:30 Brisbane = 05:30 UTC — between lunch and dinner.
    const gap = summariseHours(hours, "Australia/Brisbane", new Date("2026-03-04T05:30:00Z"));
    expect(gap.openNow).toBe(false);
    expect(gap.today.ranges).toEqual([
      { opens: "11:00", closes: "14:30" },
      { opens: "17:00", closes: "21:00" },
    ]);
  });

  it("is closed at the closing minute itself and on a day with no ranges", () => {
    // 21:00 Brisbane Wednesday = 11:00 UTC.
    expect(summariseHours(hours, "Australia/Brisbane", new Date("2026-03-04T11:00:00Z")).openNow).toBe(false);
    // Sunday 2026-03-08 midday Brisbane = 02:00 UTC.
    const sunday = summariseHours(hours, "Australia/Brisbane", new Date("2026-03-08T02:00:00Z"));
    expect(sunday.today).toEqual({ day: "Sunday", ranges: [] });
    expect(sunday.openNow).toBe(false);
  });

  it("drops malformed or inverted ranges rather than trusting them", () => {
    const summary = summariseHours(
      [{ day: 0, opens: "25:00", closes: "26:00" }, { day: 0, opens: "18:00", closes: "12:00" }],
      "Australia/Brisbane",
      new Date("2026-03-02T02:00:00Z"),
    );
    expect(summary.week[0].ranges).toEqual([]);
    expect(summary.openNow).toBe(false);
  });
});
