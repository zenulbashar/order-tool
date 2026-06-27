"use client";

import { useActionState } from "react";

import { ButtonLabel } from "@/app/_components/spinner";

import { createTable, updateTable, type TablesActionState } from "./actions";

const initialState: TablesActionState = {};

const fieldClass =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 sm:w-56";

type EditableTable = {
  id: string;
  label: string;
};

/**
 * Create (no `table`) or rename (with `table`) a dine-in table. Mirrors the
 * menu VariantForm: useActionState on the matching server action, a hidden id
 * for edits, an inline error, and the shared ButtonLabel spinner.
 */
export function TableForm({ table }: { table?: EditableTable }) {
  const isEdit = Boolean(table);
  const [state, formAction, pending] = useActionState(
    isEdit ? updateTable : createTable,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      {table ? <input type="hidden" name="id" value={table.id} /> : null}

      <input
        name="label"
        type="text"
        required
        maxLength={40}
        defaultValue={table?.label ?? ""}
        placeholder="e.g. 1 or Patio 3"
        aria-label="Table name"
        className={fieldClass}
      />

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-60"
      >
        <ButtonLabel pending={pending} pendingLabel="Saving…">
          {isEdit ? "Save" : "Add table"}
        </ButtonLabel>
      </button>

      {state.error ? (
        <p className="w-full text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
