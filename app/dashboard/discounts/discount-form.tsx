"use client";

import { useActionState, useState } from "react";

import { Button } from "@/app/_components/button";

import { createOwnerDiscount, type DiscountState } from "./actions";

const initialState: DiscountState = {};

const microLabel =
  "mb-1 block font-mono text-[9px] font-bold uppercase tracking-wider text-label";
const inputClass =
  "w-full rounded-input border border-line bg-surface-elevated px-3 py-2.5 text-sm text-ink shadow-sm focus-visible:border-[var(--color-accent)] focus-visible:shadow-[var(--focus-ring-input)] focus-visible:outline-none";

export function DiscountForm() {
  const [state, formAction, pending] = useActionState(
    createOwnerDiscount,
    initialState,
  );
  const [type, setType] = useState<"percent" | "amount">("percent");

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={microLabel}>Name</span>
          <input
            name="name"
            type="text"
            required
            maxLength={80}
            placeholder="Launch week"
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className={microLabel}>Code (diners type this)</span>
          <input
            name="code"
            type="text"
            required
            maxLength={24}
            autoCapitalize="characters"
            autoComplete="off"
            placeholder="LAUNCH10"
            className={`${inputClass} uppercase placeholder:normal-case`}
          />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className={microLabel}>Type</span>
          <select
            name="type"
            value={type}
            onChange={(event) => setType(event.target.value as "percent" | "amount")}
            className={inputClass}
          >
            <option value="percent">% off</option>
            <option value="amount">$ off</option>
          </select>
        </label>
        <label className="block">
          <span className={microLabel}>{type === "percent" ? "Percent off" : "Dollars off"}</span>
          <input
            name="value"
            type="text"
            inputMode="decimal"
            required
            placeholder={type === "percent" ? "10" : "5.00"}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className={microLabel}>Min spend ($, optional)</span>
          <input
            name="minBasket"
            type="text"
            inputMode="decimal"
            placeholder="0"
            className={inputClass}
          />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={microLabel}>Who can use it</span>
          <select name="audience" className={inputClass} defaultValue="all">
            <option value="all">Everyone</option>
            <option value="new">New customers only</option>
          </select>
        </label>
        <label className="block">
          <span className={microLabel}>Ends (optional)</span>
          <input name="endsAt" type="date" className={inputClass} />
        </label>
      </div>

      {state.error ? (
        <p className="text-sm text-[var(--color-warm)]" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="text-sm text-[var(--color-success)]" role="status">
          Code created.
        </p>
      ) : null}

      <Button type="submit" variant="primary" loading={pending} loadingLabel="Creating…">
        Create code <span aria-hidden="true">→</span>
      </Button>
    </form>
  );
}
