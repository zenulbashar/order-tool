import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { controlClass } from "@/app/_components/field";

/**
 * The 16px iOS zoom floor (UI audit P0-5 / RC-4).
 *
 * iOS Safari zooms the whole viewport when a focused input is under 16px, and
 * does NOT zoom back. `controlClass()` backs every form in the product, so at
 * `text-sm` (14px) tapping the Name field at checkout left the diner in a
 * scaled, horizontally-scrolled layout for the rest of the money path. The
 * single most visible mobile defect, and on the money path.
 *
 * Pinned as a rule rather than a snapshot, because the regression is easy and
 * invisible: someone edits the recipe to `text-sm` for desktop density and every
 * phone quietly starts zooming again. Nothing else in CI would notice — there is
 * no device rendering in the pipeline, which is exactly why this audit existed.
 */

const ROOT = process.cwd();
const has = (cls: string, token: string) => cls.split(/\s+/).includes(token);

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

describe("iOS text-input zoom floor", () => {
  it("the shared recipe is 16px on mobile and 14px from sm up", () => {
    const cls = controlClass();
    expect(has(cls, "text-base"), "mobile must be >= 16px").toBe(true);
    expect(has(cls, "sm:text-sm"), "desktop density is kept from sm up").toBe(
      true,
    );
    // A bare text-sm would win or lose by stylesheet order — the ambiguity is
    // the bug, not just the value.
    expect(has(cls, "text-sm"), "unqualified text-sm must not appear").toBe(
      false,
    );
  });

  it("holds even when a call site overrides padding or width", () => {
    // The D2 conversion left 18 sites passing their own padding. If the type
    // size ever moved into the padding parameter, every one of them would drop
    // back under the floor at once.
    for (const opts of [
      { padding: "px-2.5 py-2" },
      { width: "w-20" },
      { padding: "px-2 py-1", width: "" },
      { invalid: true },
    ]) {
      const cls = controlClass(opts);
      expect(has(cls, "text-base"), `lost the floor with ${JSON.stringify(opts)}`).toBe(
        true,
      );
    }
  });

  it("no <input> or <textarea> anywhere renders below the floor", () => {
    // Four inputs bypass controlClass (menu search, both chat composers, the
    // marketing email capture). They are just as capable of triggering the zoom,
    // and a fifth would be too.
    const offenders: string[] = [];

    for (const file of tsxFiles(join(ROOT, "app"))) {
      const src = readFileSync(file, "utf8");
      // [^>] rather than the `s` flag: the tsconfig target predates it, and a
      // negated class already spans newlines.
      for (const m of src.matchAll(/<(input|textarea)\b[^>]*>/g)) {
        const tag = m[0];
        const cls = /className="([^"]*)"/.exec(tag)?.[1];
        if (!cls) continue;
        const tokens = cls.split(/\s+/);
        // Only text-entry controls zoom; a checkbox or radio has no text.
        const type = /type="([a-z]+)"/.exec(tag)?.[1];
        if (type && ["checkbox", "radio", "range", "color", "file"].includes(type))
          continue;
        // Under the floor iff it sets an unqualified size below text-base.
        const tooSmall = tokens.some((t) =>
          ["text-sm", "text-xs", "text-2xs"].includes(t),
        );
        if (tooSmall) {
          const line = src.slice(0, m.index).split("\n").length;
          offenders.push(`${rel(file)}:${line}`);
        }
      }
    }

    expect(
      offenders.sort(),
      "these render text entry below 16px, which makes iOS Safari zoom the " +
        "viewport on focus and never zoom back. Use `text-base sm:text-sm` so " +
        "desktop density survives.",
    ).toEqual([]);
  });

  it("finds the inputs it claims to", () => {
    // Guards the derivation — a regex that stops matching passes vacuously.
    const count = tsxFiles(join(ROOT, "app")).filter((f) =>
      /<(input|textarea)\b/.test(readFileSync(f, "utf8")),
    ).length;
    expect(count).toBeGreaterThan(15);
  });
});
