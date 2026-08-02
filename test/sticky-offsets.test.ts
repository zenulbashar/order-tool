import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * One measured sticky offset (UI audit RC-5 / P1-2 / P2-3).
 *
 * Five unrelated constants described one sticky stack, and none matched it:
 *
 *   scroll-mt-[124px]           124   storefront section anchor
 *   scroll-mt-32                128   category sections
 *   rootMargin "-120px"         120   scroll-spy
 *   top-[136px]                 136   cart rail
 *   max-h-[calc(100dvh-156px)]  156   cart rail
 *
 * The real mobile strip is ~150–170px, so every anchor under-shot: tapping a
 * category chip put the heading 25–45px BEHIND the sticky bar, and the spy
 * flipped the active chip a section early. None accounted for the dismissible
 * AnnouncementBar, which changes the height at runtime — which is the part
 * arithmetic can never fix, and the reason this is measured rather than
 * re-tuned.
 *
 * Pinned as a rule: consumers derive from the published variable, and nobody
 * reintroduces a bare pixel offset for the same stack.
 */

const ROOT = process.cwd();
const DINER = join(ROOT, "app", "[slug]");
/*
  The publisher moved to app/_components when the dashboard needed it too
  (R2-1: the support FAB is a sibling of <main>, so its bottom-bar height has to
  be published globally, not set on the page). This test pins the DINER
  consumers, so it reads the hook by path — kept here as one constant rather
  than inline, since the last move broke it.
*/
const HOOK = join(ROOT, "app/_components/use-sticky-metrics.ts");

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...tsxFiles(full));
    else if (entry.endsWith(".tsx") || entry.endsWith(".ts")) out.push(full);
  }
  return out;
}

const FILES = tsxFiles(DINER);
const rel = (f: string) => f.replace(ROOT + "/", "");
const read = (f: string) => readFileSync(f, "utf8");

/**
 * Source with comments blanked out, line numbers preserved.
 *
 * Both checks below need this, and finding that out took two goes: the first
 * version failed on its own documentation (use-sticky-metrics.ts lists all five
 * replaced constants in its docblock), and the fix for that left the
 * publisher check reading the WORD "ResizeObserver" out of a comment — so
 * deleting the actual observer passed. Prose that names a thing is not the
 * thing, in either direction.
 */
function code(file: string): string {
  return read(file)
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, " "));
}

describe("sticky offsets derive from one measured height", () => {
  it("finds the diner tree it claims to", () => {
    expect(FILES.length).toBeGreaterThan(15);
  });

  it("something actually publishes the two metrics", () => {
    // Without a publisher every consumer silently falls back to its default and
    // the whole mechanism is decorative — the assertion below would still pass.
    const hook = code(HOOK);
    expect(hook).toContain("new ResizeObserver");
    expect(hook).toContain("setProperty");

    const users = FILES.filter((f) => /useStickyMetric\s*[<(]/.test(code(f)));
    expect(users.map(rel)).toContain("app/[slug]/storefront.tsx");
  });

  it("every consumer reads the variable, with a fallback for first paint", () => {
    // A var() with no fallback makes the WHOLE calc() invalid before the
    // observer fires, which drops the property entirely rather than degrading.
    const offenders: string[] = [];
    for (const file of FILES) {
      for (const [, name] of code(file).matchAll(
        /var\((--p2e-(?:sticky|header)-h)(,[^)]*)?\)/g,
      )) {
        const full = new RegExp(
          `var\\(${name}(,[^)]*)?\\)`,
          "g",
        );
        for (const m of code(file).matchAll(full)) {
          if (!m[1]) offenders.push(`${rel(file)}: var(${name}) has no fallback`);
        }
      }
    }
    expect([...new Set(offenders)].sort()).toEqual([]);
  });

  it("no bare pixel offset describes the sticky stack any more", () => {
    const BANNED = [
      /scroll-mt-32\b/,
      /scroll-mt-\[124px\]/,
      /top-\[136px\]/,
      /100dvh-156px/,
      /rootMargin:\s*["'`]-1\d\dpx/,
    ];
    const offenders: string[] = [];
    for (const file of FILES) {
      // Comment-stripped: see code() above.
      const src = code(file);
      src.split("\n").forEach((line, i) => {
        for (const re of BANNED) {
          if (re.test(line)) offenders.push(`${rel(file)}:${i + 1}`);
        }
      });
    }
    expect(
      [...new Set(offenders)].sort(),
      "derive from var(--p2e-sticky-h) / var(--p2e-header-h) instead — five " +
        "hand-tuned constants for one stack is how the category anchors ended " +
        "up landing behind the bar they were supposed to clear",
    ).toEqual([]);
  });
});
