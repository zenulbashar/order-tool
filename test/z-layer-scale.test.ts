import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The layering scale (UI audit RC-1 / P0-1).
 *
 * The reported bug: twelve hand-picked z values, with SIX components sharing
 * `z-40` — both FABs, both AI panels, the sidebar drawer scrim, the integrations
 * drawer and two mobile bottom bars. Equal z resolves by DOM order, and
 * `<SupportWidget>` renders last in the dashboard layout, so the support FAB
 * painted over the open nav drawer and over the primary action of both bottom
 * bars.
 *
 * Two things are pinned here, and the second is the one that would have shipped
 * broken:
 *
 *  1. No raw numeric z-index survives in app/ — every layer names its role.
 *  2. The scale is declared under the `--z-index-*` namespace. Tailwind v4 keys
 *     the `z-*` utilities off `--z-index`, so the natural-looking `--z-raised: 10`
 *     defines a variable that generates NO utility. `z-raised` would then be an
 *     unknown class: no CSS, no error, every layer silently falling back to
 *     `z-index: auto` — strictly worse than the ties it was meant to fix.
 */

const ROOT = process.cwd();

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...tsxFiles(full));
    else if (entry.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const CSS = readFileSync(join(ROOT, "app/globals.css"), "utf8");
const FILES = tsxFiles(join(ROOT, "app"));
const rel = (f: string) => f.replace(ROOT + "/", "");

/** name → numeric value, read from globals.css. */
const SCALE = new Map<string, number>(
  [...CSS.matchAll(/--z-index-([a-z]+)\s*:\s*(\d+)\s*;/g)].map(([, n, v]) => [
    n,
    Number(v),
  ]),
);

describe("z-index layering scale", () => {
  it("declares the scale under the namespace Tailwind actually reads", () => {
    // --z-index-*, NOT --z-*. See the docblock: the wrong namespace emits no
    // utility at all, which fails silently at every call site.
    expect([...SCALE.keys()].sort()).toEqual([
      "chrome",
      "modal",
      "popover",
      "raised",
      "scrim",
      "skip",
      "sticky",
      "toast",
    ]);
  });

  it("orders the layers so a scrim is under its panel and both clear chrome", () => {
    const v = (n: string) => SCALE.get(n)!;
    expect(v("raised")).toBeLessThan(v("sticky"));
    expect(v("sticky")).toBeLessThan(v("chrome"));
    // The reported bug in one assertion: a FAB is chrome, a drawer scrim is
    // scrim, so the FAB can never paint over an open drawer again.
    expect(v("chrome")).toBeLessThan(v("scrim"));
    expect(v("scrim")).toBeLessThan(v("modal"));
    expect(v("modal")).toBeLessThan(v("popover"));
    expect(v("popover")).toBeLessThan(v("toast"));
    expect(v("toast")).toBeLessThan(v("skip"));
  });

  it("finds the component tree it claims to", () => {
    expect(FILES.length).toBeGreaterThan(100);
  });

  it("no component hard-codes a numeric z-index", () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      const src = readFileSync(file, "utf8");
      src.split("\n").forEach((line, i) => {
        // Class-attribute usage only: z-10, z-[100], focus:z-50, lg:z-30.
        for (const [, raw] of line.matchAll(/\bz-(\[?\d+\]?)(?=["'\s`}])/g)) {
          offenders.push(`${rel(file)}:${i + 1} uses z-${raw}`);
        }
      });
    }
    expect(
      offenders.sort(),
      "pick a layer NAME from the scale in app/globals.css (z-raised, z-sticky, " +
        "z-chrome, z-scrim, z-modal, z-popover, z-toast, z-skip). A raw number " +
        "is how six components ended up sharing z-40 and the support FAB " +
        "painted over the nav drawer.",
    ).toEqual([]);
  });
});
