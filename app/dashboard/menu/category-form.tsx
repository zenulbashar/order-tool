"use client";

import { useActionState } from "react";

import { Button } from "@/app/_components/button";
import { Checkbox } from "@/app/_components/selection-controls";
import { Input } from "@/app/_components/input";
import { Textarea } from "@/app/_components/textarea";

import {
  createCategory,
  updateCategory,
  type MenuActionState,
} from "./actions";

const initialState: MenuActionState = {};

type EditableCategory = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
};

export function CategoryForm({ category }: { category?: EditableCategory }) {
  const isEdit = Boolean(category);
  const [state, formAction, pending] = useActionState(
    isEdit ? updateCategory : createCategory,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-3">
      {category ? (
        <input type="hidden" name="id" value={category.id} />
      ) : null}

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-ink">
          Name
          <Input
            name="name"
            type="text"
            required
            maxLength={100}
            defaultValue={category?.name ?? ""}
            placeholder="Mains"
            className="mt-1"
          />
        </label>
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-ink">
          Description <span className="text-muted">(optional)</span>
          <Textarea
            name="description"
            rows={2}
            maxLength={500}
            defaultValue={category?.description ?? ""}
            className="mt-1"
          />
        </label>
      </div>

      {isEdit ? (
        <label className="flex items-center gap-2 text-sm text-ink">
          <Checkbox
            name="isActive"
            defaultChecked={category?.isActive ?? true}
          />
          Active
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
        {isEdit ? "Save changes" : "Add category"}
      </Button>
    </form>
  );
}
