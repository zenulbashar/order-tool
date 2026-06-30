"use client";

import { useActionState } from "react";

import { Button } from "@/app/_components/button";
import { Input } from "@/app/_components/input";

import { createGroup, updateGroup, type MenuActionState } from "./actions";

const initialState: MenuActionState = {};

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
    <form action={formAction} className="space-y-2.5">
      {group ? (
        <input type="hidden" name="id" value={group.id} />
      ) : (
        <input type="hidden" name="itemId" value={itemId ?? ""} />
      )}

      <label className="block text-sm font-medium text-ink">
        Name
        <Input
          name="name"
          type="text"
          required
          maxLength={100}
          defaultValue={group?.name ?? ""}
          placeholder="Milk"
          className="mt-1"
        />
      </label>

      <div className="flex gap-3">
        <label className="block text-sm font-medium text-ink">
          Min select
          <Input
            name="minSelect"
            type="number"
            min={0}
            step={1}
            required
            defaultValue={group?.minSelect ?? 0}
            className="mt-1"
          />
        </label>
        <label className="block text-sm font-medium text-ink">
          Max select
          <Input
            name="maxSelect"
            type="number"
            min={1}
            step={1}
            required
            defaultValue={group?.maxSelect ?? 1}
            className="mt-1"
          />
        </label>
      </div>
      <p className="text-xs text-muted">
        Required when min select is 1 or more.
      </p>

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
        {isEdit ? "Save changes" : "Add group"}
      </Button>
    </form>
  );
}
