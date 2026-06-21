"use client";

import { useActionState } from "react";

import { updateVenueSettings, type VenueSettingsState } from "./actions";

const initialState: VenueSettingsState = {};

const fieldClass =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900";

type VenueSettings = {
  brandColor: string;
  logoUrl: string | null;
  storefrontDescription: string | null;
};

export function SettingsForm({ settings }: { settings: VenueSettings }) {
  const [state, formAction, pending] = useActionState(
    updateVenueSettings,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-gray-900">
          Brand colour
          <span className="ml-1 font-normal text-gray-400">
            (storefront accent)
          </span>
          <input
            name="brandColor"
            type="color"
            defaultValue={settings.brandColor}
            className="mt-1 block h-10 w-20 cursor-pointer rounded-md border border-gray-300"
          />
        </label>
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-gray-900">
          Logo URL <span className="font-normal text-gray-400">(optional)</span>
          <input
            name="logoUrl"
            type="url"
            maxLength={2048}
            defaultValue={settings.logoUrl ?? ""}
            placeholder="https://…/logo.png"
            className={`mt-1 ${fieldClass}`}
          />
        </label>
        <p className="text-xs text-gray-500">
          Paste a hosted image URL. Uploads arrive in a later update.
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-gray-900">
          Storefront description{" "}
          <span className="font-normal text-gray-400">(optional)</span>
          <textarea
            name="storefrontDescription"
            rows={3}
            maxLength={500}
            defaultValue={settings.storefrontDescription ?? ""}
            placeholder="A short welcome line shown under your venue name."
            className={`mt-1 ${fieldClass}`}
          />
        </label>
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
        {pending ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}
