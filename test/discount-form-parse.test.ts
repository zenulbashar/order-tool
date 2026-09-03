import { describe, expect, it } from "vitest";

import { parseDiscountForm } from "@/app/dashboard/discounts/parse";

// The "Ends" date is a day on the VENUE's calendar; every case here is Brisbane (UTC+10).
const TZ = "Australia/Brisbane";
const parse = (formData: FormData) => parseDiscountForm(formData, TZ);

/**
 * The owner-discount form parser (audit R3).
 *
 * This exists as a shared module because the edit path added a SECOND caller
 * for every money rule here. The rules are the interesting part — a percentage
 * over 100, a dollar amount that rounds to zero cents, a negative minimum spend
 * — and each is now asserted once and enforced on both paths by construction.
 *
 * Drives the real parser, not a restatement of it.
 */

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const VALID = { name: "Launch week", code: "LAUNCH10", type: "percent", value: "10" };

describe("parseDiscountForm", () => {
  it("accepts a minimal valid percent discount", () => {
    const result = parse(form(VALID));
    expect(result).toEqual({
      ok: true,
      value: {
        name: "Launch week",
        code: "LAUNCH10",
        type: "percent",
        value: 10,
        minBasketCents: 0,
        audience: "all",
        endsAt: null,
      },
    });
  });

  it("uppercases the code and trims the name", () => {
    const result = parse(
      form({ ...VALID, name: "  Spring  ", code: "spring5" }),
    );
    expect(result.ok && result.value.code).toBe("SPRING5");
    expect(result.ok && result.value.name).toBe("Spring");
  });

  it("stores a dollar discount in CENTS and a percent as a whole number", () => {
    const amount = parse(form({ ...VALID, type: "amount", value: "5.50" }));
    expect(amount.ok && amount.value.value).toBe(550);

    const percent = parse(form({ ...VALID, type: "percent", value: "12.4" }));
    expect(percent.ok && percent.value.value).toBe(12);
  });

  it("rejects a percentage over 100", () => {
    const result = parse(form({ ...VALID, value: "200" }));
    expect(result).toEqual({ ok: false, error: "A percentage can’t be over 100." });
  });

  it("rejects a dollar amount that rounds down to zero cents", () => {
    // The DB's value>0 check would also reject this, but the generic catch
    // around the insert mislabels every failure as a duplicate code — so it has
    // to be caught here to produce the right message.
    const result = parse(form({ ...VALID, type: "amount", value: "0.004" }));
    expect(result).toEqual({ ok: false, error: "Enter a discount value above 0." });
  });

  it("rejects a negative minimum spend", () => {
    const result = parse(form({ ...VALID, minBasket: "-5" }));
    expect(result).toEqual({ ok: false, error: "Minimum spend can’t be negative." });
  });

  it("treats a blank minimum spend as zero, not NaN", () => {
    const result = parse(form({ ...VALID, minBasket: "" }));
    expect(result.ok && result.value.minBasketCents).toBe(0);
  });

  it("rejects a non-numeric value", () => {
    const result = parse(form({ ...VALID, value: "ten" }));
    expect(result).toEqual({ ok: false, error: "Enter a discount value above 0." });
  });

  it.each([
    ["", "empty"],
    ["AB", "too short"],
    ["A".repeat(25), "too long"],
    ["LAUNCH 10", "contains a space"],
    ["LAUNCH-10", "contains punctuation"],
  ])("rejects the code %j (%s)", (code) => {
    const result = parse(form({ ...VALID, code }));
    expect(result.ok).toBe(false);
  });

  it("rejects a name over 80 characters", () => {
    const result = parse(form({ ...VALID, name: "x".repeat(81) }));
    expect(result.ok).toBe(false);
  });

  it("rejects an unparseable end date rather than storing an Invalid Date", () => {
    const result = parse(form({ ...VALID, endsAt: "not-a-date" }));
    expect(result).toEqual({ ok: false, error: "Enter a valid end date." });
  });

  it("parses a valid end date and leaves a blank one null", () => {
    const set = parse(form({ ...VALID, endsAt: "2026-12-24" }));
    expect(set.ok && set.value.endsAt?.toISOString()).toBe("2026-12-24T13:59:59.999Z");

    const blank = parse(form({ ...VALID, endsAt: "" }));
    expect(blank.ok && blank.value.endsAt).toBeNull();
  });

  it("defaults unknown enum inputs to the safe option", () => {
    // Both come off a <select>, but a server action takes whatever is POSTed.
    // "amount" and "new" are the permissive choices, so anything unrecognised
    // has to fall to percent / all rather than through.
    const result = parse(
      form({ ...VALID, type: "bogus", audience: "bogus" }),
    );
    expect(result.ok && result.value.type).toBe("percent");
    expect(result.ok && result.value.audience).toBe("all");
  });
});
