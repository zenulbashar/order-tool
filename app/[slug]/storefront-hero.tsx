import type { PublicVenue } from "./types";

/**
 * The venue's logo as a rounded tile, or — when there's no logo — an initial
 * letter on the venue's --brand fill with --brand-contrast text. Used identically
 * in the desktop app bar (small) and the hero (large), so a logo-less venue never
 * looks unbranded. `sizeClass` sets the box; `radiusClass` the corner.
 */
export function BrandTile({
  venue,
  sizeClass,
  radiusClass,
  textClass,
  ringClass = "",
}: {
  venue: Pick<PublicVenue, "logoUrl" | "name">;
  sizeClass: string;
  radiusClass: string;
  textClass: string;
  ringClass?: string;
}) {
  if (venue.logoUrl) {
    return (
      // Arbitrary owner-supplied URL; next/image would need remote config.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={venue.logoUrl}
        alt={`${venue.name} logo`}
        className={`${sizeClass} ${radiusClass} ${ringClass} shrink-0 object-cover`}
      />
    );
  }
  return (
    <span
      className={`${sizeClass} ${radiusClass} ${ringClass} flex shrink-0 items-center justify-center font-display font-semibold text-[var(--action-contrast)] ${textClass}`}
      style={{ backgroundColor: "var(--action)" }}
    >
      {venue.name.charAt(0).toUpperCase()}
    </span>
  );
}

/**
 * Desktop header hero (Direction A). A full-bleed cover image with a bottom-up
 * scrim that guarantees legible text over ANY photo; with no cover, a calm
 * brand-tint band (never an empty/black band). Over it, bottom-aligned inside the
 * inner max-width: the logo tile, the venue name, and a real meta row (only the
 * fields we actually have — description + open state — never a fabricated rating).
 * Desktop only; the mobile header (cover band + overlapping logo) is unchanged.
 */
export function StorefrontHero({ venue }: { venue: PublicVenue }) {
  const hasCover = Boolean(venue.coverUrl);
  const nameColor = hasCover ? "text-white" : "text-ink";
  const metaColor = hasCover ? "text-[#f3ede1]" : "text-muted";

  return (
    <div className="relative min-h-[232px] overflow-hidden">
      {hasCover ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={venue.coverUrl ?? ""}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, rgba(14,31,24,.12), rgba(14,31,24,.66))",
            }}
          />
        </>
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background:
              "color-mix(in srgb, var(--brand) 12%, var(--color-surface))",
          }}
        />
      )}

      <div className="relative mx-auto flex min-h-[232px] max-w-[1280px] items-end gap-5 px-6 pb-7 pt-24">
        <BrandTile
          venue={venue}
          sizeClass="h-24 w-24"
          radiusClass="rounded-[20px]"
          textClass="text-4xl"
          ringClass="ring-[3px] ring-white/90"
        />
        <div className="min-w-0 pb-1">
          <h1
            className={`font-display text-4xl font-extrabold leading-tight tracking-tight ${nameColor}`}
          >
            {venue.name}
          </h1>
          {venue.storefrontDescription || venue.isLive ? (
            <div
              className={`mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium ${metaColor}`}
            >
              {venue.storefrontDescription ? (
                <span>{venue.storefrontDescription}</span>
              ) : null}
              {venue.isLive ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-pill bg-[var(--color-success)]" />
                  Open
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
