import type { CSSProperties } from "react";

import { readableOn } from "@/app/_components/brand-contrast";

/**
 * The diner side's two-colour theming, built in ONE place so every diner root
 * (storefront, checkout, order, account) applies it identically:
 *  - `--brand` — the venue accent (auto-derived from the logo at upload when the
 *    owner hasn't chosen one), paired with a readableOn() contrast for anything
 *    painted in it;
 *  - `--color-ink` — overridden ONLY when the owner set a custom text colour;
 *    otherwise the shared deep-neutral ink stays, so contrast never regresses
 *    by default.
 * Set on the element carrying data-domain="diner" (which maps --action to
 * --brand). Prompt2Eat's own amber/forest branding remains reserved for the
 * concierge — venue pages read these two colours only.
 */
export function dinerBrandStyle(venue: {
  brandColor: string;
  textColor: string | null;
}): CSSProperties {
  return {
    "--brand": venue.brandColor,
    "--brand-contrast": readableOn(venue.brandColor),
    ...(venue.textColor ? { "--color-ink": venue.textColor } : {}),
  } as CSSProperties;
}
