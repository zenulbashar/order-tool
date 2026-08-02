import { describe, expect, it } from "vitest";

import {
  buttonStyles,
  denseButtonStyles,
} from "@/app/_components/button-variants";

/**
 * The dense row-action recipe (audit D4).
 *
 * Thirteen hand-written copies of this button existed across the admin console
 * and the owner lists, and two had already drifted to `font-semibold`. The
 * recipe now owns it — so these tests pin the two things a future edit could
 * quietly break.
 */

const set = (s: string) => new Set(s.split(/\s+/).filter(Boolean));

describe("denseButtonStyles", () => {
  it("emits exactly what the hand-written copies did", () => {
    // The literal that appeared six times, verbatim. If the recipe drifts from
    // it, every admin table changes at once and nothing else would say so.
    expect(set(denseButtonStyles())).toEqual(
      set(
        "rounded-control border border-line-strong px-3 py-1.5 text-xs " +
          "font-bold text-ink transition hover:bg-hover-secondary",
      ),
    );
  });

  it("xs is the denser padding, and nothing else changes", () => {
    const sm = set(denseButtonStyles());
    const xs = set(denseButtonStyles({ size: "xs" }));
    const added = [...xs].filter((c) => !sm.has(c)).sort();
    const removed = [...sm].filter((c) => !xs.has(c)).sort();
    expect(added).toEqual(["px-2.5", "py-1"]);
    expect(removed).toEqual(["px-3", "py-1.5"]);
  });

  it("padding REPLACES the size's rather than joining it", () => {
    // cx is a plain joiner, not tailwind-merge. If padding ever appends, a call
    // site emits two px-* utilities and stylesheet order silently decides the
    // width — the same trap controlClass documents.
    const out = denseButtonStyles({ padding: "px-3 py-1" });
    expect(out).toContain("px-3");
    expect(out).toContain("py-1");
    expect(out).not.toContain("px-2.5");
    expect(out).not.toContain("py-1.5");
  });

  it("solid drops the outline instead of stacking on it", () => {
    const solid = set(denseButtonStyles({ variant: "solid" }));
    expect(solid).toContain("bg-[var(--action)]");
    expect(solid).not.toContain("border");
    expect(solid).not.toContain("border-line-strong");
  });

  it("elevated applies to the outline variant only", () => {
    expect(denseButtonStyles({ elevated: true })).toContain("bg-surface-elevated");
    // A solid button already has a fill; adding the surface would fight it.
    expect(denseButtonStyles({ variant: "solid", elevated: true })).not.toContain(
      "bg-surface-elevated",
    );
  });

  it("stays distinct from buttonStyles' smallest size", () => {
    // The reason this recipe exists rather than being buttonStyles("_","xs"):
    // buttonStyles sizes by HEIGHT to hold the touch-target floor. Adopting it
    // for inline table actions would grow every admin row. If someone later
    // gives buttonStyles a height-free size, this guard says so.
    expect(buttonStyles("secondary", "sm")).toContain("h-9");
    expect(denseButtonStyles()).not.toMatch(/\bh-\d/);
  });
});
