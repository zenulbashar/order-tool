"use client";

import { useActionState, useId, useRef, useState, useTransition } from "react";

import { ButtonLabel } from "@/app/_components/spinner";
import {
  DIETARY_DISCLAIMER,
  DIETARY_TAGS,
  type DietaryTag,
  formatCents,
} from "@/lib/validation";

import { createItem, updateItem, type MenuActionState } from "./actions";
import { suggestItemDescription } from "./descriptions/actions";

const suggestButtonClass =
  "shrink-0 rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50";

const initialState: MenuActionState = {};

const fieldClass =
  "w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900";

type EditableItem = {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  priceCents: number;
  isAvailable: boolean;
  tags: DietaryTag[];
};

export function ItemForm({
  categoryId,
  item,
  categories,
  hasSizes,
}: {
  categoryId?: string;
  item?: EditableItem;
  categories?: { id: string; name: string }[];
  // When the item is variant-priced (>= 1 size), the base price is ignored
  // downstream — surface that under the Price field. Additive + defaults off,
  // so flat items render exactly as before.
  hasSizes?: boolean;
}) {
  const isEdit = Boolean(item);
  const [state, formAction, pending] = useActionState(
    isEdit ? updateItem : createItem,
    initialState,
  );

  // "Suggest description" — additive to the existing form. It drafts copy into
  // the editable field and STOPS; the owner accepts by saving through the
  // existing createItem/updateItem action below. Nothing is auto-saved.
  const descriptionId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const [suggesting, startSuggest] = useTransition();
  const [suggestError, setSuggestError] = useState<string | null>(null);

  // Dietary/allergen tags as controlled checkbox state, seeded from the item's
  // current tags. Checked tags POST under the "tags" key; the create/update
  // action validates against the vocab and replace-sets them within venue scope.
  const [selectedTags, setSelectedTags] = useState<Set<DietaryTag>>(
    () => new Set(item?.tags ?? []),
  );

  function toggleTag(tag: DietaryTag) {
    setSelectedTags((current) => {
      const next = new Set(current);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  function handleSuggest() {
    setSuggestError(null);
    const form = formRef.current;
    if (!form) return;
    // Read the in-progress name/category/price straight off the form so a draft
    // reflects what the owner is typing (works before the item is even saved).
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    if (name.length === 0) {
      setSuggestError("Add an item name first, then suggest a description.");
      return;
    }
    const categoryId = String(data.get("categoryId") ?? "");
    const price = String(data.get("price") ?? "");
    startSuggest(async () => {
      const result = await suggestItemDescription({ name, categoryId, price });
      if (result.ok && descriptionRef.current) {
        descriptionRef.current.value = result.description;
        descriptionRef.current.focus();
      } else if (!result.ok) {
        setSuggestError(result.error);
      }
    });
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-2.5">
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

      <div>
        <div className="flex items-center justify-between gap-2">
          <label
            htmlFor={descriptionId}
            className="text-sm font-medium text-gray-900"
          >
            Description <span className="text-gray-400">(optional)</span>
          </label>
          <button
            type="button"
            onClick={handleSuggest}
            disabled={suggesting}
            className={suggestButtonClass}
          >
            <ButtonLabel pending={suggesting} pendingLabel="Suggesting…">
              Suggest description
            </ButtonLabel>
          </button>
        </div>
        <textarea
          id={descriptionId}
          ref={descriptionRef}
          name="description"
          rows={2}
          maxLength={500}
          defaultValue={item?.description ?? ""}
          className={`mt-1 ${fieldClass}`}
        />
        {suggestError ? (
          <p className="mt-1 text-xs text-red-600" role="alert">
            {suggestError}
          </p>
        ) : null}
        <p className="mt-1 text-xs text-gray-400">
          AI draft from the item name, category, and price. Review and edit it,
          then save. It is never saved automatically.
        </p>
      </div>

      <div>
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
        {hasSizes ? (
          <p className="mt-1 text-xs text-amber-700">
            This item has sizes, so each size sets its own price — this single
            price is ignored while sizes exist.
          </p>
        ) : null}
      </div>

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

      {/* Dietary/allergen tags. Owner-set suggestions, never platform
          guarantees — the storefront shows the same disclaimer to customers. */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-gray-900">
          Dietary tags <span className="text-gray-400">(optional)</span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {DIETARY_TAGS.map((tag) => {
            const checked = selectedTags.has(tag.value);
            return (
              <label
                key={tag.value}
                className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition ${
                  checked
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                <input
                  type="checkbox"
                  name="tags"
                  value={tag.value}
                  checked={checked}
                  onChange={() => toggleTag(tag.value)}
                  className="sr-only"
                />
                {tag.label}
              </label>
            );
          })}
        </div>
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Tags you set are shown to customers as a guide only. {DIETARY_DISCLAIMER}{" "}
          Use “gluten friendly” rather than “gluten free”: never state a dish is
          allergen-safe.
        </p>
      </fieldset>

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
        <ButtonLabel pending={pending} pendingLabel="Saving…">
          {isEdit ? "Save changes" : "Add item"}
        </ButtonLabel>
      </button>
    </form>
  );
}
