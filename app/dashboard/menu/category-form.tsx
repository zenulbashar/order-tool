"use client";

import { useActionState } from "react";

import {
  createCategory,
  updateCategory,
  type MenuActionState,
} from "./actions";

const initialState: MenuActionState = {};

const fieldClass =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900";

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
        <label className="block text-sm font-medium text-gray-900">
          Name
          <input
            name="name"
            type="text"
            required
            maxLength={100}
            defaultValue={category?.name ?? ""}
            placeholder="Mains"
            className={`mt-1 ${fieldClass}`}
          />
        </label>
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-gray-900">
          Description <span className="text-gray-400">(optional)</span>
          <textarea
            name="description"
            rows={2}
            maxLength={500}
            defaultValue={category?.description ?? ""}
            className={`mt-1 ${fieldClass}`}
          />
        </label>
      </div>

      {isEdit ? (
        <label className="flex items-center gap-2 text-sm text-gray-900">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={category?.isActive ?? true}
            className="h-4 w-4 rounded border-gray-300"
          />
          Active
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
        {pending ? "Saving…" : isEdit ? "Save changes" : "Add category"}
      </button>
    </form>
  );
}
