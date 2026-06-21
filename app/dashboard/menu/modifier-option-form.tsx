"use client";

import { useActionState } from "react";

import { formatCents } from "@/lib/validation";

import { createOption, updateOption, type MenuActionState } from "./actions";

const initialState: MenuActionState = {};

const fieldClass =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900";

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
    <form action={formAction} className="space-y-3">
      {option ? (
        <input type="hidden" name="id" value={option.id} />
      ) : (
        <input type="hidden" name="groupId" value={groupId ?? ""} />
      )}

      <label className="block text-sm font-medium text-gray-900">
        Name
        <input
          name="name"
          type="text"
          required
          maxLength={100}
          defaultValue={option?.name ?? ""}
          placeholder="Oat milk"
          className={`mt-1 ${fieldClass}`}
        />
      </label>

      <label className="block text-sm font-medium text-gray-900">
        Extra charge (dollars)
        <input
          name="priceDelta"
          type="text"
          inputMode="decimal"
          defaultValue={option ? formatCents(option.priceDeltaCents) : "0.00"}
          className={`mt-1 ${fieldClass}`}
        />
      </label>

      {isEdit ? (
        <label className="flex items-center gap-2 text-sm text-gray-900">
          <input
            type="checkbox"
            name="isAvailable"
            defaultChecked={option?.isAvailable ?? true}
            className="h-4 w-4 rounded border-gray-300"
          />
          Available
        </label>
      ) : null}

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
        {pending ? "Saving…" : isEdit ? "Save changes" : "Add option"}
      </button>
    </form>
  );
}
