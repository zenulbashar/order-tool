"use client";

import { useActionState } from "react";

import { Button } from "@/app/_components/button";
import { Input } from "@/app/_components/input";
import { Textarea } from "@/app/_components/textarea";

import { updateVenueSettings, type VenueSettingsState } from "./actions";

const initialState: VenueSettingsState = {};

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
        <label className="block text-sm font-medium text-ink">
          Brand colour
          <span className="ml-1 font-normal text-muted">
            (storefront accent)
          </span>
          {/* Native colour swatch — type/name/defaultValue are byte-identical;
              only the border/radius tokens changed. Drives venue.brandColor,
              injected as --brand on the diner storefront root. */}
          <input
            name="brandColor"
            type="color"
            defaultValue={settings.brandColor}
            className="mt-1 block h-10 w-20 cursor-pointer rounded-control border border-line"
          />
        </label>
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-ink">
          Logo URL <span className="font-normal text-muted">(optional)</span>
          <Input
            name="logoUrl"
            type="url"
            maxLength={2048}
            defaultValue={settings.logoUrl ?? ""}
            placeholder="https://…/logo.png"
            className="mt-1"
          />
        </label>
        <p className="text-xs text-muted">
          Paste a hosted image URL. Uploads arrive in a later update.
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-ink">
          Storefront description{" "}
          <span className="font-normal text-muted">(optional)</span>
          <Textarea
            name="storefrontDescription"
            rows={3}
            maxLength={500}
            defaultValue={settings.storefrontDescription ?? ""}
            placeholder="A short welcome line shown under your venue name."
            className="mt-1"
          />
        </label>
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
        Save settings
      </Button>
    </form>
  );
}
