import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { bookings, venues } from "@/lib/db/schema";
import { formatVenueTime } from "@/lib/time";
import { isReservedSlug } from "@/lib/validation";

import { dinerBrandStyle } from "../../brand-style";
import { getPublicVenueBySlug } from "../../queries";
import { BookingActions } from "./booking-actions";

type Params = { params: Promise<{ slug: string; token: string }> };

/**
 * This page is reached by a link in an email and its URL contains a bearer
 * token. It must never be indexed, and must never appear in a sitemap — the
 * same treatment the order-status page gets.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

const STATUS_COPY: Record<
  string,
  { heading: string; body: string; tone: "good" | "muted" | "warn" }
> = {
  confirmed: {
    heading: "You're booked in",
    body: "We've saved your table. Just come in and mention your name.",
    tone: "good",
  },
  seated: {
    heading: "You're seated",
    body: "Enjoy your meal.",
    tone: "good",
  },
  completed: {
    heading: "Thanks for coming in",
    body: "We hope to see you again soon.",
    tone: "muted",
  },
  cancelled: {
    heading: "This booking is cancelled",
    body: "Nothing is held for you. You're welcome to book again any time.",
    tone: "warn",
  },
  no_show: {
    heading: "This booking was marked as a no-show",
    body: "If that's wrong, please give the venue a call.",
    tone: "warn",
  },
};

/**
 * The diner's view of their own booking, resolved ONLY by the public token —
 * never by id, and never requiring a login. The slug in the path is checked
 * against the booking's venue so a token from one venue cannot be rendered
 * inside another venue's branding.
 */
export default async function BookingPage({ params }: Params) {
  const { slug, token } = await params;
  if (isReservedSlug(slug)) notFound();

  const venue = await getPublicVenueBySlug(slug);
  if (!venue) notFound();

  const [booking] = await db
    .select({
      status: bookings.status,
      bookedFor: bookings.bookedFor,
      partySize: bookings.partySize,
      customerName: bookings.customerName,
      notes: bookings.notes,
      timezone: venues.timezone,
    })
    .from(bookings)
    .innerJoin(venues, eq(venues.id, bookings.venueId))
    // Token AND venue: the token alone would render a booking under whichever
    // slug the URL happened to carry.
    .where(and(eq(bookings.publicToken, token), eq(bookings.venueId, venue.id)))
    .limit(1);

  if (!booking) notFound();

  const copy = STATUS_COPY[booking.status] ?? STATUS_COPY.confirmed;
  const when = formatVenueTime(booking.bookedFor, booking.timezone);
  const party =
    booking.partySize === 1 ? "1 person" : `${booking.partySize} people`;

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

      <h1 className="mt-4 font-display text-[clamp(24px,5vw,34px)] font-extrabold tracking-[-0.02em] text-ink">
        {copy.heading}
      </h1>
      <p
        className={`mt-2 text-sm ${
          copy.tone === "warn" ? "text-[var(--color-warm-deep)]" : "text-muted"
        }`}
      >
        {copy.body}
      </p>

      <dl className="mt-7 divide-y divide-line border-y border-line">
        <div className="flex items-center justify-between gap-4 py-3">
          <dt className="text-sm text-muted">When</dt>
          <dd className="text-base font-semibold text-ink">{when}</dd>
        </div>
        <div className="flex items-center justify-between gap-4 py-3">
          <dt className="text-sm text-muted">Party</dt>
          <dd className="text-sm text-ink">{party}</dd>
        </div>
        <div className="flex items-center justify-between gap-4 py-3">
          <dt className="text-sm text-muted">Name</dt>
          <dd className="text-sm text-ink">{booking.customerName}</dd>
        </div>
        {booking.notes ? (
          <div className="flex items-start justify-between gap-4 py-3">
            <dt className="shrink-0 text-sm text-muted">Your note</dt>
            <dd className="whitespace-pre-wrap break-words text-right text-sm text-ink">
              {booking.notes}
            </dd>
          </div>
        ) : null}
      </dl>

      {booking.status === "confirmed" ? <BookingActions token={token} /> : null}

      <p className="mt-8 text-sm text-muted">
        Want to see what&apos;s on?{" "}
        <Link href={`/${venue.slug}`} className="underline">
          Browse the menu
        </Link>
        .
      </p>
    </main>
  );
}
