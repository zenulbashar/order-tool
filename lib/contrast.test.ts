import { describe, expect, it } from "vitest";

import {
  contrastRatio,
  formatContrastRatio,
  meetsContrastAA,
  meetsSurfaceContrastAA,
  parseHexColor,
  relativeLuminance,
  SURFACE_ELEVATED,
  SURFACE_PAGE,
  surfaceContrast,
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

/**
 * Surface contrast — the pairing that actually renders (UI audit P2-10).
 *
 * `brandTextColor` overrides `--color-ink` (app/[slug]/brand-style.ts), so it is
 * the venue's BODY TEXT on the cream page. The gate it replaced compared it to
 * the BRAND, which text is never painted on — and that inversion waved through
 * precisely the worst case.
 */
describe("surfaceContrast", () => {
  it("catches the case the brand-paired gate waved through", () => {
    const brand = "#111827"; // the schema default
    const text = "#f5f5f0"; // near-white

    // What the old gate measured: comfortably over AA, so it passed.
    expect(contrastRatio(text, brand)!).toBeGreaterThan(WCAG_AA_NORMAL);
    // What the diner actually sees: invisible.
    expect(surfaceContrast(text)!).toBeLessThan(1.2);
    expect(meetsSurfaceContrastAA(text)).toBe(false);
  });

  it("returns the WORSE of the two page surfaces", () => {
    // Cream page and elevated cards differ, so a colour has to clear both; the
    // helper must not report the flattering one.
    const text = "#767066";
    const onPage = contrastRatio(text, SURFACE_PAGE)!;
    const onElevated = contrastRatio(text, SURFACE_ELEVATED)!;
    expect(surfaceContrast(text)).toBe(Math.min(onPage, onElevated));
    expect(onPage).not.toBe(onElevated);
  });

  it("still accepts a readable dark text colour", () => {
    expect(meetsSurfaceContrastAA("#1d2b22")).toBe(true);
    expect(meetsSurfaceContrastAA("#0e1f18")).toBe(true);
  });

  it("fails closed on an unparseable colour", () => {
    expect(surfaceContrast("not-a-colour")).toBeNull();
    expect(meetsSurfaceContrastAA("not-a-colour")).toBe(false);
  });

  it("large-text threshold is what gates a derived brand accent", () => {
    // uploadVenueLogo holds the logo-derived brand to AA_LARGE, since the accent
    // is used at display sizes and as a fill. A near-cream dominant must still
    // be rejected — that is the case the old luminance band half-covered.
    expect(meetsSurfaceContrastAA("#f5f2e8", WCAG_AA_LARGE)).toBe(false);
    expect(meetsSurfaceContrastAA("#8a3324", WCAG_AA_LARGE)).toBe(true);
  });
});
