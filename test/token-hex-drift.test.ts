import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Literal hexes that duplicate a design token (audit D5).
 *
 * D5 found literal hex utilities across the shop and landing surfaces. They came
 * off in three passes: 84 that exactly equalled an existing token, 27 more in
 * route groups the finding's scope had missed (/for, /learn), and finally the
 * 146 that had no token at all — which turned out not to need a design decision
 * so much as the observation that they are ONE palette. The marketing routes are
 * a distinct surface, and their colours are now named `--mkt-*` in globals.css.
 *
 * The rule: a literal hex may not spell out a colour something already names.
 * DERIVED from globals.css, so adding a name extends the rule automatically —
 * which is the case that matters, because the usual regression is someone
 * defining a colour and pasting the hex anyway, and any hand-written list of
 * banned hexes would miss precisely the name that didn't exist when it was
 * written.
 *
 * What stays literal is genuinely one-off: ~29 single-use colours, most of them
 * gradient stops inside one marketing animation. A colour used once has no
 * shared meaning to name, and inventing a name would be worse than the literal.
 *
 * On globals.css the naive parse silently returns the WRONG block twice over:
 * `indexOf("@theme")` hits the file's doc comment eight lines above the real
 * rule, and `@theme inline {` is a second block entirely (font tokens that
 * inline a var(), no colours in it). Slicing from either to the next `}` yields
 * a window that is empty or negative-length — and an empty token map makes the
 * assertion below pass while checking nothing.
 *
 * Hence: match a line that STARTS with `@theme {`, then brace-match to its
 * close. Mutation-checked in both directions — pointing the parser at
 * `@theme inline` trips the sanity test. (Degrading the line match alone does
 * NOT, because brace-matching recovers: the doc comment holds no braces, so the
 * scan still lands on the real block. The line anchor is belt to the
 * brace-matcher's braces, not the other way round.)
 */

const ROOT = process.cwd();

/** Brace-matched body of the plain `@theme { … }` block (not `@theme inline`). */
function themeBlock(css: string): string {
  const lines = css.split("\n");
  const startLine = lines.findIndex((l) => /^@theme\s*\{/.test(l.trim()));
  if (startLine < 0) throw new Error("no plain @theme block found");

  const from = lines.slice(0, startLine).join("\n").length + 1;
  let depth = 0;
  for (let i = from; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) return css.slice(from, i);
    }
  }
  throw new Error("unbalanced @theme block");
}

const CSS = readFileSync(join(ROOT, "app/globals.css"), "utf8");

/**
 * A token named for ONE domain is not a name the rest of the app may borrow.
 * `--color-sidebar-muted` and `--color-concierge-thinking` both hold #7fa890,
 * and the marketing footer uses that colour — but writing `text-sidebar-muted`
 * on a landing page trades an honest literal for a misleading name, and reading
 * it later raises the question of why the sidebar is involved. Same for
 * `--color-concierge-amber-ink` on the marketing CTA.
 *
 * So the rule is: a colour counts as NAMED only when some token names it
 * without claiming a domain. Derived, not an allowlist — a new
 * `--color-concierge-*` needs no maintenance here, and the day someone adds a
 * neutral token for one of these values, the rule starts covering it.
 */
const DOMAIN_SCOPED = /^--color-(concierge|sidebar|admin)-/;

/** hex value (lowercased, no #) → the DOMAIN-NEUTRAL token names that carry it. */
const TOKENS = new Map<string, string[]>();
for (const [, name, hex] of themeBlock(CSS).matchAll(
  /(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})\s*[;/]/g,
)) {
  if (DOMAIN_SCOPED.test(name)) continue;
  const key = hex.slice(1).toLowerCase();
  TOKENS.set(key, [...(TOKENS.get(key) ?? []), name]);
}

/**
 * The marketing palette (`--mkt-*`) lives outside @theme — deliberately, so it
 * generates no app-wide utilities — but it names colours just as bindingly. It
 * covers the shared marketing surface: /learn, /shop, /for and the landing page.
 */
for (const [, name, hex] of CSS.matchAll(
  /(--mkt-[\w-]+)\s*:\s*(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})\s*;/g,
)) {
  const key = hex.slice(1).toLowerCase();
  TOKENS.set(key, [...(TOKENS.get(key) ?? []), name]);
}

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...tsxFiles(full));
    else if (entry.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const rel = (file: string) => file.replace(ROOT + "/", "");

describe("no literal hex duplicates a design token", () => {
  it("parses the theme block it claims to", () => {
    // Guards the derivation. Both parser traps in the docblock above produced an
    // empty token map, which would make the real assertion pass vacuously.
    expect(TOKENS.size).toBeGreaterThan(15);

    // And guards the DOMAIN_SCOPED filter from over-reaching. A filter that
    // grew to swallow these would silently stop covering the colours this rule
    // exists for — the four actually converted in D5, plus the two the audit's
    // own example got wrong. (A filter that stops working fails loudly instead:
    // the domain-named literals below start tripping the main assertion.)
    expect(TOKENS.get("f4b43c")).toContain("--color-accent");
    expect(TOKENS.get("0e1f18")).toContain("--color-ink");
    expect(TOKENS.get("16241c")).toContain("--color-forest");
    expect(TOKENS.get("f7f3ea")).toContain("--color-surface");
    expect(TOKENS.get("fffdf8")).toContain("--color-surface-elevated");

    // The marketing palette is picked up too, and it RESOLVES the old carve-out:
    // #7fa890 and #3a2a08 were previously named only by --color-concierge-* /
    // --color-sidebar-* and so were left literal. They now have honest,
    // surface-appropriate names and are covered by the rule like everything else.
    expect(TOKENS.get("7fa890")).toContain("--mkt-on-dark-sage-bright");
    expect(TOKENS.get("3a2a08")).toContain("--mkt-amber-ink");
    expect(TOKENS.get("ede4d2")).toContain("--mkt-line");
  });

  it("no Tailwind arbitrary value spells out a token's hex", () => {
    const offenders: string[] = [];

    for (const file of tsxFiles(join(ROOT, "app"))) {
      const src = readFileSync(file, "utf8");
      // Tailwind arbitrary values only: bg-[#fff], text-[#16241c], shadow
      // colours, gradient stops. A hex in a data URI, an <svg fill> or a
      // JS constant is not a utility and is out of scope.
      for (const [, hex] of src.matchAll(/\[(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})\]/g)) {
        const names = TOKENS.get(hex.slice(1).toLowerCase());
        if (names) {
          offenders.push(`${rel(file)}: ${hex} is ${names.join(" / ")}`);
        }
      }
    }

    expect(
      [...new Set(offenders)].sort(),
      "these spell out a colour the design system already names — use the " +
        "token so a palette change reaches them. (Colours with NO token are " +
        "deliberately still literals; this rule only covers named ones.)",
    ).toEqual([]);
  });
});
