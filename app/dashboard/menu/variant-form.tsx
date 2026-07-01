"use client";

import { useActionState } from "react";

import { Button } from "@/app/_components/button";
import { Input } from "@/app/_components/input";
import { formatCents } from "@/lib/validation";

import { createVariant, updateVariant, type MenuActionState } from "./actions";

const initialState: MenuActionState = {};

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
    <form action={formAction} className="space-y-2.5">
      {variant ? (
        <input type="hidden" name="id" value={variant.id} />
      ) : (
        <input type="hidden" name="itemId" value={itemId ?? ""} />
      )}

      <label className="block">
        <span className="mb-1 block font-mono text-[9px] font-bold uppercase tracking-wider text-label">
          Name
        </span>
        <Input
          name="name"
          type="text"
          required
          maxLength={100}
          defaultValue={variant?.name ?? ""}
          placeholder="Small"
        />
      </label>

      {/* Absolute price (this size's own price), required — mirrors the item
          price field, not the modifier option's optional delta. */}
      <label className="block">
        <span className="mb-1 block font-mono text-[9px] font-bold uppercase tracking-wider text-label">
          Price (dollars)
        </span>
        <Input
          name="price"
          type="text"
          inputMode="decimal"
          required
          placeholder="7.30"
          defaultValue={variant ? formatCents(variant.priceCents) : ""}
        />
      </label>

      {state.error ? (
        <p className="text-sm text-[var(--color-warm)]" role="alert">
          {state.error}
        </p>
      ) : null}

      <Button
        type="submit"
        variant="primary"
        loading={pending}
        loadingLabel="Saving…"
      >
        {isEdit ? "Save changes" : "Add size"}
      </Button>
    </form>
  );
}
