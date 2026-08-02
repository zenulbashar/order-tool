/**
 * WCAG contrast maths (M7 / audit F10). Pure — no I/O, no env — so the rule
 * that stops a venue publishing an unreadable storefront is unit-testable.
 *
 * The formulae are WCAG 2.x §1.4.3: relative luminance per the sRGB
 * definition, and a contrast ratio of (L_lighter + 0.05) / (L_darker + 0.05).
 * AA normal text needs 4.5:1; AA large text (≥18.66px bold or ≥24px) needs
 * 3:1.
 */

/** WCAG AA threshold for normal-size text. */
export const WCAG_AA_NORMAL = 4.5;
/** WCAG AA threshold for large text (≥24px, or ≥18.66px bold). */
export const WCAG_AA_LARGE = 3;

export type Rgb = [number, number, number];

/** Parse `#rgb` / `#rrggbb` (with or without the hash). Null when invalid. */
export function parseHexColor(input: string): Rgb | null {
  let hex = input.trim().replace(/^#/, "");
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((channel) => channel + channel)
      .join("");
  }
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
}

/** Relative luminance, WCAG 2.x definition. */
export function relativeLuminance([r, g, b]: Rgb): number {
  const [rl, gl, bl] = [r, g, b].map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

/**
 * Contrast ratio between two colours, 1–21. Returns null when either colour
 * cannot be parsed — callers must decide what an unparseable colour means
 * rather than being handed a misleading number.
 */
export function contrastRatio(
  foreground: string,
  background: string,
): number | null {
  const fg = parseHexColor(foreground);
  const bg = parseHexColor(background);
  if (!fg || !bg) return null;
  const a = relativeLuminance(fg);
  const b = relativeLuminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Does this pairing clear WCAG AA for normal-size text (4.5:1)? */
export function meetsContrastAA(
  foreground: string,
  background: string,
  threshold: number = WCAG_AA_NORMAL,
): boolean {
  const ratio = contrastRatio(foreground, background);
  return ratio !== null && ratio >= threshold;
}

/** "3.4:1" — for the operator-facing validation message. */
export function formatContrastRatio(ratio: number): string {
  return `${ratio.toFixed(1)}:1`;
}

/*
 * The two page surfaces a diner storefront paints text on, from the @theme
 * block in app/globals.css. Duplicated as constants rather than read from CSS
 * because this file is pure and runs server-side at save time.
 */
export const SURFACE_PAGE = "#f7f3ea"; // --color-surface
export const SURFACE_ELEVATED = "#fffdf8"; // --color-surface-elevated

/**
 * Does a venue's custom TEXT colour stay readable on the pages it renders on?
 *
 * This is the pairing that matters and the one nothing checked (UI audit
 * P2-10). `brandTextColor` does NOT become the label on a brand-filled button —
 * that is `--brand-contrast`, which `readableOn()` derives and is therefore safe
 * by construction. It overrides `--color-ink`, the venue's BODY TEXT, which sits
 * on the cream page and on elevated cards.
 *
 * The gate it replaces compared the text colour against the BRAND, which is not
 * a surface that text is ever painted on. That inversion waved through the exact
 * worst case: with the default navy brand (#111827), a near-white body text
 * scores 16.2:1 against the brand and PASSES, then renders at 1.01:1 on the
 * cream page — invisible.
 *
 * Returns the worst of the two surfaces, so a colour has to clear both.
 */
export function surfaceContrast(textColor: string): number | null {
  const onPage = contrastRatio(textColor, SURFACE_PAGE);
  const onElevated = contrastRatio(textColor, SURFACE_ELEVATED);
  if (onPage === null || onElevated === null) return null;
  return Math.min(onPage, onElevated);
}

/** Does this text colour clear AA on BOTH diner page surfaces? */
export function meetsSurfaceContrastAA(
  textColor: string,
  threshold: number = WCAG_AA_NORMAL,
): boolean {
  const ratio = surfaceContrast(textColor);
  return ratio !== null && ratio >= threshold;
}
