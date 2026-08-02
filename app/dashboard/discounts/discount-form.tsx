"use client";

import { useActionState, useState } from "react";
import { controlClass } from "@/app/_components/field";

import { Button } from "@/app/_components/button";

import {
  createOwnerDiscount,
  updateOwnerDiscount,
  type DiscountState,
} from "./actions";

const initialState: DiscountState = {};

const microLabel =
  "mb-1 block font-mono text-2xs font-bold uppercase tracking-wider text-label";
const inputClass =
  controlClass({ padding: "px-3 py-2.5", width: "w-full" });

/** The row shape the list already selects — passed straight through to edit. */
export type EditableDiscount = {
  id: string;
  name: string;
  /**
   * Nullable because the column is: platform promotions apply automatically
   * with no code. An owner discount always has one, but rather than assert that
   * with a `?? ""` (which would invent a code that was never stored), a null
   * renders the field empty and the shared parser rejects the save with its
   * existing "3–24 letters or numbers" message.
   */
  code: string | null;
  type: "percent" | "amount";
  /** Percent as a whole number, or a dollar amount in CENTS. */
  value: number;
  minBasketCents: number;
  audience: string;
  endsAt: Date | null;
};

/** Cents → the decimal string the money inputs round-trip through. */
function dollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Date → yyyy-mm-dd for <input type="date">, in LOCAL time. */
function dateValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Create OR edit an owner discount code. One component for both, so the two
 * paths cannot drift in what they accept — the same reason the validation is a
 * shared parser rather than a copy (audit R3).
 *
 * Editing is what R3 called the missing path: a code could be created and
 * paused, but a wrong percentage or a typo'd code could only be abandoned,
 * leaving a dead row and holding the code string hostage to the unique index.
 */
export function DiscountForm({ discount }: { discount?: EditableDiscount }) {
  const editing = discount !== undefined;
  const [state, formAction, pending] = useActionState(
    editing ? updateOwnerDiscount : createOwnerDiscount,
    initialState,
  );
  const [type, setType] = useState<"percent" | "amount">(
    discount?.type ?? "percent",
  );

  return (
    <form action={formAction} className="space-y-5">
      {editing ? <input type="hidden" name="id" value={discount.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={microLabel}>Name</span>
          <input
            name="name"
            type="text"
            required
            maxLength={80}
            placeholder="Launch week"
            defaultValue={discount?.name}
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
            defaultValue={discount?.code ?? undefined}
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
            // Stored as a whole percent or as CENTS, so only the money form
            // needs converting back; showing 500 in a "Dollars off" box would
            // be re-saved as $500.
            defaultValue={
              discount === undefined
                ? undefined
                : discount.type === "percent"
                  ? String(discount.value)
                  : dollars(discount.value)
            }
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
            defaultValue={
              discount && discount.minBasketCents > 0
                ? dollars(discount.minBasketCents)
                : undefined
            }
            className={inputClass}
          />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={microLabel}>Who can use it</span>
          <select
            name="audience"
            className={inputClass}
            defaultValue={discount?.audience ?? "all"}
          >
            <option value="all">Everyone</option>
            <option value="new">New customers only</option>
          </select>
        </label>
        <label className="block">
          <span className={microLabel}>Ends (optional)</span>
          <input
            name="endsAt"
            type="date"
            defaultValue={discount?.endsAt ? dateValue(discount.endsAt) : undefined}
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
          {editing ? "Changes saved." : "Code created."}
        </p>
      ) : null}

      <Button
        type="submit"
        variant="primary"
        loading={pending}
        loadingLabel={editing ? "Saving…" : "Creating…"}
      >
        {editing ? (
          "Save changes"
        ) : (
          <>
            Create code <span aria-hidden="true">→</span>
          </>
        )}
      </Button>
    </form>
  );
}
