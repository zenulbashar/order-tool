/**
 * Design-studio size presets (Track G). Every preset is an exact pixel canvas —
 * the SVG is rendered at these dimensions and exported 1:1, so "generate at
 * multiple sizes in a click" is just picking one. Print presets use CSS-pixel
 * (@96dpi) paper dimensions so browser print-to-PDF lands on real A-sizes.
 */
export type StudioMode = "menu" | "banner";

export type SizePreset = {
  id: string;
  label: string;
  width: number;
  height: number;
  /** print → offer Print-to-PDF; raster → offer PNG download (both always SVG). */
  kind: "print" | "raster";
};

export const MENU_PRESETS: SizePreset[] = [
  { id: "a4-portrait", label: "A4 poster (portrait)", width: 794, height: 1123, kind: "print" },
  { id: "a4-landscape", label: "A4 poster (landscape)", width: 1123, height: 794, kind: "print" },
  { id: "a5-tent", label: "A5 table tent", width: 559, height: 794, kind: "print" },
  { id: "signage-portrait", label: "Digital signage 9:16", width: 1080, height: 1920, kind: "raster" },
  { id: "signage-landscape", label: "Digital signage 16:9", width: 1920, height: 1080, kind: "raster" },
];

export const BANNER_PRESETS: SizePreset[] = [
  { id: "ig-square", label: "Instagram post (1:1)", width: 1080, height: 1080, kind: "raster" },
  { id: "ig-story", label: "Instagram story (9:16)", width: 1080, height: 1920, kind: "raster" },
  { id: "fb-cover", label: "Facebook cover", width: 1200, height: 630, kind: "raster" },
  { id: "web-wide", label: "Web banner (wide)", width: 1456, height: 512, kind: "raster" },
  { id: "signage-landscape", label: "Digital signage 16:9", width: 1920, height: 1080, kind: "raster" },
];

export function presetsFor(mode: StudioMode): SizePreset[] {
  return mode === "menu" ? MENU_PRESETS : BANNER_PRESETS;
}
