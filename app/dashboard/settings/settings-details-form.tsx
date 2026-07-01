"use client";

import { useActionState } from "react";

import { Button } from "@/app/_components/button";
import { Input } from "@/app/_components/input";
import { Checkbox } from "@/app/_components/selection-controls";
import type { OpeningHoursEntry } from "@/lib/db/schema";
import { OPENING_DAYS } from "@/lib/validation";

import { updateVenueDetails, type VenueSettingsState } from "./actions";

const initialState: VenueSettingsState = {};

// Space Mono micro-eyebrow, matching the menu editor's field labels.
const microLabel =
  "mb-1 block font-mono text-[9px] font-bold uppercase tracking-wider text-label";

// Compact time input on the foundation focus recipe (amber focus-visible border
// + subtle ring), matching every other control — but not w-full (stays compact).
const timeClass =
  "rounded-input border border-line bg-surface-elevated px-2 py-1.5 text-sm text-ink shadow-sm focus-visible:border-[var(--color-accent)] focus-visible:shadow-[var(--focus-ring-input)] focus-visible:outline-none";

type VenueDetails = {
  streetAddress: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  country: string | null;
  phone: string | null;
  openingHours: OpeningHoursEntry[] | null;
  latitude: number | null;
  longitude: number | null;
  schedulingEnabled: boolean;
  schedulingLeadMinutes: number;
  schedulingMaxDaysAhead: number;
};

export function SettingsDetailsForm({ details }: { details: VenueDetails }) {
  const [state, formAction, pending] = useActionState(
    updateVenueDetails,
    initialState,
  );

  const hoursByDay = new Map(
    (details.openingHours ?? []).map((entry) => [entry.day, entry]),
  );

  return (
    <form action={formAction} className="space-y-5">
      <label className="block">
        <span className={microLabel}>
          Street address{" "}
          <span className="font-normal normal-case text-muted">(optional)</span>
        </span>
        <Input
          name="streetAddress"
          type="text"
          maxLength={120}
          defaultValue={details.streetAddress ?? ""}
          placeholder="12 Sturt St"
        />
      </label>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="block">
          <span className={microLabel}>Suburb</span>
          <Input
            name="suburb"
            type="text"
            maxLength={80}
            defaultValue={details.suburb ?? ""}
            placeholder="Townsville"
          />
        </label>
        <label className="block">
          <span className={microLabel}>State</span>
          <Input
            name="state"
            type="text"
            maxLength={60}
            defaultValue={details.state ?? ""}
            placeholder="QLD"
          />
        </label>
        <label className="block">
          <span className={microLabel}>Postcode</span>
          <Input
            name="postcode"
            type="text"
            maxLength={16}
            defaultValue={details.postcode ?? ""}
            placeholder="4810"
          />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={microLabel}>Country</span>
          <Input
            name="country"
            type="text"
            maxLength={56}
            defaultValue={details.country ?? "AU"}
          />
        </label>
        <label className="block">
          <span className={microLabel}>
            Phone{" "}
            <span className="font-normal normal-case text-muted">(optional)</span>
          </span>
          <Input
            name="phone"
            type="tel"
            maxLength={32}
            defaultValue={details.phone ?? ""}
            placeholder="+61 7 4700 0000"
          />
        </label>
      </div>

      <fieldset className="space-y-2">
        <legend className={microLabel}>
          Opening hours{" "}
          <span className="font-normal normal-case text-muted">
            (optional — leave a day blank if it has no set hours)
          </span>
        </legend>
        <div className="space-y-1.5">
          {OPENING_DAYS.map(({ key, label, day }) => {
            const entry = hoursByDay.get(day);
            return (
              <div key={key} className="flex items-center gap-3">
                <span className="w-24 text-sm text-muted">{label}</span>
                <input
                  name={`${key}Open`}
                  type="time"
                  defaultValue={entry?.opens ?? ""}
                  aria-label={`${label} opening time`}
                  className={timeClass}
                />
                <span className="text-sm text-muted">to</span>
                <input
                  name={`${key}Close`}
                  type="time"
                  defaultValue={entry?.closes ?? ""}
                  aria-label={`${label} closing time`}
                  className={timeClass}
                />
              </div>
            );
          })}
        </div>
      </fieldset>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={microLabel}>
            Latitude{" "}
            <span className="font-normal normal-case text-muted">(optional)</span>
          </span>
          <Input
            name="latitude"
            type="text"
            inputMode="decimal"
            defaultValue={details.latitude ?? ""}
            placeholder="-19.2589"
          />
        </label>
        <label className="block">
          <span className={microLabel}>
            Longitude{" "}
            <span className="font-normal normal-case text-muted">(optional)</span>
          </span>
          <Input
            name="longitude"
            type="text"
            inputMode="decimal"
            defaultValue={details.longitude ?? ""}
            placeholder="146.8169"
          />
        </label>
      </div>
      <p className="text-xs text-muted">
        Set both latitude and longitude (from Google Maps) to place your venue on
        the map in its search listing, or leave both blank.
      </p>

      <div className="border-t border-line pt-5">
        <label className="flex items-start gap-3 text-sm font-medium text-ink">
          <Checkbox
            name="schedulingEnabled"
            defaultChecked={details.schedulingEnabled}
            className="mt-0.5"
          />
          <span>
            Accept scheduled pickup orders
            <span className="mt-0.5 block text-xs font-normal text-muted">
              Lets customers choose a pickup time within your opening hours, using
              the window set below. Requires opening hours set above.
            </span>
          </span>
        </label>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={microLabel}>Earliest pickup (minutes from now)</span>
            <Input
              name="schedulingLeadMinutes"
              type="number"
              min={0}
              max={1440}
              step={5}
              defaultValue={details.schedulingLeadMinutes}
            />
          </label>
          <label className="block">
            <span className={microLabel}>Schedule up to (days ahead)</span>
            <Input
              name="schedulingMaxDaysAhead"
              type="number"
              min={1}
              max={30}
              step={1}
              defaultValue={details.schedulingMaxDaysAhead}
            />
          </label>
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

      <Button type="submit" variant="primary" loading={pending} loadingLabel="Saving…">
        Save details <span aria-hidden="true">→</span>
      </Button>
    </form>
  );
}
