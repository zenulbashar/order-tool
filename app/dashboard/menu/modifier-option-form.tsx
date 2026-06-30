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

  // Compact single-row layout (MD3): the option's fields live inline in the
  // group's list rather than behind a per-option "Edit" disclosure. Field
  // name=/value wiring, the hidden id/groupId, useActionState, and the explicit
  // Save submit are all UNCHANGED — only the visual layout (flex row + labels
  // moved to aria-label/placeholder) differs from the old stacked form.
  return (
    <form action={formAction} className="min-w-0 flex-1">
      {option ? (
        <input type="hidden" name="id" value={option.id} />
      ) : (
        <input type="hidden" name="groupId" value={groupId ?? ""} />
      )}

      <div className="flex flex-wrap items-center gap-2">
        {isEdit ? (
          <label className="flex shrink-0 items-center" title="Available">
            <Checkbox
              name="isAvailable"
              defaultChecked={option?.isAvailable ?? true}
            />
            <span className="sr-only">Available</span>
          </label>
        ) : null}

        <Input
          name="name"
          type="text"
          required
          maxLength={100}
          defaultValue={option?.name ?? ""}
          placeholder="Option name"
          aria-label="Option name"
          className="min-w-0 flex-1"
        />

        <Input
          name="priceDelta"
          type="text"
          inputMode="decimal"
          defaultValue={option ? formatCents(option.priceDeltaCents) : "0.00"}
          placeholder="+$0.00"
          aria-label="Extra charge in dollars"
          className="w-24 shrink-0"
        />

        <Button
          type="submit"
          variant="primary"
          size="sm"
          loading={pending}
          loadingLabel="Saving…"
        >
          {isEdit ? "Save" : "Add"}
        </Button>
      </div>

      {state.error ? (
        <p className="mt-1 text-xs text-[var(--color-warm)]" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
