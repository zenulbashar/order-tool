import {
  buildPickupSlots,
  validateScheduledForConfig,
  type PickupDay,
  type SchedulingConfig,
} from "@/lib/schedule";

/**
 * Booking availability. PURE — no I/O, no DB, no clock of its own — so every
 * rule here is unit-testable and the same functions can serve the diner picker
 * and the authoritative server check without drifting.
 *
 * Times reuse lib/schedule.ts wholesale rather than reimplementing a second
 * opening-hours/timezone engine. That is the whole point: a venue has ONE set of
 * trading hours and ONE timezone, and a booking picker that disagreed with the
 * pickup picker about when the venue is open would be a bug nobody could
 * reproduce. Only the BOUNDS differ (a venue may take orders 20 minutes out but
 * bookings an hour out), so the booking config is projected onto the scheduling
 * config and the shared engine does the work — including the DST handling that
 * a naive "store the local string" design gets wrong twice a year.
 */

export type BookingConfig = {
  timeZone: string;
  openingHours: SchedulingConfig["openingHours"];
  leadMinutes: number;
  maxDaysAhead: number;
  maxPartySize: number;
  /** How long a table is held, for the overlap check. */
  durationMinutes: number;
};

/** An existing booking that occupies seats for a window. */
export type SeatedWindow = {
  bookedForMs: number;
  partySize: number;
};

export type BookingSlotResult =
  | { ok: true; instant: Date }
  | { ok: false; error: string };

function toSchedulingConfig(config: BookingConfig): SchedulingConfig {
  return {
    timeZone: config.timeZone,
    openingHours: config.openingHours,
    leadMinutes: config.leadMinutes,
    maxDaysAhead: config.maxDaysAhead,
  };
}

/**
 * The bookable days/times for the picker. Identical rules to the pickup picker,
 * so a time the form offers always passes {@link validateBookingRequest}.
 */
export function buildBookingSlots(
  config: BookingConfig,
  nowMs: number,
): PickupDay[] {
  return buildPickupSlots(toSchedulingConfig(config), nowMs);
}

/**
 * Validate a requested "YYYY-MM-DDTHH:MM" venue-local wall clock against the
 * venue's hours, lead time and horizon, and the party size against the venue's
 * cap. Returns the absolute instant to store.
 *
 * This is the AUTHORITATIVE check. The picker mirrors it for fast feedback, but
 * the form is a public, unauthenticated surface, so nothing it sends is trusted.
 */
export function validateBookingRequest(
  config: BookingConfig,
  wallClock: string,
  partySize: number,
  nowMs: number,
): BookingSlotResult {
  if (!Number.isInteger(partySize) || partySize < 1) {
    return { ok: false, error: "Choose how many people are coming." };
  }
  if (partySize > config.maxPartySize) {
    return {
      ok: false,
      error: `We can take bookings for up to ${config.maxPartySize} people online. Please call us for a larger group.`,
    };
  }

  const slot = validateScheduledForConfig(
    toSchedulingConfig(config),
    wallClock,
    nowMs,
  );
  if (!slot.ok) return slot;
  return { ok: true, instant: slot.instant };
}

/**
 * Whether a new booking fits alongside the ones already held.
 *
 * The model is deliberately simple and stated rather than implied: a booking
 * occupies `durationMinutes` from its start, and the venue can seat `capacity`
 * people at once. A request fits when, at every moment it would occupy, the
 * total party size of overlapping bookings plus this one stays within capacity.
 *
 * Checking only the NEW booking's start instant is not enough — a request can
 * clear its own start and still collide in the middle of an earlier, longer
 * sitting — so the overlap is evaluated at each existing booking's start too.
 * Those are the only instants where occupancy can rise, which makes this exact
 * rather than a sample.
 *
 * `capacity` of 0 means the venue has not configured tables. Capacity is then
 * UNKNOWN, and an unknown limit must not silently reject real customers, so the
 * check passes and the owner decides. That is stated here because the opposite
 * default (reject) would be an invisible way to lose bookings.
 */
export function fitsCapacity(
  config: BookingConfig,
  capacity: number,
  existing: SeatedWindow[],
  requestedMs: number,
  partySize: number,
): boolean {
  if (capacity <= 0) return true;
  if (partySize > capacity) return false;

  const durationMs = config.durationMinutes * 60_000;
  const requestedEnd = requestedMs + durationMs;

  const overlapping = existing.filter(
    (b) =>
      b.bookedForMs < requestedEnd && b.bookedForMs + durationMs > requestedMs,
  );
  if (overlapping.length === 0) return true;

  // Occupancy only ever RISES at a booking's start, so every local maximum is at
  // one of these instants. Evaluating them all makes this exact.
  const probes = [requestedMs, ...overlapping.map((b) => b.bookedForMs)];
  for (const probe of probes) {
    if (probe < requestedMs || probe >= requestedEnd) continue;
    let seated = partySize;
    for (const b of overlapping) {
      if (b.bookedForMs <= probe && b.bookedForMs + durationMs > probe) {
        seated += b.partySize;
      }
    }
    if (seated > capacity) return false;
  }
  return true;
}
