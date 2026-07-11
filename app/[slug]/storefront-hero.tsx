"use client";

import { useEffect, useState } from "react";

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

const ROTATE_MS = 6000;

/**
 * Desktop storefront hero (world-class hospitality pattern): a FULL-PAGE image —
 * rotating through up to three owner-uploaded photos — with a dark scrim, the
 * venue's logo + name centered over it, and a "View menu" cue that scrolls to
 * the menu. Rotation is a slow 6s crossfade with manual dots (carousel best
 * practice) and is disabled entirely under prefers-reduced-motion or with a
 * single image. With NO images it falls back to the short brand-tint band —
 * never a full page of empty colour. Desktop only; the mobile banner is
 * unchanged and rendered by the storefront itself.
 */
export function StorefrontHero({
  venue,
  images,
}: {
  venue: PublicVenue;
  images: string[];
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (images.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(
      () => setIndex((current) => (current + 1) % images.length),
      ROTATE_MS,
    );
    return () => clearInterval(id);
  }, [images.length]);

  function scrollToMenu() {
    document
      .getElementById("menu-top")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (images.length === 0) {
    // No photos: a calm brand-tint band of the classic height.
    return (
      <div
        className="relative flex min-h-[232px] items-end"
        style={{
          background:
            "color-mix(in srgb, var(--brand) 12%, var(--color-surface))",
        }}
      >
        <div className="mx-auto w-full max-w-[1280px] px-6 pb-7">
          <div className="min-w-0">
            <h1 className="font-display text-4xl font-extrabold leading-tight tracking-tight text-ink">
              {venue.name}
            </h1>
            <VenueMeta venue={venue} toneClass="text-muted" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-[calc(100dvh-64px)] min-h-[480px] overflow-hidden">
      {images.map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          src={src}
          alt=""
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${
            i === index ? "opacity-100" : "opacity-0"
          }`}
        />
      ))}
      {/* Scrim — guarantees legible centered text over ANY photo. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(14,31,24,.30), rgba(14,31,24,.42) 55%, rgba(14,31,24,.62))",
        }}
      />

      {/* Centered venue name over the image — the logo lives only in the header
          + footer (over a busy photo it reads poorly), per design direction. */}
      <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
        <h1 className="font-display text-5xl font-extrabold leading-tight tracking-tight text-white drop-shadow-sm xl:text-6xl">
          {venue.name}
        </h1>
        <VenueMeta venue={venue} toneClass="text-[#f3ede1]" />
      </div>

      {/* Bottom controls: manual slide dots + the scroll-to-menu cue. */}
      <div className="absolute inset-x-0 bottom-6 flex flex-col items-center gap-4">
        {images.length > 1 ? (
          <div className="flex items-center gap-2">
            {images.map((src, i) => (
              <button
                key={src}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Show photo ${i + 1}`}
                aria-current={i === index ? "true" : undefined}
                className={`h-2 rounded-pill transition-all ${
                  i === index ? "w-6 bg-white" : "w-2 bg-white/50 hover:bg-white/80"
                }`}
              />
            ))}
          </div>
        ) : null}
        <button
          type="button"
          onClick={scrollToMenu}
          className="flex items-center gap-2 rounded-pill bg-white/12 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20"
        >
          View menu
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/** Description + open-state row — only real fields, never fabricated meta. */
function VenueMeta({
  venue,
  toneClass,
}: {
  venue: Pick<PublicVenue, "storefrontDescription" | "isLive">;
  toneClass: string;
}) {
  if (!venue.storefrontDescription && !venue.isLive) return null;
  return (
    <div
      className={`mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm font-medium ${toneClass}`}
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
  );
}
