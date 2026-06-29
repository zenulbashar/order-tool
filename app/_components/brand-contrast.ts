/**
 * Pick a readable foreground token to pair with an arbitrary per-tenant venue
 * --brand colour. Pure (no React, no "use client") so both server and client
 * diner roots can import it. Set the result as --brand-contrast inline beside
 * --brand; on diner surfaces --action-contrast resolves to it, so a primary
 * <Button> (fill = brand) gets readable label text for any venue colour.
 *
 * Returns whichever of the cream surface or the ink token gives the higher WCAG
 * contrast against the brand. Unparseable input falls back to cream — the safe
 * default for the near-black brand default (#111827).
 */
export function readableOn(hex: string): string {
  const rgb = parseHex(hex);
  if (!rgb) return "var(--color-surface-elevated)";

  const brand = relativeLuminance(rgb);
  // Fixed luminances of our two foreground tokens (#fffdf8 cream / #0e1f18 ink).
  const CREAM = 0.983;
  const INK = 0.015;

  return contrast(CREAM, brand) >= contrast(INK, brand)
    ? "var(--color-surface-elevated)"
    : "var(--color-ink)";
}

function contrast(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function parseHex(input: string): [number, number, number] | null {
  let h = input.trim().replace(/^#/, "");
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const [rl, gl, bl] = [r, g, b].map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}
