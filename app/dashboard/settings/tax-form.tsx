"use client";

import { useActionState } from "react";
import { controlClass } from "@/app/_components/field";

import { Button } from "@/app/_components/button";

import { saveTaxSettings, type VenueSettingsState } from "./actions";

const initialState: VenueSettingsState = {};

const microLabel =
  "mb-1 block font-mono text-2xs font-bold uppercase tracking-wider text-label";
const inputClass =
  controlClass({ padding: "px-3 py-2.5", width: "w-full" });

type TaxSettings = { enabled: boolean; ratePercent: string; label: string };

export function TaxForm({ tax }: { tax: TaxSettings }) {
  const [state, formAction, pending] = useActionState(
    saveTaxSettings,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-5">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          name="taxEnabled"
          defaultChecked={tax.enabled}
          className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]"
        />
        <span>
          <span className="block text-sm font-semibold text-ink">
            Show tax on receipts
          </span>
          <span className="block text-xs text-muted">
            Your menu prices don&rsquo;t change — we show the tax portion already
            included in the price (GST-inclusive), for the diner&rsquo;s receipt
            and your records.
          </span>
        </span>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className={microLabel}>Rate (%)</span>
          <input
            name="taxRatePercent"
            type="text"
            inputMode="decimal"
            defaultValue={tax.ratePercent}
            placeholder="10"
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className={microLabel}>Label</span>
          <input
            name="taxLabel"
            type="text"
            maxLength={20}
            defaultValue={tax.label}
            placeholder="GST"
            className={inputClass}
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

      <Button
        type="submit"
        variant="primary"
        loading={pending}
        loadingLabel="Saving…"
      >
        Save tax settings <span aria-hidden="true">→</span>
      </Button>
    </form>
  );
}
