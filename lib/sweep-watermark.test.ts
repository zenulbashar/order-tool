import { describe, expect, it } from "vitest";

import { resolveLookback } from "@/lib/sweep-watermark";

const HOUR = 60 * 60 * 1000;
const FLOOR = 72 * HOUR;
const MARGIN = 24 * HOUR;
const NOW = 1_800_000_000_000;

describe("resolveLookback", () => {
  it("falls back to the 72h floor when no watermark exists (first run)", () => {
    const since = resolveLookback({ watermark: null, floorMs: FLOOR, nowMs: NOW });
    expect(since.getTime()).toBe(NOW - FLOOR);
  });

  it("keeps the floor when the watermark is recent — never narrower than today", () => {
    // Healthy steady state: last successful sweep ~24h ago. Watermark − margin
    // is 48h ago, but the 72h floor is wider and must win.
    const watermark = new Date(NOW - 24 * HOUR);
    const since = resolveLookback({ watermark, floorMs: FLOOR, nowMs: NOW });
    expect(since.getTime()).toBe(NOW - FLOOR);
  });

  it("widens past the floor after an outage longer than the window", () => {
    // Cron dead for 5 days: the fixed window would permanently orphan the gap;
    // the watermark reaches back to the last successful run minus the margin.
    const watermark = new Date(NOW - 5 * 24 * HOUR);
    const since = resolveLookback({ watermark, floorMs: FLOOR, nowMs: NOW });
    expect(since.getTime()).toBe(watermark.getTime() - MARGIN);
    expect(since.getTime()).toBeLessThan(NOW - FLOOR);
  });

  it("applies the confirm-lag margin at the boundary", () => {
    // Watermark exactly at the floor edge: margin must still push the lookback
    // earlier, covering orders created before the sweep but confirmed after.
    const watermark = new Date(NOW - FLOOR);
    const since = resolveLookback({ watermark, floorMs: FLOOR, nowMs: NOW });
    expect(since.getTime()).toBe(NOW - FLOOR - MARGIN);
  });

  it("honours a custom margin", () => {
    const watermark = new Date(NOW - 100 * HOUR);
    const since = resolveLookback({
      watermark,
      floorMs: FLOOR,
      nowMs: NOW,
      marginMs: HOUR,
    });
    expect(since.getTime()).toBe(NOW - 101 * HOUR);
  });
});
