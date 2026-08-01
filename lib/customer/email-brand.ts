import { parseHexColor, relativeLuminance } from "@/lib/contrast";

/**
 * Shared helpers for the VENUE-branded diner emails (customer sign-in + order
 * notifications). Both render on the neutral cream/ink design-system shell with
 * the venue's brand colour as an ACCENT (a top rule, the logo/initial tile, the
 * button) — never Prompt2Eat's identity, and never the canvas. The escape +
 * readable-contrast + tile logic lives here so the two emails stay identical.
 * Pure: no I/O, no env. The colour maths itself lives in lib/contrast.ts
 * (M7) so the emails and the storefront's WCAG publish gate agree by
 * construction rather than by two copies staying in sync.
 */

const CREAM = "#FFFDF8";
const INK = "#16241C";

export function escHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** A valid brand hex (trimmed), or the ink fallback when it can't be parsed. */
export function safeBrandHex(brandColor: string): string {
  return parseHexColor(brandColor) ? brandColor.trim() : INK;
}

/**
 * Readable cream/ink hex to pair with a venue brand fill — readableOn() as a
 * literal hex, because email clients can't read the CSS vars readableOn returns.
 */
export function readableHexOn(brandHex: string): string {
  const rgb = parseHexColor(brandHex);
  if (!rgb) return CREAM;
  const b = relativeLuminance(rgb);
  const contrast = (a: number, x: number) =>
    (Math.max(a, x) + 0.05) / (Math.min(a, x) + 0.05);
  // Fixed luminances of cream (#fffdf8) and ink (#0e1f18).
  return contrast(0.983, b) >= contrast(0.015, b) ? CREAM : INK;
}

/**
 * The venue identity tile: the logo on a white tile when present, else a
 * brand-fill tile carrying the venue's initial (in the readable-on-brand colour).
 */
export function brandTileHtml(
  venueName: string,
  brandHex: string,
  onBrand: string,
  logoUrl: string | null,
): string {
  const initial = venueName.trim().charAt(0).toUpperCase() || "•";
  return logoUrl
    ? `<img src="${escHtml(logoUrl)}" alt="${escHtml(venueName)}" width="48" height="48" style="width:48px;height:48px;border-radius:12px;background:#FFFFFF;object-fit:contain;border:1px solid #EFE7D6;" />`
    : `<span style="display:inline-block;width:48px;height:48px;border-radius:12px;background:${brandHex};color:${onBrand};font-size:22px;font-weight:800;line-height:48px;text-align:center;">${escHtml(initial)}</span>`;
}
