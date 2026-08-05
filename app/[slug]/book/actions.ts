"use server";

import { randomBytes } from "node:crypto";

import { and, eq, gte, inArray, lte, sum } from "drizzle-orm";
import { headers } from "next/headers";
import { after } from "next/server";

import { fitsCapacity, validateBookingRequest } from "@/lib/bookings/availability";
import {
  renderBookingConfirmationEmail,
  renderOwnerBookingEmail,
} from "@/lib/bookings/emails";
import { sendOrderEmail } from "@/lib/customer/email";
import { db } from "@/lib/db";
import { bookings, users, venues, venueTables } from "@/lib/db/schema";
import { reportError } from "@/lib/observability";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { scopedToVenue } from "@/lib/tenant";
import { getBaseUrl } from "@/lib/url";
import { bookingRequestSchema, type BookingRequestInput } from "@/lib/validation";

export type CreateBookingResult =
  | { ok: true; token: string }
  | { ok: false; error: string };

function reject(error: string): CreateBookingResult {
  return { ok: false, error };
}

/** Same entropy as an order token — this is a bearer credential. */
function generateToken(): string {
  return randomBytes(16).toString("base64url");
}

const UNAVAILABLE =
  "We couldn't save that booking. Please try again, or call the venue.";

/**
 * Create a table booking from the PUBLIC storefront form.
 *
 * This is an anonymous, unauthenticated surface, so nothing the client sends is
 * trusted: the venue is resolved by slug, every bound (hours, lead, horizon,
 * party size, capacity) is re-checked server-side against the venue row, and the
 * only client value that reaches the database is the diner's own contact detail
 * and note.
 *
 * NOT a money path. It creates no order, touches no PaymentIntent and takes no
 * payment — bookings and orders meet only on the floor, when a seated party
 * orders. Keeping that separation explicit is why this action lives here rather
 * than anywhere near checkout.
 *
 * Emails are sent AFTER the response via after(), each independently swallowed:
 * a booking that is saved but whose confirmation email bounces is a support
 * conversation, whereas a booking the diner was told failed but which actually
 * committed is a double-booked table. So the row wins and the email is
 * best-effort — the same shape the order webhook uses for its side effects.
 */
