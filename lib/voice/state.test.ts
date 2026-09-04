import { describe, expect, it } from "vitest";

import { decodeVoiceState, encodeVoiceState, MAX_TURNS } from "./state";

describe("voice call state token", () => {
  it("round-trips recent turns and the working basket", () => {
    const state = {
      turns: [
        { role: "user" as const, content: "Two pork bao please" },
        { role: "assistant" as const, content: "Mild or hot?" },
      ],
      basket: [{ itemId: "itm_pork", variantId: null, selectedOptionIds: ["opt_hot"], quantity: 2 }],
    };
    const token = encodeVoiceState(state);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeVoiceState(token)).toEqual(state);
  });

  it("keeps only the most recent turns and truncates long ones", () => {
    const turns = Array.from({ length: MAX_TURNS + 4 }, (_, i) => ({
      role: "user" as const,
      content: `turn ${i} ` + "x".repeat(1000),
    }));
    const decoded = decodeVoiceState(encodeVoiceState({ turns, basket: [] }));
    expect(decoded.turns).toHaveLength(MAX_TURNS);
    expect(decoded.turns[0].content.startsWith(`turn 4 `)).toBe(true);
    expect(decoded.turns[0].content.length).toBeLessThanOrEqual(400);
  });

  it("treats a missing, malformed or oversized token as a fresh call", () => {
    expect(decodeVoiceState(null)).toEqual({ turns: [], basket: [] });
    expect(decodeVoiceState("%%%")).toEqual({ turns: [], basket: [] });
    expect(decodeVoiceState(Buffer.from("[1,2]").toString("base64url"))).toEqual({ turns: [], basket: [] });
    expect(decodeVoiceState("a".repeat(20_000))).toEqual({ turns: [], basket: [] });
  });
});
