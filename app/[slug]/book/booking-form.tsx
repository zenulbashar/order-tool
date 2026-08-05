"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";

import { Button } from "@/app/_components/button";
import { controlClass } from "@/app/_components/field";
import { buildBookingSlots, type BookingConfig } from "@/lib/bookings/availability";

import { createBooking } from "./actions";

const sectionLabel =
  "block font-mono text-2xs font-bold uppercase tracking-wider text-label";

/** "14:30" -> "2:30 PM" for display only; the submitted value stays 24h. */
function formatTimeLabel(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h < 12 ? "AM" : "PM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

/**
 * The diner's booking form.
 *
 * Slots come from buildBookingSlots — the SAME function the server gate uses —
 * so a time this form offers always passes validation. `nowMs` is the
 * request-time "now" captured on the server and passed in, so the slot list is
 * identical on both sides and there is no hydration mismatch and no clock read
 * during render. This mirrors SchedulePicker deliberately: a diner should not
 * meet two different time pickers in one storefront.
 *
 * Nothing here is trusted by the server. It exists to make the valid choices
 * obvious, not to enforce them.
 */
export function BookingForm({
  slug,
  config,
  nowMs,
}: {
  slug: string;
  config: BookingConfig;
  nowMs: number;
}) {
  const days = useMemo(() => buildBookingSlots(config, nowMs), [config, nowMs]);

  const [dayDate, setDayDate] = useState(days[0]?.date ?? "");
  const [time, setTime] = useState(days[0]?.times[0] ?? "");
  const [partySize, setPartySize] = useState(2);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (days.length === 0) {
    return (
      <p className="rounded-card border border-line bg-surface-elevated p-4 text-sm text-muted">
        There are no bookable times right now. Please call us instead.
      </p>
    );
  }

  const activeDay = days.find((d) => d.date === dayDate) ?? days[0];
  const activeTime = activeDay.times.includes(time) ? time : activeDay.times[0];

  const partyOptions = Array.from(
    { length: config.maxPartySize },
    (_, i) => i + 1,
  );

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createBooking({
        slug,
        bookedFor: `${activeDay.date}T${activeTime}`,
        partySize,
        customerName: name,
        customerEmail: email,
        customerPhone: phone || null,
        notes: notes || null,
      });
      if (result.ok) {
        // Full navigation: the confirmation page is server-rendered from the
        // token and must not read a stale client cache of a page that did not
        // exist a moment ago.
        window.location.assign(`/${slug}/book/${result.token}`);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div>
        <span className={sectionLabel}>Day</span>
        <div className="mt-2 flex flex-wrap gap-2">
          {days.map((day) => (
            <button
              key={day.date}
              type="button"
              onClick={() => {
                setDayDate(day.date);
                setTime(day.times[0] ?? "");
              }}
              aria-pressed={day.date === activeDay.date}
              className={`rounded-control px-3 py-2 text-sm font-semibold transition ${
                day.date === activeDay.date
                  ? "bg-[var(--brand)] text-[var(--on-brand)]"
                  : "border border-line bg-surface-elevated text-ink hover:bg-sand"
              }`}
            >
              {day.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className={sectionLabel} htmlFor="booking-time">
          Time
        </label>
        <select
          id="booking-time"
          value={activeTime}
          onChange={(event) => setTime(event.target.value)}
          className={`${controlClass()} mt-2`}
        >
          {activeDay.times.map((t) => (
            <option key={t} value={t}>
              {formatTimeLabel(t)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={sectionLabel} htmlFor="booking-party">
          How many people
        </label>
        <select
          id="booking-party"
          value={partySize}
          onChange={(event) => setPartySize(Number(event.target.value))}
          className={`${controlClass()} mt-2`}
        >
          {partyOptions.map((n) => (
            <option key={n} value={n}>
              {n === 1 ? "1 person" : `${n} people`}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted">
          Booking for more than {config.maxPartySize}? Please give us a call.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={sectionLabel} htmlFor="booking-name">
            Your name
          </label>
          <input
            id="booking-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            autoComplete="name"
            className={`${controlClass()} mt-2`}
          />
        </div>
        <div>
          <label className={sectionLabel} htmlFor="booking-phone">
            Phone <span className="font-sans normal-case text-muted">(optional)</span>
          </label>
          <input
            id="booking-phone"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            inputMode="tel"
            autoComplete="tel"
            className={`${controlClass()} mt-2`}
          />
        </div>
      </div>

      <div>
        <label className={sectionLabel} htmlFor="booking-email">
          Email
        </label>
        <input
          id="booking-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          autoComplete="email"
          className={`${controlClass()} mt-2`}
        />
        <p className="mt-1 text-xs text-muted">
          We&apos;ll send your confirmation here.
        </p>
      </div>

      <div>
        <label className={sectionLabel} htmlFor="booking-notes">
          Anything we should know?{" "}
          <span className="font-sans normal-case text-muted">(optional)</span>
        </label>
        <textarea
          id="booking-notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={3}
          maxLength={280}
          placeholder="Allergies, a birthday, a seating preference"
          className={`${controlClass()} mt-2 resize-y`}
        />
      </div>

      {error ? (
        <p className="text-sm text-[var(--color-warm)]" role="alert">
          {error}
        </p>
      ) : null}

      <Button type="submit" variant="primary" size="lg" loading={pending}>
        Book this table
      </Button>

      <p className="text-xs text-muted">
        Just want to order? <Link href={`/${slug}`} className="underline">See the menu</Link>.
      </p>
    </form>
  );
}