export async function createBooking(
  input: BookingRequestInput,
): Promise<CreateBookingResult> {
  const parsed = bookingRequestSchema.safeParse(input);
  if (!parsed.success) {
    return reject(
      parsed.error.issues[0]?.message ?? "Please check the booking details.",
    );
  }
  const data = parsed.data;

  // Public surface, and each accepted booking sends two emails, so this is an
  // inbox-spam gate as much as a load gate. Fail-open like every other limiter
  // here: a Redis blip must never stop a real diner booking a table.
  const ip = clientIpFromHeaders(await headers());
  const limit = await checkRateLimit("bookingIp", ip);
  if (!limit.success) {
    return reject(
      "That's a lot of bookings from one place. Please try again later, or call the venue.",
    );
  }

  const [venue] = await db
    .select({
      id: venues.id,
      name: venues.name,
      slug: venues.slug,
      timezone: venues.timezone,
      openingHours: venues.openingHours,
      brandColor: venues.brandColor,
      logoUrl: venues.logoUrl,
      bookingsEnabled: venues.bookingsEnabled,
      leadMinutes: venues.bookingLeadMinutes,
      maxDaysAhead: venues.bookingMaxDaysAhead,
      maxPartySize: venues.bookingMaxPartySize,
      durationMinutes: venues.bookingDurationMinutes,
      // The owner alert goes to the account that owns the venue. Joined here
      // rather than stored on the venue so it can never drift from the login.
      ownerEmail: users.email,
    })
    .from(venues)
    .leftJoin(users, eq(users.id, venues.ownerUserId))
    .where(eq(venues.slug, data.slug))
    .limit(1);

  if (!venue) return reject(UNAVAILABLE);
  if (!venue.bookingsEnabled || !venue.openingHours?.length) {
    return reject("This venue isn't taking online bookings right now.");
  }

  const config = {
    timeZone: venue.timezone,
    openingHours: venue.openingHours,
    leadMinutes: venue.leadMinutes,
    maxDaysAhead: venue.maxDaysAhead,
    maxPartySize: venue.maxPartySize,
    durationMinutes: venue.durationMinutes,
  };

  const nowMs = Date.now();
  const slot = validateBookingRequest(
    config,
    data.bookedFor,
    data.partySize,
    nowMs,
  );
  if (!slot.ok) return reject(slot.error);

  // Capacity: total configured seats, and the bookings that overlap this one.
  // Both venue-scoped. A venue with no tables configured has UNKNOWN capacity —
  // fitsCapacity treats that as "allow", because silently refusing real
  // customers is a worse failure than an owner double-checking their floor.
  const [seatRow] = await db
    .select({ seats: sum(venueTables.seats) })
    .from(venueTables)
    .where(scopedToVenue(venueTables.venueId, venue.id));
  const capacity = Number(seatRow?.seats ?? 0);

  const durationMs = config.durationMinutes * 60_000;
  const windowStart = new Date(slot.instant.getTime() - durationMs);
  const windowEnd = new Date(slot.instant.getTime() + durationMs);
  const neighbours = await db
    .select({ bookedFor: bookings.bookedFor, partySize: bookings.partySize })
    .from(bookings)
    .where(
      and(
        scopedToVenue(bookings.venueId, venue.id),
        // Cancelled and no-show bookings free their seats; completed ones are
        // in the past and cannot overlap a future request.
        inArray(bookings.status, ["confirmed", "seated"]),
        gte(bookings.bookedFor, windowStart),
        lte(bookings.bookedFor, windowEnd),
      ),
    );

  const fits = fitsCapacity(
    config,
    capacity,
    neighbours.map((n) => ({
      bookedForMs: n.bookedFor.getTime(),
      partySize: n.partySize,
    })),
    slot.instant.getTime(),
    data.partySize,
  );
  if (!fits) {
    return reject(
      "We're fully booked at that time. Please try another time, or call us.",
    );
  }

  const token = generateToken();
  try {
    await db.insert(bookings).values({
      venueId: venue.id,
      publicToken: token,
      bookedFor: slot.instant,
      partySize: data.partySize,
      customerName: data.customerName,
      customerEmail: data.customerEmail,
      customerPhone: data.customerPhone || null,
      notes: data.notes || null,
    });
  } catch (error) {
    await reportError(error, { context: "bookings.create" });
    return reject(UNAVAILABLE);
  }

  const baseUrl = await getBaseUrl();
  const manageUrl = `${baseUrl}/${venue.slug}/book/${token}`;
  const dashboardUrl = `${baseUrl}/dashboard/bookings`;
  const shared = {
    venueName: venue.name,
    timeZone: venue.timezone,
    customerName: data.customerName,
    partySize: data.partySize,
    bookedFor: slot.instant,
    notes: data.notes || null,
    manageUrl,
  };

  // Two independent sends. Separately swallowed so a failure of one cannot cost
  // the other — the owner still learns about a booking whose diner address
  // bounced, and vice versa.
  after(async () => {
    const diner = renderBookingConfirmationEmail({
      ...shared,
      brandColor: venue.brandColor,
      logoUrl: venue.logoUrl,
    });
    await sendOrderEmail({
      to: data.customerEmail,
      subject: diner.subject,
      html: diner.html,
      text: diner.text,
    }).catch((error) =>
      reportError(error, { context: "bookings.email.diner" }),
    );
  });

  after(async () => {
    if (!venue.ownerEmail) return;
    const owner = renderOwnerBookingEmail({
      ...shared,
      dashboardUrl,
      phone: data.customerPhone || null,
    });
    await sendOrderEmail({
      to: venue.ownerEmail,
      subject: owner.subject,
      html: owner.html,
      text: owner.text,
    }).catch((error) =>
      reportError(error, { context: "bookings.email.owner" }),
    );
  });

  return { ok: true, token };
}
