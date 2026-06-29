"use client";

import { useActionState, useState } from "react";

import { slugify } from "@/lib/validation";

import { createVenueFromOnboarding, type DetailsState } from "./actions";

const initialState: DetailsState = {};

const fieldClass =
  "w-full rounded-md border border-sand bg-surface-elevated px-3 py-2 text-sm text-ink shadow-sm focus:border-forest focus:outline-none focus:ring-1 focus:ring-forest";
const labelClass = "block text-sm font-medium text-ink";

const VENUE_TYPE_OPTIONS = [
  { value: "cafe", label: "Cafe" },
  { value: "restaurant", label: "Restaurant" },
  { value: "bar", label: "Bar" },
  { value: "bakery", label: "Bakery" },
  { value: "food_truck", label: "Food truck" },
] as const;

export function DetailsForm({ baseHost }: { baseHost: string }) {
  const [state, formAction, pending] = useActionState(
    createVenueFromOnboarding,
    initialState,
  );

  // The slug is auto-suggested from the name until the owner edits it directly.
  // This is the Address->slug fix: nobody hand-types the public link from
  // scratch (and nobody types a street address into it). slugSchema still owns
  // validation at submit; this only drives the suggestion + the live preview.
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  function onNameChange(name: string) {
    if (!slugTouched) setSlug(slugify(name));
  }

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor="name" className={labelClass}>
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
          onChange={(event) => onNameChange(event.target.value)}
        />
      </div>

      <fieldset className="space-y-1.5">
        <legend className={labelClass}>Venue type</legend>
        <div className="flex flex-wrap gap-2">
          {VENUE_TYPE_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="cursor-pointer rounded-md border border-sand px-3 py-1.5 text-sm text-ink transition has-[:checked]:border-forest has-[:checked]:bg-forest has-[:checked]:text-surface-elevated"
            >
              <input
                type="radio"
                name="venueType"
                value={option.value}
                className="sr-only"
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <label htmlFor="slug" className={labelClass}>
          Storefront link
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
          onChange={(event) => {
            setSlug(event.target.value);
            setSlugTouched(true);
          }}
          className={fieldClass}
        />
        <p className="text-xs text-muted">
          Your storefront link:{" "}
          <span className="font-medium text-ink">{baseHost}/</span>
          <span className={slug ? "font-medium text-ink" : "text-muted"}>
            {slug || "corner-cafe"}
          </span>
          . Lowercase letters, numbers, and hyphens only.
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="streetAddress" className={labelClass}>
          Street address{" "}
          <span className="font-normal text-muted">(optional)</span>
        </label>
        <input
          id="streetAddress"
          name="streetAddress"
          type="text"
          maxLength={200}
          autoComplete="street-address"
          placeholder="123 Main Street"
          className={fieldClass}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor="suburb" className={labelClass}>
            Suburb
          </label>
          <input
            id="suburb"
            name="suburb"
            type="text"
            maxLength={100}
            className={fieldClass}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="state" className={labelClass}>
            State
          </label>
          <input
            id="state"
            name="state"
            type="text"
            maxLength={100}
            className={fieldClass}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="postcode" className={labelClass}>
            Postcode
          </label>
          <input
            id="postcode"
            name="postcode"
            type="text"
            maxLength={20}
            inputMode="numeric"
            className={fieldClass}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="country" className={labelClass}>
            Country
          </label>
          <input
            id="country"
            name="country"
            type="text"
            maxLength={100}
            defaultValue="AU"
            className={fieldClass}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="phone" className={labelClass}>
          Phone <span className="font-normal text-muted">(optional)</span>
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          maxLength={40}
          autoComplete="tel"
          placeholder="07 1234 5678"
          className={fieldClass}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="logoUrl" className={labelClass}>
          Logo URL <span className="font-normal text-muted">(optional)</span>
        </label>
        <input
          id="logoUrl"
          name="logoUrl"
          type="url"
          maxLength={2048}
          placeholder="https://…/logo.png"
          className={fieldClass}
        />
        <p className="text-xs text-muted">
          Paste a hosted image URL for now. You can add or change it later.
        </p>
      </div>

      {state.error ? (
        <p className="text-sm text-error" role="alert">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-forest px-4 py-2 text-sm font-medium text-surface-elevated transition hover:bg-forest-deep disabled:opacity-60"
      >
        {pending ? "Saving…" : "Continue"}
      </button>
    </form>
  );
}
