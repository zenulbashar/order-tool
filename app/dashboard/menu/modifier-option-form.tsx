"use client";

import { useActionState } from "react";

import { Button } from "@/app/_components/button";
import { Checkbox } from "@/app/_components/selection-controls";
import { Input } from "@/app/_components/input";
import { formatCents } from "@/lib/validation";

import { createOption, updateOption, type MenuActionState } from "./actions";

const initialState: MenuActionState = {};

type EditableOption = {
  id: string;
  name: string;
  priceDeltaCents: number;
  isAvailable: boolean;
};

export function ModifierOptionForm({
  groupId,
  option,
}: {
  groupId?: string;
  option?: EditableOption;
}) {
  const isEdit = Boolean(option);
  const [state, formAction, pending] = useActionState(
    isEdit ? updateOption : createOption,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-2.5">
      {option ? (
        <input type="hidden" name="id" value={option.id} />
      ) : (
        <input type="hidden" name="groupId" value={groupId ?? ""} />
      )}

      <label className="block text-sm font-medium text-ink">
        Name
        <Input
          name="name"
          type="text"
          required
          maxLength={100}
          defaultValue={option?.name ?? ""}
          placeholder="Oat milk"
          className="mt-1"
        />
      </label>

      <label className="block text-sm font-medium text-ink">
        Extra charge (dollars)
        <Input
          name="priceDelta"
          type="text"
          inputMode="decimal"
          defaultValue={option ? formatCents(option.priceDeltaCents) : "0.00"}
          className="mt-1"
        />
      </label>

      {isEdit ? (
        <label className="flex items-center gap-2 text-sm text-ink">
          <Checkbox
            name="isAvailable"
            defaultChecked={option?.isAvailable ?? true}
          />
          Available
        </label>
      ) : null}

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
        {isEdit ? "Save changes" : "Add option"}
      </Button>
    </form>
  );
}
