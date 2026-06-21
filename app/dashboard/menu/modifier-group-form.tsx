"use client";

import { useActionState } from "react";

import { createGroup, updateGroup, type MenuActionState } from "./actions";

const initialState: MenuActionState = {};

const fieldClass =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900";

type EditableGroup = {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
};

export function ModifierGroupForm({
  itemId,
  group,
}: {
  itemId?: string;
  group?: EditableGroup;
}) {
  const isEdit = Boolean(group);
  const [state, formAction, pending] = useActionState(
    isEdit ? updateGroup : createGroup,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-3">
      {group ? (
        <input type="hidden" name="id" value={group.id} />
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
          defaultValue={group?.name ?? ""}
          placeholder="Milk"
          className={`mt-1 ${fieldClass}`}
        />
      </label>

      <div className="flex gap-3">
        <label className="block text-sm font-medium text-gray-900">
          Min select
          <input
            name="minSelect"
            type="number"
            min={0}
            step={1}
            required
            defaultValue={group?.minSelect ?? 0}
            className={`mt-1 ${fieldClass}`}
          />
        </label>
        <label className="block text-sm font-medium text-gray-900">
          Max select
          <input
            name="maxSelect"
            type="number"
            min={1}
            step={1}
            required
            defaultValue={group?.maxSelect ?? 1}
            className={`mt-1 ${fieldClass}`}
          />
        </label>
      </div>
      <p className="text-xs text-gray-500">
        Required when min select is 1 or more.
      </p>

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
        {pending ? "Saving…" : isEdit ? "Save changes" : "Add group"}
      </button>
    </form>
  );
}
