"use client";

import { useActionState } from "react";

import { ButtonLabel } from "@/app/_components/spinner";
import { formatCents } from "@/lib/validation";

import { createVariant, updateVariant, type MenuActionState } from "./actions";

const initialState: MenuActionState = {};

const fieldClass =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900";

type EditableVariant = {
  id: string;
  name: string;
  priceCents: number;
};

export function VariantForm({
  itemId,
  variant,
}: {
  itemId?: string;
  variant?: EditableVariant;
}) {
  const isEdit = Boolean(variant);
  const [state, formAction, pending] = useActionState(
    isEdit ? updateVariant : createVariant,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-3">
      {variant ? (
        <input type="hidden" name="id" value={variant.id} />
      ) : (
        <input type="hidden" name="itemId" value={itemId ?? ""} />
      )}

      <label className="block text-sm font-medium text-gray-900">
        Name
        <input
          name="name"
          type="text"
          required
          maxLength={100}
          defaultValue={variant?.name ?? ""}
          placeholder="Small"
          className={`mt-1 ${fieldClass}`}
        />
      </label>

      {/* Absolute price (this size's own price), required — mirrors the item
          price field, not the modifier option's optional delta. */}
      <label className="block text-sm font-medium text-gray-900">
        Price (dollars)
        <input
          name="price"
          type="text"
          inputMode="decimal"
          required
          placeholder="7.30"
          defaultValue={variant ? formatCents(variant.priceCents) : ""}
          className={`mt-1 ${fieldClass}`}
        />
      </label>

      {state.error ? (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-60"
      >
        <ButtonLabel pending={pending} pendingLabel="Saving…">
          {isEdit ? "Save changes" : "Add size"}
        </ButtonLabel>
      </button>
    </form>
  );
}
