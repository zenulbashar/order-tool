import { describe, expect, it } from "vitest";

import { shouldNotifyReady } from "./fulfillment-transition";

describe("shouldNotifyReady", () => {
  it("fires when the kitchen advances an order into ready", () => {
    expect(shouldNotifyReady("preparing", "ready")).toBe(true);
    expect(shouldNotifyReady("new", "ready")).toBe(true);
  });

  it("stays silent on a correction back to ready — the diner was already told", () => {
    // "Back to ready" from Completed used to re-send "your order is ready".
    expect(shouldNotifyReady("completed", "ready")).toBe(false);
  });

  it("stays silent for every other target", () => {
    expect(shouldNotifyReady("ready", "completed")).toBe(false);
    expect(shouldNotifyReady("new", "preparing")).toBe(false);
    expect(shouldNotifyReady("ready", "preparing")).toBe(false);
  });
});
