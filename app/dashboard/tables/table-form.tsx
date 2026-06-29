"use client";

import { useActionState } from "react";

import { Button } from "@/app/_components/button";
import { Input } from "@/app/_components/input";

import { createTable, updateTable, type TablesActionState } from "./actions";

const initialState: TablesActionState = {};

type EditableTable = {
  id: string;
  label: string;
};

/**
 * Create (no `table`) or rename (with `table`) a dine-in table. Mirrors the
 * menu VariantForm: useActionState on the matching server action, a hidden id
 * for edits, an inline error, and the shared primitives.
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

      <Input
        name="label"
        type="text"
        required
        maxLength={40}
        defaultValue={table?.label ?? ""}
        placeholder="e.g. 1 or Patio 3"
        aria-label="Table name"
        className="sm:w-56"
      />

      <Button type="submit" variant="primary" loading={pending} loadingLabel="Saving…">
        {isEdit ? "Save" : "Add table"}
      </Button>

      {state.error ? (
        <p className="w-full text-sm text-[var(--color-warm)]" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
