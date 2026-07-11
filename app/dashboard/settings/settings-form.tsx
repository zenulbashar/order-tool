"use client";

import { useActionState, useRef, useState } from "react";

import { Button } from "@/app/_components/button";
import { cx } from "@/app/_components/cx";
import { Textarea } from "@/app/_components/textarea";

import { updateVenueSettings, type VenueSettingsState } from "./actions";

const initialState: VenueSettingsState = {};

// Space Mono micro-eyebrow, matching the menu editor's field labels.
const microLabel =
  "mb-1 block font-mono text-[9px] font-bold uppercase tracking-wider text-label";

// Preset brand-colour swatches (design export). Literal hex — these are colour
// samples, not UI chrome. The native picker stays the full-spectrum custom entry.
const BRAND_PRESETS = ["#f4b43c", "#e2553a", "#13301f", "#3fa66a", "#635bff"];

type VenueSettings = {
  brandColor: string;
  textColor: string | null;
  storefrontDescription: string | null;
};

export function SettingsForm({ settings }: { settings: VenueSettings }) {
  const [state, formAction, pending] = useActionState(
    updateVenueSettings,
    initialState,
  );

  // The native colour input stays the SOLE posting element (uncontrolled,
  // defaultValue) so the FormData value + full-spectrum picking are byte-
  // identical. Presets imperatively write into it; `brandColor` state only
  // drives the selection ring + hex readout, mirrored from the input's onChange.
  const colorRef = useRef<HTMLInputElement>(null);
  const [brandColor, setBrandColor] = useState(settings.brandColor);
  // Text colour: "auto" (null → the storefront's default ink) unless the owner
  // opts into a custom one. The mode posts alongside the picker value.
  const [customText, setCustomText] = useState(Boolean(settings.textColor));
  const [textColor, setTextColor] = useState(settings.textColor ?? "#0e1f18");

  const pickPreset = (hex: string) => {
    if (colorRef.current) colorRef.current.value = hex;
    setBrandColor(hex);
  };

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-1.5">
        <span className={microLabel}>
          Brand colour{" "}
          <span className="font-normal normal-case text-muted">
            (storefront accent)
          </span>
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {BRAND_PRESETS.map((hex) => {
            const selected = brandColor.toLowerCase() === hex;
            return (
              <button
                key={hex}
                type="button"
                onClick={() => pickPreset(hex)}
                aria-label={`Use brand colour ${hex}`}
                aria-pressed={selected}
                style={{ backgroundColor: hex }}
                className={cx(
                  "h-8 w-8 rounded-control border border-line transition",
                  selected &&
                    "ring-2 ring-[var(--color-accent)] ring-offset-2 ring-offset-surface-elevated",
                )}
              />
            );
          })}
          {/* Custom picker — the native colour input is the posting element and
              the full-spectrum "custom" entry (name/type/defaultValue
              byte-identical). onChange only mirrors the value into local state
              for the ring + readout; it never becomes controlled. Drives
              venue.brandColor, injected as --brand on the diner storefront. */}
          <label className="relative inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-control border border-dashed border-line-strong font-mono text-xs font-bold text-label">
            #
            <input
              ref={colorRef}
              name="brandColor"
              type="color"
              defaultValue={settings.brandColor}
              onChange={(event) => setBrandColor(event.target.value)}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </label>
          <span className="font-mono text-xs text-muted">{brandColor}</span>
        </div>
      </div>

      <div className="space-y-1.5">
        <span className={microLabel}>
          Text colour{" "}
          <span className="font-normal normal-case text-muted">
            (storefront headings &amp; body)
          </span>
        </span>
        <input
          type="hidden"
          name="textColorMode"
          value={customText ? "custom" : "auto"}
        />
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={customText}
              onChange={(event) => setCustomText(event.target.checked)}
              className="h-4 w-4 accent-[var(--color-forest)]"
            />
            Custom
          </label>
          {customText ? (
            <>
              <label className="relative inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-control border border-line">
                <span
                  className="h-5 w-5 rounded"
                  style={{ backgroundColor: textColor }}
                />
                <input
                  name="textColor"
                  type="color"
                  value={textColor}
                  onChange={(event) => setTextColor(event.target.value)}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
              </label>
              <span className="font-mono text-xs text-muted">{textColor}</span>
            </>
          ) : (
            <span className="text-xs text-muted">
              Auto — a deep neutral chosen to read well with your brand colour.
            </span>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="block">
          <span className={microLabel}>
            Storefront description{" "}
            <span className="font-normal normal-case text-muted">(optional)</span>
          </span>
          <Textarea
            name="storefrontDescription"
            rows={3}
            maxLength={500}
            defaultValue={settings.storefrontDescription ?? ""}
            placeholder="A short welcome line shown under your venue name."
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
        Save settings <span aria-hidden="true">→</span>
      </Button>
    </form>
  );
}
