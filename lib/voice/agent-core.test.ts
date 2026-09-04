import { describe, expect, it } from "vitest";

import { buildVenueContext, parseVoiceAgentOutput } from "./agent-core";

describe("phone agent output parsing", () => {
  it("normalises a valid reply, de-duplicating option ids", () => {
    expect(
      parseVoiceAgentOutput({
        reply: "Two pork bao, hot. Anything else?",
        basket: [{ itemId: "itm_pork", variantId: null, optionIds: ["opt_hot", "opt_hot"], quantity: 2 }],
        sendLink: false,
        hangUp: false,
      }),
    ).toEqual({
      reply: "Two pork bao, hot. Anything else?",
      basket: [{ itemId: "itm_pork", variantId: null, selectedOptionIds: ["opt_hot"], quantity: 2 }],
      sendLink: false,
      hangUp: false,
    });
  });

  it("refuses malformed output rather than speaking it", () => {
    expect(parseVoiceAgentOutput(null)).toBeNull();
    expect(parseVoiceAgentOutput({ reply: "", basket: [], sendLink: false, hangUp: false })).toBeNull();
    expect(
      parseVoiceAgentOutput({ reply: "ok", basket: [{ itemId: "x", variantId: null, optionIds: [], quantity: 0 }], sendLink: false, hangUp: false }),
    ).toBeNull();
    expect(parseVoiceAgentOutput({ reply: "ok", basket: [], sendLink: "yes", hangUp: false })).toBeNull();
  });
});

describe("venue context for the phone agent", () => {
  it("states open/closed now, the weekly hours, and whether ordering is possible", () => {
    const context = buildVenueContext({
      name: "Harbour Bao",
      description: "Steamed buns by the beach.",
      address: "1 Beach Rd, Manly NSW",
      acceptsOrders: false,
      hours: {
        timeZone: "Australia/Sydney",
        openNow: false,
        today: { day: "Sunday", ranges: [] },
        week: [
          { day: "Monday", ranges: [{ opens: "11:00", closes: "21:00" }] },
          { day: "Sunday", ranges: [] },
        ],
      },
      faqs: [{ question: "Parking?", answer: "Street parking on Beach Rd." }],
    });
    expect(context).toContain("CLOSED (Sunday");
    expect(context).toContain("Monday: 11:00-21:00; Sunday: closed");
    expect(context).toContain("NOT available");
    expect(context).toContain("Q: Parking? A: Street parking on Beach Rd.");
  });
});
