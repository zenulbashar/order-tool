import { describe, expect, it } from "vitest";

import { formatVenueTime } from "./time";

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
