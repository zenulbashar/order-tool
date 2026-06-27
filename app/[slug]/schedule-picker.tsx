"use client";

import { useMemo } from "react";

import { buildPickupSlots, type SchedulingConfig } from "@/lib/schedule";

const selectClass =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900";

/** "14:30" -> "2:30 PM" for display only (the value stays 24h "HH:MM"). */
function formatTimeLabel(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h < 12 ? "AM" : "PM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

/**
 * "ASAP vs schedule for later" pickup picker (Phase 8). Convenience only — it
 * offers venue-local slots from buildPickupSlots (the SAME helper the server gate
 * uses, so an offered slot always passes validation) and emits the chosen time as
 * a NAIVE wall-clock string "YYYY-MM-DDTHH:MM" — never a browser-converted
 * instant. The server re-validates authoritatively in the venue timezone.
 *
 * `nowMs` is the request-time "now" captured on the server and passed in, so the
 * slot list is identical on the server and the client (no clock read in render,
 * no hydration mismatch). ASAP stays the default.
 */
export function SchedulePicker({
  scheduling,
  scheduledFor,
  onScheduledFor,
  nowMs,
}: {
  scheduling: SchedulingConfig | null;
  scheduledFor: string | null;
  onScheduledFor: (next: string | null) => void;
  nowMs: number;
}) {
  const days = useMemo(
    () => (scheduling ? buildPickupSlots(scheduling, nowMs) : []),
    [scheduling, nowMs],
  );

  if (!scheduling || days.length === 0) return null;

  const isLater = scheduledFor !== null;
  const activeDay =
    days.find((day) => day.date === scheduledFor?.slice(0, 10)) ?? days[0];
  const wantedTime = scheduledFor?.slice(11, 16) ?? "";
  const activeTime = activeDay.times.includes(wantedTime)
    ? wantedTime
    : activeDay.times[0];

  return (
    <div className="space-y-3">
      <span className="block text-sm font-medium text-gray-900">Pickup time</span>
      <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
        <button
          type="button"
          onClick={() => onScheduledFor(null)}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
            !isLater ? "bg-white shadow-sm" : "text-gray-500"
          }`}
          style={!isLater ? { color: "var(--brand)" } : undefined}
        >
          ASAP
        </button>
        <button
          type="button"
          onClick={() => onScheduledFor(`${days[0].date}T${days[0].times[0]}`)}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
            isLater ? "bg-white shadow-sm" : "text-gray-500"
          }`}
          style={isLater ? { color: "var(--brand)" } : undefined}
        >
          Schedule for later
        </button>
      </div>

      {isLater ? (
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-sm font-medium text-gray-900">
            Day
            <select
              value={activeDay.date}
              onChange={(event) => {
                const day =
                  days.find((d) => d.date === event.target.value) ?? days[0];
                onScheduledFor(`${day.date}T${day.times[0]}`);
              }}
              className={`mt-1 ${selectClass}`}
            >
              {days.map((day) => (
                <option key={day.date} value={day.date}>
                  {day.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-gray-900">
            Time
            <select
              value={activeTime}
              onChange={(event) =>
                onScheduledFor(`${activeDay.date}T${event.target.value}`)
              }
              className={`mt-1 ${selectClass}`}
            >
              {activeDay.times.map((time) => (
                <option key={time} value={time}>
                  {formatTimeLabel(time)}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
    </div>
  );
}
