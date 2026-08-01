import { describe, expect, it } from "vitest";

import {
  contrastRatio,
  formatContrastRatio,
  meetsContrastAA,
  parseHexColor,
  relativeLuminance,
  WCAG_AA_LARGE,
  WCAG_AA_NORMAL,
} from "@/lib/contrast";

/**
 * WCAG contrast maths (M7 / audit F10). The reference values below are the
 * ones WCAG itself fixes: black-on-white is exactly 21:1, and any colour
 * against itself is exactly 1:1.
 */

describe("parseHexColor", () => {
  it("accepts long, short, and hash-less forms", () => {
    expect(parseHexColor("#ffffff")).toEqual([255, 255, 255]);
    expect(parseHexColor("000000")).toEqual([0, 0, 0]);
    expect(parseHexColor("#f00")).toEqual([255, 0, 0]);
    expect(parseHexColor("  #AABBCC  ")).toEqual([170, 187, 204]);
  });

  it("rejects anything that isn't a hex colour", () => {
    for (const bad of ["", "#12345", "#ggg", "red", "rgb(0,0,0)", "#1234567"]) {
      expect(parseHexColor(bad), bad).toBeNull();
    }
  });
});

describe("relativeLuminance", () => {
  it("matches the WCAG endpoints", () => {
    expect(relativeLuminance([0, 0, 0])).toBe(0);
    expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1, 10);
  });
});

describe("contrastRatio", () => {
  it("is exactly 21:1 for black on white", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 10);
  });

  it("is exactly 1:1 for a colour against itself", () => {
    expect(contrastRatio("#7A5AF8", "#7A5AF8")).toBeCloseTo(1, 10);
  });

  it("is symmetric — order of arguments doesn't matter", () => {
    const a = contrastRatio("#7A5AF8", "#FFFDF8");
    const b = contrastRatio("#FFFDF8", "#7A5AF8");
    expect(a).toBeCloseTo(b!, 10);
  });

  it("returns null rather than a misleading number for bad input", () => {
    expect(contrastRatio("not-a-colour", "#ffffff")).toBeNull();
    expect(contrastRatio("#ffffff", "")).toBeNull();
  });
});

describe("meetsContrastAA — the publish gate", () => {
  it("passes a readable pairing", () => {
    // Ink on cream: the design system's own body pairing.
    expect(meetsContrastAA("#16241C", "#FFFDF8")).toBe(true);
  });

  it("fails the pairing a venue must not be able to publish", () => {
    // Pale yellow text on white — the classic unreadable brand choice.
    expect(meetsContrastAA("#F4D03F", "#FFFFFF")).toBe(false);
    // Mid-grey on white sits just under 4.5:1.
    expect(meetsContrastAA("#999999", "#FFFFFF")).toBe(false);
  });

  it("honours the large-text threshold when asked", () => {
    // #949494 on white is ~3.1:1 — fails normal text, passes large text.
    expect(meetsContrastAA("#949494", "#FFFFFF", WCAG_AA_NORMAL)).toBe(false);
    expect(meetsContrastAA("#949494", "#FFFFFF", WCAG_AA_LARGE)).toBe(true);
  });

  it("treats an unparseable colour as failing, never as passing", () => {
    // Fail CLOSED: a colour we can't measure must not be publishable.
    expect(meetsContrastAA("garbage", "#FFFFFF")).toBe(false);
  });
});

describe("formatContrastRatio", () => {
  it("renders one decimal for the operator message", () => {
    expect(formatContrastRatio(4.4999)).toBe("4.5:1");
    expect(formatContrastRatio(21)).toBe("21.0:1");
  });
});
