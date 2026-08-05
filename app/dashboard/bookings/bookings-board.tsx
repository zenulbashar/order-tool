"use client";

import { useState, useTransition } from "react";

import { StatusBadge, type KitchenTone } from "@/app/_components/status-badge";
import { formatVenueTime } from "@/lib/time";

import { assignBookingTable, setBookingStatus } from "./actions";
import type { BookingStatus, OwnerBooking } from "./queries";

const STATUS_TONE: Record<BookingStatus, KitchenTone> = {
  confirmed: "new",
  seated: "preparing",
  completed: "done",
  cancelled: "done",
  no_show: "done",
};

const STATUS_LABEL: Record<BookingStatus, string> = {
  confirmed: "Booked",
  seated: "Seated",
  completed: "Done",
  cancelled: "Cancelled",
  no_show: "No-show",
};

/**
 * The floor list for a service.
 *
 * Actions are offered by STATUS rather than all at once, so the control the
 * staff member needs is the one under their thumb: a booked party can be seated
 * or cancelled; a seated party can be finished; nothing else has a next step.
 * "No-show" is deliberately available only on a booking that is still `confirmed`
 * — marking a party that already sat down as a no-show is not a real action, and
 * offering it invites a mis-tap during service.
 */
export function BookingsBoard({
  bookings,
  tables,
  timezone,
}: {
  bookings: OwnerBooking[];
  tables: { id: string; label: string }[];
  timezone: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error ?? "That didn't work.");
    });
  }

  if (bookings.length === 0) {
    return (
      <div className="rounded-card border border-line bg-surface-elevated p-6 text-center">
        <p className="text-sm font-semibold text-ink">No bookings yet</p>
        <p className="mt-1 text-sm text-muted">
          When a diner books a table on your storefront it appears here, and you
          and they both get an email.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error ? (
        <p className="text-sm text-[var(--color-warm)]" role="alert">
          {error}
        </p>
      ) : null}

      <ul className="space-y-3">
        {bookings.map((booking) => (
          <li
            key={booking.id}
            className="rounded-card border border-line bg-surface-elevated p-4 shadow-card"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-display text-lg font-extrabold leading-tight text-ink">
                  {formatVenueTime(booking.bookedFor, timezone)}
                </p>
                <p className="mt-0.5 text-sm text-ink">
                  {booking.customerName} &middot;{" "}
                  {booking.partySize === 1
                    ? "1 person"
                    : `${booking.partySize} people`}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  <a
                    href={`mailto:${booking.customerEmail}`}
                    className="underline hover:text-ink"
                  >
                    {booking.customerEmail}
                  </a>
                  {booking.customerPhone ? (
                    <>
                      {" · "}
                      <a
                        href={`tel:${booking.customerPhone}`}
                        className="underline hover:text-ink"
                      >
                        {booking.customerPhone}
                      </a>
                    </>
                  ) : null}
                </p>
              </div>
              <StatusBadge tone={STATUS_TONE[booking.status]} className="shrink-0">
                {STATUS_LABEL[booking.status]}
              </StatusBadge>
            </div>

            {booking.notes ? (
              <div className="mt-3 rounded-control border border-accent/40 bg-accent/10 px-3 py-2">
                <p className="text-eyebrow font-semibold uppercase tracking-wide text-ink">
                  Note
                </p>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-ink">
                  {booking.notes}
                </p>
              </div>
            ) : null}

            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
              {booking.status === "confirmed" ? (
                <>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      run(() => setBookingStatus(booking.id, "seated"))
                    }
                    className="rounded-control bg-ink px-3 py-1.5 text-xs font-bold text-surface transition hover:opacity-90 disabled:opacity-60"
                  >
                    Seat
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      run(() => setBookingStatus(booking.id, "no_show"))
                    }
                    className="rounded-control border border-line px-3 py-1.5 text-xs font-bold text-ink transition hover:bg-sand disabled:opacity-60"
                  >
                    No-show
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      run(() => setBookingStatus(booking.id, "cancelled"))
                    }
                    className="rounded-control border border-line px-3 py-1.5 text-xs font-bold text-ink transition hover:bg-sand disabled:opacity-60"
                  >
                    Cancel
                  </button>
                </>
              ) : null}
              {booking.status === "seated" ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    run(() => setBookingStatus(booking.id, "completed"))
                  }
                  className="rounded-control bg-ink px-3 py-1.5 text-xs font-bold text-surface transition hover:opacity-90 disabled:opacity-60"
                >
                  Finish
                </button>
              ) : null}

              {tables.length > 0 &&
              (booking.status === "confirmed" || booking.status === "seated") ? (
                <label className="ml-auto flex items-center gap-2 text-xs text-muted">
                  Table
                  <select
                    value={booking.tableId ?? ""}
                    disabled={pending}
                    onChange={(event) =>
                      run(() =>
                        assignBookingTable(
                          booking.id,
                          event.target.value || null,
                        ),
                      )
                    }
                    className="rounded-control border border-line bg-surface-elevated px-2 py-1 text-xs text-ink disabled:opacity-60"
                  >
                    <option value="">Unassigned</option>
                    {tables.map((table) => (
                      <option key={table.id} value={table.id}>
                        {table.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : booking.tableLabel ? (
                <span className="ml-auto text-xs text-muted">
                  Table {booking.tableLabel}
                </span>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
