"use client";

import { useActionState } from "react";

import { createVenue, type CreateVenueState } from "./actions";

const initialState: CreateVenueState = {};

const fieldClass =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900";

export function OnboardingForm() {
  const [state, formAction, pending] = useActionState(createVenue, initialState);

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
          Address
        </label>
        <input
          id="slug"
          name="slug"
          type="text"
          required
          maxLength={40}
          inputMode="url"
          placeholder="corner-cafe"
          className={fieldClass}
        />
        <p className="text-xs text-gray-500">
          Used in your storefront link. Lowercase letters, numbers, and hyphens.
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
