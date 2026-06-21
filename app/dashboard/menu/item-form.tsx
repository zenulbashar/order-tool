"use client";

import { useActionState } from "react";

import { formatCents } from "@/lib/validation";

import { createItem, updateItem, type MenuActionState } from "./actions";

const initialState: MenuActionState = {};

const fieldClass =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900";

type EditableItem = {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  priceCents: number;
  imageUrl: string | null;
  isAvailable: boolean;
};

export function ItemForm({
  categoryId,
  item,
  categories,
}: {
  categoryId?: string;
  item?: EditableItem;
  categories?: { id: string; name: string }[];
}) {
  const isEdit = Boolean(item);
  const [state, formAction, pending] = useActionState(
    isEdit ? updateItem : createItem,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-3">
      {item ? <input type="hidden" name="id" value={item.id} /> : null}

      {/* On create the parent category is fixed; on edit it can be changed. */}
      {item && categories ? (
        <label className="block text-sm font-medium text-gray-900">
          Category
          <select
            name="categoryId"
            defaultValue={item.categoryId}
            className={`mt-1 ${fieldClass}`}
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <input
          type="hidden"
          name="categoryId"
          value={item?.categoryId ?? categoryId ?? ""}
        />
      )}

      <label className="block text-sm font-medium text-gray-900">
        Name
        <input
          name="name"
          type="text"
          required
          maxLength={100}
          defaultValue={item?.name ?? ""}
          placeholder="Flat white"
          className={`mt-1 ${fieldClass}`}
        />
      </label>

      <label className="block text-sm font-medium text-gray-900">
        Description <span className="text-gray-400">(optional)</span>
        <textarea
          name="description"
          rows={2}
          maxLength={500}
          defaultValue={item?.description ?? ""}
          className={`mt-1 ${fieldClass}`}
        />
      </label>

      <label className="block text-sm font-medium text-gray-900">
        Price (dollars)
        <input
          name="price"
          type="text"
          inputMode="decimal"
          required
          placeholder="4.50"
          defaultValue={item ? formatCents(item.priceCents) : ""}
          className={`mt-1 ${fieldClass}`}
        />
      </label>

      <label className="block text-sm font-medium text-gray-900">
        Image URL <span className="text-gray-400">(optional)</span>
        <input
          name="imageUrl"
          type="url"
          maxLength={2048}
          defaultValue={item?.imageUrl ?? ""}
          placeholder="https://…"
          className={`mt-1 ${fieldClass}`}
        />
      </label>

      {isEdit ? (
        <label className="flex items-center gap-2 text-sm text-gray-900">
          <input
            type="checkbox"
            name="isAvailable"
            defaultChecked={item?.isAvailable ?? true}
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
        {pending ? "Saving…" : isEdit ? "Save changes" : "Add item"}
      </button>
    </form>
  );
}
