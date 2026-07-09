import type { CSSProperties } from "react";

/**
 * Owner-uploaded brand image revealed in the empty side gutters behind the
 * centered diner column. The diner pages render a narrow, opaque `bg-surface`
 * column (max-w-2xl/3xl) centered on a wide viewport, leaving cream gutters;
 * this fills those gutters with the venue's imagery so the storefront reads as
 * a full-page branded space (the loke.global look the owner asked for).
 *
 * Design choices that keep it safe:
 *  - `fixed inset-0` + `-z-10`: the layer sits BEHIND the column, out of normal
 *    flow, so it can never push content or cause layout shift, and it stays put
 *    (a calm parallax) as the column scrolls over it.
 *  - `hidden lg:block`: gutters only meaningfully exist at ≥1024px, so phones
 *    and tablets render byte-for-byte as before (the layer isn't even painted).
 *  - The centered column keeps its opaque `bg-surface`, so it MASKS the image's
 *    center for free — one full-bleed image works for any aspect ratio and the
 *    menu text never sits on the photo.
 *  - A literal dark scrim (`bg-black/25`, not a theme token that flips light in
 *    dark mode) knocks the image back so it stays ambient, never loud.
 *
 * Returns null when the venue has no background image — the default look.
 * Plain (directive-free) component so it renders in both the client storefront
 * and the server order/account pages.
 */
export function BrandBackdrop({
  backgroundUrl,
}: {
  backgroundUrl: string | null;
}) {
  if (!backgroundUrl) return null;
  // fixed layer relative to the viewport; -z-10 keeps it under the column.
  const layer: CSSProperties = { zIndex: -10 };
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 hidden select-none lg:block"
      style={layer}
    >
      {/* Owner-supplied URL; next/image would need remote config (house rule). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={backgroundUrl}
        alt=""
        className="h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-black/25" />
    </div>
  );
}
