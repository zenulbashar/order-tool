"use client";

import { useActionState, useId, useRef, useState, useTransition } from "react";

import { Button } from "@/app/_components/button";
import { controlClass } from "@/app/_components/field";
import { Checkbox } from "@/app/_components/selection-controls";
import { Input } from "@/app/_components/input";
import { Select } from "@/app/_components/select";
import { ButtonLabel } from "@/app/_components/spinner";
import {
  DIETARY_DISCLAIMER,
  DIETARY_TAGS,
  type DietaryTag,
  formatCents,
} from "@/lib/validation";

import { createItem, updateItem, type MenuActionState } from "./actions";
import { suggestItemDescription } from "./descriptions/actions";

// Sanctioned AI affordance on owner chrome — amber product signature (NOT
// var(--action)). The "Suggest description" call drafts copy; nothing auto-saves.
const suggestButtonClass =
  "shrink-0 rounded-control bg-[var(--color-accent)] px-2.5 py-1 text-xs font-medium text-forest transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

const initialState: MenuActionState = {};

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
        <label className="block text-sm font-medium text-ink">
          Category
          <Select
            name="categoryId"
            defaultValue={item.categoryId}
            className="mt-1"
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </label>
      ) : (
        <input
          type="hidden"
          name="categoryId"
          value={item?.categoryId ?? categoryId ?? ""}
        />
      )}

      <label className="block text-sm font-medium text-ink">
        Name
        <Input
          name="name"
          type="text"
          required
          maxLength={100}
          defaultValue={item?.name ?? ""}
          placeholder="Flat white"
          className="mt-1"
        />
      </label>

      <div>
        <div className="flex items-center justify-between gap-2">
          <label
            htmlFor={descriptionId}
            className="text-sm font-medium text-ink"
          >
            Description <span className="text-muted">(optional)</span>
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
        {/* Raw textarea (not the Textarea primitive) because the AI "Suggest
            description" flow writes into it via descriptionRef, and the shared
            primitive isn't ref-forwarding. Same cream field recipe via
            controlClass so it matches the rest of the form. */}
        <textarea
          id={descriptionId}
          ref={descriptionRef}
          name="description"
          rows={2}
          maxLength={500}
          defaultValue={item?.description ?? ""}
          className={controlClass({ className: "mt-1" })}
        />
        {suggestError ? (
          <p className="mt-1 text-xs text-[var(--color-warm)]" role="alert">
            {suggestError}
          </p>
        ) : null}
        <p className="mt-1 text-xs text-muted">
          AI draft from the item name, category, and price. Review and edit it,
          then save. It is never saved automatically.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-ink">
          Price (dollars)
          <Input
            name="price"
            type="text"
            inputMode="decimal"
            required
            placeholder="4.50"
            defaultValue={item ? formatCents(item.priceCents) : ""}
            className="mt-1"
          />
        </label>
        {hasSizes ? (
          <p className="mt-1 text-xs text-muted">
            This item has sizes, so each size sets its own price — this single
            price is ignored while sizes exist.
          </p>
        ) : null}
      </div>

      {isEdit ? (
        <label className="flex items-center gap-2 text-sm text-ink">
          <Checkbox
            name="isAvailable"
            defaultChecked={item?.isAvailable ?? true}
          />
          Available
        </label>
      ) : null}

      {/* Dietary/allergen tags. Owner-set suggestions, never platform
          guarantees — the storefront shows the same disclaimer to customers. */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-ink">
          Dietary tags <span className="text-muted">(optional)</span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {DIETARY_TAGS.map((tag) => {
            const checked = selectedTags.has(tag.value);
            return (
              <label
                key={tag.value}
                className={`flex cursor-pointer items-center gap-1.5 rounded-pill border px-3 py-1 text-xs font-medium transition ${
                  checked
                    ? "border-[var(--action)] bg-[var(--action)] text-[var(--action-contrast)]"
                    : "border-line text-muted hover:bg-sand"
                }`}
              >
                <Checkbox
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
        <p className="rounded-control border border-line bg-sand px-3 py-2 text-xs text-muted">
          Tags you set are shown to customers as a guide only. {DIETARY_DISCLAIMER}{" "}
          Use “gluten friendly” rather than “gluten free”: never state a dish is
          allergen-safe.
        </p>
      </fieldset>

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
        {isEdit ? "Save changes" : "Add item"}
      </Button>
    </form>
  );
}
