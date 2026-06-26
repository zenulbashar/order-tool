"use client";

import { useActionState, useState } from "react";

import { createVenue, type CreateVenueState } from "./actions";

const initialState: CreateVenueState = {};

const fieldClass =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900";

export function OnboardingForm({ baseHost }: { baseHost: string }) {
  const [state, formAction, pending] = useActionState(createVenue, initialState);
  // Controlled SOLELY to drive the live link preview below — name="slug" and the
  // posted value are unchanged. We show the RAW typed value; slugSchema still
  // owns the lowercase/hyphen normalization and validation at submit time.
  const [slug, setSlug] = useState("");

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor="name" className="block text-sm font-medium text-gray-900">
          Venue name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          maxLength={80}
          autoComplete="organization"
          placeholder="The Corner Cafe"
          className={fieldClass}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="slug" className="block text-sm font-medium text-gray-900">
          Storefront link name
        </label>
        <input
          id="slug"
          name="slug"
          type="text"
          required
          maxLength={40}
          inputMode="url"
          placeholder="corner-cafe"
          value={slug}
          onChange={(event) => setSlug(event.target.value)}
          className={fieldClass}
        />
        <p className="text-xs text-gray-500">
          This is the name in your shop’s public web link — {baseHost}/your-name.
          Lowercase letters, numbers, and hyphens only. You’ll add your venue’s
          physical address later in Settings.
        </p>
        <p className="text-xs text-gray-600">
          Your storefront link:{" "}
          <span className="font-medium text-gray-900">{baseHost}/</span>
          <span className={slug ? "font-medium text-gray-900" : "text-gray-400"}>
            {slug || "corner-cafe"}
          </span>
        </p>
      </div>

      {state.error ? (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-60"
      >
        {pending ? "Creating…" : "Create venue"}
      </button>
    </form>
  );
}
