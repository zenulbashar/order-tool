"use client";

import { useActionState } from "react";

import { Button } from "@/app/_components/button";
import { controlClass } from "@/app/_components/field";

import { saveBookingSettings, type VenueSettingsState } from "./actions";

const initialState: VenueSettingsState = {};

const microLabel =
  "mb-1 block font-mono text-2xs font-bold uppercase tracking-wider text-label";
const inputClass = controlClass({ padding: "px-3 py-2.5", width: "w-full" });

export type BookingSettings = {
  enabled: boolean;
  leadMinutes: number;
  maxDaysAhead: number;
  maxPartySize: number;
  durationMinutes: number;
  /** Whether the venue has opening hours — bookings are inert without them. */
  hasHours: boolean;
};

export function BookingForm({ booking }: { booking: BookingSettings }) {
  const [state, formAction, pending] = useActionState(
    saveBookingSettings,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-5">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          name="bookingsEnabled"
          defaultChecked={booking.enabled}
          className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]"
        />
        <span>
          <span className="block text-sm font-semibold text-ink">
            Take table bookings online
          </span>
          <span className="block text-xs text-muted">
            Adds a &ldquo;Book a table&rdquo; link to your storefront. You and the
            diner both get an email for every booking, and they appear under
            Bookings.
          </span>
        </span>
      </label>

      {/* Stated rather than silently tolerated: the toggle saves fine without
          hours, but nothing becomes bookable, and an owner who could not see why
          would reasonably think the feature was broken. */}
      {!booking.hasHours ? (
        <p className="rounded-control border border-[var(--color-warm)]/40 bg-[var(--color-warm)]/10 px-3 py-2 text-xs text-ink">
          Set your <strong>opening hours</strong> first — bookable times are built
          from them, so until they&rsquo;re set there is nothing for a diner to
          choose.
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={microLabel} htmlFor="bookingLeadMinutes">
            Notice needed (minutes)
          </label>
          <input
            id="bookingLeadMinutes"
            name="bookingLeadMinutes"
            type="number"
            min={0}
            max={10080}
            step={5}
            defaultValue={booking.leadMinutes}
            className={inputClass}
          />
          <p className="mt-1 text-xs text-muted">
            How soon before a sitting a diner can still book.
          </p>
        </div>

        <div>
          <label className={microLabel} htmlFor="bookingMaxDaysAhead">
            Book up to (days ahead)
          </label>
          <input
            id="bookingMaxDaysAhead"
            name="bookingMaxDaysAhead"
            type="number"
            min={1}
            max={365}
            defaultValue={booking.maxDaysAhead}
            className={inputClass}
          />
        </div>

        <div>
          <label className={microLabel} htmlFor="bookingMaxPartySize">
            Largest party online
          </label>
          <input
            id="bookingMaxPartySize"
            name="bookingMaxPartySize"
            type="number"
            min={1}
            max={100}
            defaultValue={booking.maxPartySize}
            className={inputClass}
          />
          <p className="mt-1 text-xs text-muted">
            Bigger groups are told to call you.
          </p>
        </div>

        <div>
          <label className={microLabel} htmlFor="bookingDurationMinutes">
            Table time (minutes)
          </label>
          <input
            id="bookingDurationMinutes"
            name="bookingDurationMinutes"
            type="number"
            min={15}
            max={480}
            step={15}
            defaultValue={booking.durationMinutes}
            className={inputClass}
          />
          <p className="mt-1 text-xs text-muted">
            Used to work out how many tables are free at a time. Diners never see
            it.
          </p>
        </div>
      </div>

      {state.error ? (
        <p className="text-sm text-[var(--color-warm)]" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="text-sm text-[var(--color-success)]" role="status">
          Saved.
        </p>
      ) : null}

      <Button type="submit" variant="primary" loading={pending}>
        Save booking settings
      </Button>
    </form>
  );
}
