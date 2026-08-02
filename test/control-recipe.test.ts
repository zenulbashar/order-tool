import { describe, expect, it } from "vitest";

import { controlClass } from "@/app/_components/field";

/**
 * The shared control recipe (audit D2).
 *
 * 21 files had hand-copied this recipe and drifted from it. Adopting it back
 * needed `padding` and `width` to become parameters, because `cx` is a plain
 * joiner — not tailwind-merge — so a caller passing `px-2 py-1` through
 * `className` would emit BOTH it and the default and leave stylesheet order to
 * decide the winner. These tests pin that override mechanism, since the whole
 * conversion rests on it.
 */

const has = (cls: string, token: string) => cls.split(/\s+/).includes(token);

describe("controlClass", () => {
  it("emits the full recipe by default", () => {
    const cls = controlClass();
    for (const token of [
      "w-full",
      "rounded-input",
      "border",
      "border-line",
      "bg-surface-elevated",
      "px-3",
      "py-2.5",
      "sm:py-2",
      // 16px on mobile, 14px from sm up — the iOS auto-zoom floor (UI audit
      // P0-5). A bare text-sm here is the regression: it would silently put the
      // whole checkout back to zooming on focus.
      "text-base",
      "sm:text-sm",
      "min-h-11",
      "sm:min-h-0",
      "text-ink",
      "shadow-sm",
      "placeholder:text-muted",
      "disabled:cursor-not-allowed",
      "disabled:opacity-60",
      "read-only:bg-sand/40",
      "focus-visible:outline-none",
    ]) {
      expect(has(cls, token), `default recipe is missing ${token}`).toBe(true);
    }
  });

  it("REPLACES the default padding rather than appending to it", () => {
    // The crux. If both survived, a compact inline control would render at the
    // standard size or not, depending on stylesheet order — the exact ambiguity
    // that made a blanket <Input> swap unsafe.
    const cls = controlClass({ padding: "px-2 py-1" });
    expect(has(cls, "px-2")).toBe(true);
    expect(has(cls, "py-1")).toBe(true);
    expect(has(cls, "px-3"), "default px-3 must not survive").toBe(false);
    expect(has(cls, "py-2.5"), "default py-2.5 must not survive").toBe(false);
    expect(has(cls, "sm:py-2"), "default sm:py-2 must not survive").toBe(false);
    // The type size is NOT part of padding and must survive an override —
    // otherwise every compact control silently reopens the iOS zoom bug.
    expect(has(cls, "text-base")).toBe(true);
    expect(has(cls, "sm:text-sm")).toBe(true);
  });

  it("REPLACES the default width, including with no width at all", () => {
    expect(has(controlClass({ width: "w-20" }), "w-20")).toBe(true);
    expect(has(controlClass({ width: "w-20" }), "w-full")).toBe(false);
    // An empty string means "this control sizes itself" — several call sites
    // are flex children with no width utility of their own.
    expect(has(controlClass({ width: "" }), "w-full")).toBe(false);
  });

  it("keeps the invalid state mutually exclusive with the normal border", () => {
    const invalid = controlClass({ invalid: true });
    expect(has(invalid, "border-[var(--color-warm)]")).toBe(true);
    expect(has(invalid, "border-line")).toBe(false);
    expect(has(invalid, "focus-visible:shadow-[var(--focus-ring-danger)]")).toBe(
      true,
    );
  });

  it("appends className last so a caller can still add utilities", () => {
    const cls = controlClass({ className: "uppercase" });
    expect(has(cls, "uppercase")).toBe(true);
    expect(cls.trim().endsWith("uppercase")).toBe(true);
  });

  it("still matches what the drifted copies rendered, minus their omissions", () => {
    // Representative of the 14 sites that only gain placeholder:text-muted: the
    // copies kept everything else and simply lacked the recipe's placeholder
    // colour. Nothing is REMOVED by adopting the recipe.
    const copy =
      "w-full rounded-input border border-line bg-surface-elevated px-2.5 py-2 text-sm text-ink shadow-sm disabled:cursor-not-allowed disabled:opacity-60 read-only:bg-sand/40 focus-visible:border-[var(--color-accent)] focus-visible:shadow-[var(--focus-ring-input)] focus-visible:outline-none";
    const now = controlClass({ padding: "px-2.5 py-2", width: "w-full" });
    const missing = copy.split(/\s+/).filter((t) => !has(now, t));
    // text-sm is the ONE deliberate exception: it became `text-base sm:text-sm`
    // so mobile clears the 16px iOS floor. Renders identically from 640px up,
    // which is every viewport the copies were designed against.
    expect(missing, "adopting the recipe must not drop any class").toEqual([
      "text-sm",
    ]);
    expect(has(now, "sm:text-sm"), "…and text-sm survives above sm").toBe(true);
  });
});
