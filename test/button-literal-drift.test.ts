import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Copy-pasted button styling (audit D4).
 *
 * D4 said "one-off buttons re-implement buttonStyles". Measuring it found
 * something more specific and more actionable: of 90 button-shaped class
 * literals in app/, **38 were exact duplicates of another** — 13 clusters, the
 * largest repeated nine times. Two members of one cluster had already drifted to
 * `font-semibold` while the rest stayed `font-bold`, which is the whole failure
 * mode in one line.
 *
 * The clusters are gone: extracted to shared chrome components (<StockNav>,
 * <MarketingHeader>), shared recipes (denseButtonStyles, iconButtonStyles,
 * inkPillStyles) or file-local consts where the pattern belongs to one flow.
 *
 * This test pins the RULE — no button literal may appear twice — rather than the
 * inventory. The remaining ~50 singletons are deliberately untouched: a button
 * written once is not duplication, and forcing bespoke marketing and storefront
 * buttons through the owner design system would flatten a distinction the app
 * makes on purpose. What must not happen is a second copy of any of them.
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

type Site = { file: string; line: number };

/**
 * Every `className="…"` literal sitting on a <button>, <Link> or <a> opening
 * tag that looks like a button: it has a radius AND a padding or explicit
 * height. Keyed by the SORTED token set, so two copies that differ only in the
 * order they were typed still count as the same literal.
 */
function buttonLiterals(): Map<string, Site[]> {
  const byKey = new Map<string, Site[]>();
  for (const file of tsxFiles(join(ROOT, "app"))) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/className="([^"]*)"/g)) {
      const tokens = m[1].split(/\s+/).filter(Boolean);
      const hasRadius = tokens.some((t) => t.startsWith("rounded"));
      const hasBox = tokens.some((t) => /^p[xy]?-/.test(t) || /^h-\d/.test(t));
      if (!hasRadius || !hasBox) continue;

      const before = src.slice(0, m.index);
      const tagStart = Math.max(
        before.lastIndexOf("<button"),
        before.lastIndexOf("<Link"),
        before.lastIndexOf("<a "),
      );
      if (tagStart < 0) continue;
      // A '>' between the tag and the attribute means we've walked past the
      // opening tag into a child element — not this button's className.
      if (src.slice(tagStart, m.index).includes(">")) continue;

      const key = [...new Set(tokens)].sort().join(" ");
      const site = {
        file: file.replace(ROOT + "/", ""),
        line: before.split("\n").length,
      };
      byKey.set(key, [...(byKey.get(key) ?? []), site]);
    }
  }
  return byKey;
}

describe("button styling is not copy-pasted", () => {
  const literals = buttonLiterals();

  it("finds the button literals it claims to", () => {
    // Guards the derivation. A regex that stops matching would make the rule
    // below pass while checking nothing — the failure mode this whole audit
    // keeps running into.
    expect(literals.size).toBeGreaterThan(30);
  });

  it("no button class literal is written twice", () => {
    const duplicated = [...literals.entries()]
      .filter(([, sites]) => sites.length > 1)
      .map(([, sites]) => `${sites.length}x ${sites.map((s) => `${s.file}:${s.line}`).join(", ")}`)
      .sort();

    expect(
      duplicated,
      "these buttons share a class literal — give them one source of truth " +
        "(a shared recipe in app/_components/button-variants.ts, a chrome " +
        "component, or a const local to the flow) so the copies cannot drift",
    ).toEqual([]);
  });
});
