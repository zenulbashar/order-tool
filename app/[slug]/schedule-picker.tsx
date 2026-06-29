"use client";

import { useMemo } from "react";

import { Field } from "@/app/_components/field";
import { Segmented } from "@/app/_components/segmented";
import { Select } from "@/app/_components/select";
import { buildPickupSlots, type SchedulingConfig } from "@/lib/schedule";

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
      <span className="block text-sm font-medium text-ink">Pickup time</span>
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
        <div className="grid grid-cols-2 gap-2">
          <Field label="Day" htmlFor="schedule-day">
            <Select
              id="schedule-day"
              value={activeDay.date}
              onChange={(event) => {
                const day =
                  days.find((d) => d.date === event.target.value) ?? days[0];
                onScheduledFor(`${day.date}T${day.times[0]}`);
              }}
            >
              {days.map((day) => (
                <option key={day.date} value={day.date}>
                  {day.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Time" htmlFor="schedule-time">
            <Select
              id="schedule-time"
              value={activeTime}
              onChange={(event) =>
                onScheduledFor(`${activeDay.date}T${event.target.value}`)
              }
            >
              {activeDay.times.map((time) => (
                <option key={time} value={time}>
                  {formatTimeLabel(time)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      ) : null}
    </div>
  );
}
