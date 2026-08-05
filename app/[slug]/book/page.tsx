import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import type { BookingConfig } from "@/lib/bookings/availability";
import { requestNowMs } from "@/lib/schedule";
import { isReservedSlug } from "@/lib/validation";

import { dinerBrandStyle } from "../brand-style";
import { getPublicVenueBySlug } from "../queries";
import { BookingForm } from "./booking-form";

type BookParams = { params: Promise<{ slug: string }> };

export async function generateMetadata({
  params,
}: BookParams): Promise<Metadata> {
  const { slug } = await params;
  if (isReservedSlug(slug)) return {};
  const venue = await getPublicVenueBySlug(slug);
  if (!venue?.bookingsEnabled) return {};
  return {
    title: `Book a table at ${venue.name}`,
    description: `Reserve a table at ${venue.name}. Pick a time, tell us how many, and we'll email your confirmation.`,
    // The booking page is a real, indexable entry point for "book a table
    // <venue>" searches — the same reasoning that puts storefronts in the
    // sitemap. Nothing here is tokenised or personal.
    alternates: { canonical: `/${venue.slug}/book` },
  };
}

/**
 * The diner's "book a table" page.
 *
 * Renders only when the venue has turned bookings ON and has opening hours set —
 * without hours there is nothing to offer, and guessing would be worse than a
 * 404. A venue with bookings off has no such page at all, rather than a page
 * that explains it cannot help.
 *
 * `nowMs` is captured HERE, on the server, and handed to the form so the server
 * and client agree on which slots exist. Reading the clock in the client render
 * instead is how pickers get hydration mismatches and offer a slot the server
 * then rejects.
 */
export default async function BookPage({ params }: BookParams) {
  const { slug } = await params;
  if (isReservedSlug(slug)) notFound();

  const venue = await getPublicVenueBySlug(slug);
  if (!venue) notFound();
  if (!venue.bookingsEnabled || !venue.openingHours?.length) notFound();

  const config: BookingConfig = {
    timeZone: venue.timezone,
    openingHours: venue.openingHours,
    leadMinutes: venue.bookingLeadMinutes,
    maxDaysAhead: venue.bookingMaxDaysAhead,
    maxPartySize: venue.bookingMaxPartySize,
    // Display-side only; the server owns the real capacity arithmetic. Any value
    // works here because the form never computes capacity.
    durationMinutes: 90,
  };

  return (
    <main
      style={dinerBrandStyle(venue)}
      data-domain="diner"
      className="mx-auto min-h-dvh max-w-2xl bg-surface px-5 py-8"
    >
      <Link
        href={`/${venue.slug}`}
        className="font-mono text-2xs font-bold uppercase tracking-wider text-label hover:text-ink"
      >
        &larr; {venue.name}
      </Link>

      <h1 className="mt-4 font-display text-[clamp(26px,5vw,36px)] font-extrabold tracking-[-0.02em] text-ink">
        Book a table
      </h1>
      <p className="mt-2 text-sm text-muted">
        Pick a time and we&apos;ll email your confirmation. No deposit, no card.
      </p>

      <div className="mt-7">
        <BookingForm
          slug={venue.slug}
          config={config}
          nowMs={requestNowMs()}
        />
      </div>
    </main>
  );
}
