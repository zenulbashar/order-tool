"use client";

import { useMemo } from "react";

import { Segmented } from "@/app/_components/segmented";
import { buildPickupSlots, type SchedulingConfig } from "@/lib/schedule";

// Space Mono section eyebrow, matching the reconciled diner surfaces.
const sectionLabel =
  "block font-mono text-[9px] font-bold uppercase tracking-wider text-label";

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
      <span className={sectionLabel}>Pickup time</span>
      <Segmented
        label="Pickup time"
        value={isLater ? "later" : "asap"}
        onChange={(next) =>
          next === "asap"
            ? onScheduledFor(null)
            : onScheduledFor(`${days[0].date}T${days[0].times[0]}`)
        }
        options={[
          { value: "asap", label: "ASAP" },
          { value: "later", label: "Schedule for later" },
        ]}
      />

      {isLater ? (
        <div className="space-y-3">
          {/* DAY — chip row. Same value the Day <select> emitted: picking a day
              selects its first available time. */}
          <div className="space-y-2">
            <span className={sectionLabel}>Day</span>
            <div className="flex flex-wrap gap-2">
              {days.map((day) => {
                const selected = day.date === activeDay.date;
                return (
                  <button
                    key={day.date}
                    type="button"
                    aria-pressed={selected}
                    onClick={() =>
                      onScheduledFor(`${day.date}T${day.times[0]}`)
                    }
                    className={`rounded-control border px-4 py-2 text-sm font-medium transition ${
                      selected
                        ? "border-transparent text-[var(--action-contrast)]"
                        : "border-line bg-surface-elevated text-muted hover:bg-sand"
                    }`}
                    style={
                      selected
                        ? { backgroundColor: "var(--action)" }
                        : undefined
                    }
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* PICKUP TIME — slot grid. Same value the Time <select> emitted. */}
          <div className="space-y-2">
            <span className={sectionLabel}>Pickup time</span>
            <div className="grid grid-cols-3 gap-2">
              {activeDay.times.map((time) => {
                const selected = time === activeTime;
                return (
                  <button
                    key={time}
                    type="button"
                    aria-pressed={selected}
                    onClick={() =>
                      onScheduledFor(`${activeDay.date}T${time}`)
                    }
                    className={`rounded-control border px-2 py-2.5 text-center text-sm font-medium text-ink transition ${
                      selected
                        ? "border-[var(--action)] bg-[var(--action)]/8"
                        : "border-line bg-surface-elevated hover:bg-sand"
                    }`}
                  >
                    {formatTimeLabel(time)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
