"use client";

import { useActionState } from "react";

import type { OpeningHoursEntry } from "@/lib/db/schema";
import { OPENING_DAYS } from "@/lib/validation";

import { updateVenueDetails, type VenueSettingsState } from "./actions";

const initialState: VenueSettingsState = {};

const fieldClass =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900";

const timeClass =
  "rounded-md border border-gray-300 px-2 py-1.5 text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900";

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
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-gray-900">
          Street address{" "}
          <span className="font-normal text-gray-400">(optional)</span>
          <input
            name="streetAddress"
            type="text"
            maxLength={120}
            defaultValue={details.streetAddress ?? ""}
            placeholder="12 Sturt St"
            className={`mt-1 ${fieldClass}`}
          />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="block text-sm font-medium text-gray-900">
          Suburb
          <input
            name="suburb"
            type="text"
            maxLength={80}
            defaultValue={details.suburb ?? ""}
            placeholder="Townsville"
            className={`mt-1 ${fieldClass}`}
          />
        </label>
        <label className="block text-sm font-medium text-gray-900">
          State
          <input
            name="state"
            type="text"
            maxLength={60}
            defaultValue={details.state ?? ""}
            placeholder="QLD"
            className={`mt-1 ${fieldClass}`}
          />
        </label>
        <label className="block text-sm font-medium text-gray-900">
          Postcode
          <input
            name="postcode"
            type="text"
            maxLength={16}
            defaultValue={details.postcode ?? ""}
            placeholder="4810"
            className={`mt-1 ${fieldClass}`}
          />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-gray-900">
          Country
          <input
            name="country"
            type="text"
            maxLength={56}
            defaultValue={details.country ?? "AU"}
            className={`mt-1 ${fieldClass}`}
          />
        </label>
        <label className="block text-sm font-medium text-gray-900">
          Phone <span className="font-normal text-gray-400">(optional)</span>
          <input
            name="phone"
            type="tel"
            maxLength={32}
            defaultValue={details.phone ?? ""}
            placeholder="+61 7 4700 0000"
            className={`mt-1 ${fieldClass}`}
          />
        </label>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-gray-900">
          Opening hours{" "}
          <span className="font-normal text-gray-400">
            (optional — leave a day blank if it has no set hours)
          </span>
        </legend>
        <div className="space-y-1.5">
          {OPENING_DAYS.map(({ key, label, day }) => {
            const entry = hoursByDay.get(day);
            return (
              <div key={key} className="flex items-center gap-3">
                <span className="w-24 text-sm text-gray-700">{label}</span>
                <input
                  name={`${key}Open`}
                  type="time"
                  defaultValue={entry?.opens ?? ""}
                  aria-label={`${label} opening time`}
                  className={timeClass}
                />
                <span className="text-sm text-gray-400">to</span>
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
        <label className="block text-sm font-medium text-gray-900">
          Latitude <span className="font-normal text-gray-400">(optional)</span>
          <input
            name="latitude"
            type="text"
            inputMode="decimal"
            defaultValue={details.latitude ?? ""}
            placeholder="-19.2589"
            className={`mt-1 ${fieldClass}`}
          />
        </label>
        <label className="block text-sm font-medium text-gray-900">
          Longitude{" "}
          <span className="font-normal text-gray-400">(optional)</span>
          <input
            name="longitude"
            type="text"
            inputMode="decimal"
            defaultValue={details.longitude ?? ""}
            placeholder="146.8169"
            className={`mt-1 ${fieldClass}`}
          />
        </label>
      </div>
      <p className="text-xs text-gray-500">
        Set both latitude and longitude (from Google Maps) to place your venue on
        the map in its search listing, or leave both blank.
      </p>

      <div className="border-t border-gray-100 pt-5">
        <label className="flex items-start gap-3 text-sm font-medium text-gray-900">
          <input
            type="checkbox"
            name="schedulingEnabled"
            defaultChecked={details.schedulingEnabled}
            className="mt-0.5 h-4 w-4 rounded border-gray-300"
          />
          <span>
            Accept scheduled pickup orders
            <span className="mt-0.5 block text-xs font-normal text-gray-500">
              Lets customers choose a pickup time within your opening hours, using
              the window set below. Requires opening hours set above.
            </span>
          </span>
        </label>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-gray-900">
            Earliest pickup (minutes from now)
            <input
              name="schedulingLeadMinutes"
              type="number"
              min={0}
              max={1440}
              step={5}
              defaultValue={details.schedulingLeadMinutes}
              className={`mt-1 ${fieldClass}`}
            />
          </label>
          <label className="block text-sm font-medium text-gray-900">
            Schedule up to (days ahead)
            <input
              name="schedulingMaxDaysAhead"
              type="number"
              min={1}
              max={30}
              step={1}
              defaultValue={details.schedulingMaxDaysAhead}
              className={`mt-1 ${fieldClass}`}
            />
          </label>
        </div>
      </div>

      {state.error ? (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="text-sm text-green-600" role="status">
          Saved.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save details"}
      </button>
    </form>
  );
}
