"use client";

import { useActionState } from "react";

import { Button } from "@/app/_components/button";
import { Textarea } from "@/app/_components/textarea";

import { updateStorefrontAbout, type VenueSettingsState } from "./actions";

const initialState: VenueSettingsState = {};

const microLabel =
  "mb-1 block font-mono text-[9px] font-bold uppercase tracking-wider text-label";

/** The short welcome blurb under the venue name on the storefront. */
export function AboutForm({
  storefrontDescription,
}: {
  storefrontDescription: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    updateStorefrontAbout,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4">
      <label className="block">
        <span className={microLabel}>
          Storefront description{" "}
          <span className="font-normal normal-case text-muted">(optional)</span>
        </span>
        <Textarea
          name="storefrontDescription"
          rows={3}
          maxLength={500}
          defaultValue={storefrontDescription ?? ""}
          placeholder="A short welcome line shown under your venue name."
        />
      </label>

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
        Save <span aria-hidden="true">→</span>
      </Button>
    </form>
  );
}
