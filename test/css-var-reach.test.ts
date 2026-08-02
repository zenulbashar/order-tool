import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Custom properties inherit DOWN the tree (UI audit R2-1).
 *
 * `--p2e-bottom-bar-h` was set with an inline style on the page's own
 * `<section>`, which sits inside `<main>`. The support FAB that reads it is a
 * SIBLING of `<main>` in the dashboard layout:
 *
 *   <div class="lg:flex lg:h-dvh">
 *     <Sidebar />
 *     <main>{children}</main>     ← the page section declared the variable here
 *     <SupportWidget />           ← and read it here
 *   </div>
 *
 * So the variable never arrived, `var(…, 0px)` always took the fallback, and the
 * FAB kept sitting on the mobile bottom bar it was supposed to clear — the
 * originally reported bug, still live behind a fix that looked applied and
 * passed four static guards.
 *
 * `--p2e-header-h` failed the same way in the other direction: only the diner
 * storefront published it, so on every owner page the toast viewport read `0px`
 * and landed on the sticky mobile header its own comment cites as the reason it
 * exists (R2-3).
 *
 * Nothing static can see a tree-reachability failure. So the rule is INVERTED
 * into something static that implies it: these metrics are PUBLISHED on
 * documentElement via useStickyMetric, never DECLARED on a component node — and
 * anything read must have a publisher.
 */

const ROOT = process.cwd();

/** Kept in sync with the StickyMetric union in the hook — asserted below. */
const METRICS = ["--p2e-sticky-h", "--p2e-header-h", "--p2e-bottom-bar-h"];

const HOOK = join(ROOT, "app/_components/use-sticky-metrics.ts");

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...tsxFiles(full));
    else if (entry.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const rel = (f: string) => f.replace(ROOT + "/", "");

/** Comments blanked, line numbers preserved — the docblocks name these metrics. */
const code = (f: string) =>
  readFileSync(f, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, " "));

const FILES = tsxFiles(join(ROOT, "app"));

describe("sticky metrics are published, not declared", () => {
  it("finds the tree it claims to", () => {
    expect(FILES.length).toBeGreaterThan(100);
  });

  it("the metric list matches the hook's own union", () => {
    // Otherwise a fourth metric could be added to the hook and silently escape
    // both rules below.
    const hook = code(HOOK);
    for (const metric of METRICS) {
      expect(hook, `${metric} missing from StickyMetric`).toContain(
        `"${metric}"`,
      );
    }
    const declared = [...hook.matchAll(/"(--p2e-[a-z-]+)"/g)].map((m) => m[1]);
    expect([...new Set(declared)].sort()).toEqual([...METRICS].sort());
  });

  it("no component sets a metric in an inline style or arbitrary class", () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      code(file)
        .split("\n")
        .forEach((line, i) => {
          for (const metric of METRICS) {
            // style={{ "--p2e-x": … }} — an inline declaration, which also
            // outranks any stylesheet rule including a `lg:` reset (R2-2).
            const inline = new RegExp(`["']${metric}["']\\s*:`);
            // class [--p2e-x:…] or lg:[--p2e-x:…]
            const arbitrary = new RegExp(`\\[${metric}:`);
            if (inline.test(line) || arbitrary.test(line)) {
              offenders.push(`${rel(file)}:${i + 1} declares ${metric}`);
            }
          }
        });
    }
    expect(
      offenders.sort(),
      "publish with useStickyMetric() instead — it measures the real element " +
        "and sets the property on <html>, so fixed layers OUTSIDE the page " +
        "subtree can read it. A value set on the page's own node does not " +
        "inherit to a sibling of <main>, which is how the reported FAB overlap " +
        "survived the fix that claimed to close it.",
    ).toEqual([]);
  });

  it("every metric that is read is also published somewhere", () => {
    const all = FILES.map(code).join("\n");
    for (const metric of METRICS) {
      if (!all.includes(`var(${metric}`)) continue;
      const published = new RegExp(
        `useStickyMetric<[^>]*>\\(\\s*["']${metric}["']`,
      ).test(all);
      expect(
        published,
        `${metric} is read but nothing publishes it, so every consumer ` +
          `silently takes its fallback — which is how the toast kept landing ` +
          `on the dashboard's sticky mobile header (R2-3).`,
      ).toBe(true);
    }
  });

  it("a measured height is never added to the inset it already contains", () => {
    // Both the FAB and the toast viewport once added env(safe-area-inset-*) AND
    // a measured layer height. A measured bar's box already includes its own
    // safe-area padding, so the notch was counted twice. The inset belongs in
    // the var() FALLBACK — the no-layer case — not beside it.
    const offenders: string[] = [];
    for (const file of FILES) {
      code(file)
        .split("\n")
        .forEach((line, i) => {
          for (const metric of METRICS) {
            if (!line.includes(`var(${metric}`)) continue;
            // An inset OUTSIDE the var()'s parentheses is an addend.
            const withoutVar = line.replace(
              new RegExp(`var\\(${metric}[^)]*\\)`, "g"),
              "",
            );
            if (/env\(safe-area-inset-/.test(withoutVar)) {
              offenders.push(`${rel(file)}:${i + 1} adds an inset beside ${metric}`);
            }
          }
        });
    }
    expect(
      offenders.sort(),
      "put env(safe-area-inset-*) inside the var() as its FALLBACK — a measured " +
        "layer's height already includes its own safe-area padding, so adding " +
        "both double-counts the notch on iOS.",
    ).toEqual([]);
  });
});
