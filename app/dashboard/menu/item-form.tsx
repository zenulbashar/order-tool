"use client";

import { useActionState, useId, useRef, useState, useTransition } from "react";

import { Button } from "@/app/_components/button";
import { controlClass } from "@/app/_components/field";
import { Checkbox, Toggle } from "@/app/_components/selection-controls";
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
import { suggestItemTags } from "./tag-actions";

// Space Mono micro-eyebrow used for every field label in this form (design
// export). Applied to a <span> inside each wrapping <label> so implicit label
// association is preserved.
const microLabel =
  "mb-1 block font-mono text-[9px] font-bold uppercase tracking-wider text-label";

// Sanctioned AI affordance on owner chrome — amber product signature (NOT
// var(--action)). Now the export's inline sparkle "Generate with AI" text link
// (amber TEXT, not a fill). Same suggestItemDescription call; nothing auto-saves.
const generateButtonClass =
  "inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-accent-deep transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50";

const initialState: MenuActionState = {};

type EditableItem = {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  priceCents: number;
  isAvailable: boolean;
  station: "auto" | "kitchen" | "counter";
  stationId: string | null;
  tags: DietaryTag[];
};

export function ItemForm({
  categoryId,
  item,
  categories,
  stationOptions,
  hasSizes,
}: {
  categoryId?: string;
  item?: EditableItem;
  categories?: { id: string; name: string }[];
  // Owner-defined prep stations for the per-station label docket. Empty (or
  // absent) for a venue that never turned on multi-station printing — the
  // "Label station" selector then doesn't render at all.
  stationOptions?: { id: string; name: string }[];
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

  // "Suggest tags" — same accept gate as the description draft: suggestions
  // only restyle the pills below as pending (dashed); the owner accepts one by
  // checking it, and nothing is saved until the form itself is saved.
  const [suggestedTags, setSuggestedTags] = useState<Set<DietaryTag>>(
    () => new Set(),
  );
  const [suggestingTags, startSuggestTags] = useTransition();
  const [tagNotice, setTagNotice] = useState<string | null>(null);

  // Availability as the "LIVE" switch. The Toggle is presentational, so a
  // conditionally-rendered hidden input carries the wire contract: it posts
  // isAvailable=on only when on, and nothing when off — byte-identical to the
  // previous checkbox (the action reads formData.get("isAvailable") === "on").
  const [available, setAvailable] = useState(item?.isAvailable ?? true);

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

  function handleSuggestTags() {
    setTagNotice(null);
    const form = formRef.current;
    if (!form) return;
    // Same live read as handleSuggest: the in-progress name/description off the
    // form, so suggestions work before the item is even saved.
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    if (name.length === 0) {
      setTagNotice("Add an item name first, then suggest tags.");
      return;
    }
    const description = String(data.get("description") ?? "");
    startSuggestTags(async () => {
      const result = await suggestItemTags({ name, description });
      if (result.ok) {
        setSuggestedTags(new Set(result.tags));
        if (result.tags.length === 0) {
          setTagNotice(
            "No tags suggested. Nothing in the name or description clearly supports one.",
          );
        }
      } else {
        setTagNotice(result.error);
      }
    });
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      {item ? <input type="hidden" name="id" value={item.id} /> : null}
      {/* On create the parent category is fixed (hidden); on edit it's a field
          in the row below. */}
      {!item || !categories ? (
        <input
          type="hidden"
          name="categoryId"
          value={item?.categoryId ?? categoryId ?? ""}
        />
      ) : null}

      <label className="block">
        <span className={microLabel}>Name</span>
        <Input
          name="name"
          type="text"
          required
          maxLength={100}
          defaultValue={item?.name ?? ""}
          placeholder="Flat white"
        />
      </label>

      {/* Category (edit only) + price on one row, per the design's top panel. */}
      <div className="grid gap-3 sm:grid-cols-2">
        {item && categories ? (
          <label className="block">
            <span className={microLabel}>Category</span>
            <Select name="categoryId" defaultValue={item.categoryId}>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </label>
        ) : null}
        <div>
          <label className="block">
            <span className={microLabel}>Price (dollars)</span>
            <Input
              name="price"
              type="text"
              inputMode="decimal"
              required
              placeholder="4.50"
              defaultValue={item ? formatCents(item.priceCents) : ""}
            />
          </label>
          {hasSizes ? (
            <p className="mt-1 text-xs text-muted">
              This item has sizes, so each size sets its own price — this single
              price is ignored while sizes exist.
            </p>
          ) : null}
        </div>
      </div>

      {/* Prep station — which part of the docket this item's line prints on.
          "Auto" detects drinks by category name (they route to the front
          counter/fridge, everything else to the kitchen); the owner can pin an
          item either way. Display-only routing — never touches price. */}
      <label className="block">
        <span className={microLabel}>Prep station</span>
        <Select name="station" defaultValue={item?.station ?? "auto"}>
          <option value="auto">Auto (detect drinks by category)</option>
          <option value="kitchen">Kitchen docket</option>
          <option value="counter">Front counter · Drinks</option>
        </Select>
        <p className="mt-1 text-xs text-muted">
          Drinks print under a separate section so they go to the counter, not
          the kitchen. Leave on Auto unless an item lands in the wrong place.
        </p>
      </label>

      {/* Label station — which owner-defined station's sticky label this item
          prints on (kebab, grill, …). Only shown when the venue set stations up
          in onboarding; "None" leaves the item off every station label (it still
          appears on the receipt + packaging docket, and as "+N more items"). */}
      {stationOptions && stationOptions.length > 0 ? (
        <label className="block">
          <span className={microLabel}>Label station</span>
          <Select name="stationId" defaultValue={item?.stationId ?? ""}>
            <option value="">None (front counter)</option>
            {stationOptions.map((station) => (
              <option key={station.id} value={station.id}>
                {station.name}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-xs text-muted">
            Prints this item on that station&rsquo;s sticky label, headed by the
            order number and station initial (e.g. 42-K).
          </p>
        </label>
      ) : null}

      {/* Availability as the "LIVE" switch (edit only). --action track = a
          functional state, not amber. The hidden input carries the wire. */}
      {isEdit ? (
        <div className="flex items-center justify-between gap-3 rounded-input border border-line bg-sand/40 px-3 py-2.5">
          <div className="min-w-0">
            <span className={microLabel}>Availability</span>
            <p className="text-sm text-ink">
              {available ? "Live — orderable now" : "Hidden from the menu"}
            </p>
          </div>
          {available ? (
            <input type="hidden" name="isAvailable" value="on" />
          ) : null}
          <div className="flex shrink-0 items-center gap-2">
            <span
              className={`font-mono text-[10px] font-bold uppercase tracking-wider ${
                available ? "text-success-deep" : "text-label"
              }`}
            >
              {available ? "Live" : "Off"}
            </span>
            <Toggle
              checked={available}
              onChange={setAvailable}
              label="Item available to order"
            />
          </div>
        </div>
      ) : null}

      <div>
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={descriptionId} className={microLabel}>
            Description <span className="normal-case text-muted">(optional)</span>
          </label>
          <button
            type="button"
            onClick={handleSuggest}
            disabled={suggesting}
            className={generateButtonClass}
          >
            <span aria-hidden="true" className="p2e-spark">
              ✦
            </span>
            <ButtonLabel pending={suggesting} pendingLabel="Generating…">
              Generate with AI
            </ButtonLabel>
          </button>
        </div>
        {/* Raw textarea (not the Textarea primitive) because the AI "Generate
            with AI" flow writes into it via descriptionRef, and the shared
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

      {/* Dietary/allergen tags. Owner-set suggestions, never platform
          guarantees — the storefront shows the same disclaimer to customers. */}
      <fieldset className="space-y-2">
        <legend className="flex w-full items-center justify-between gap-2">
          <span className="block font-mono text-[9px] font-bold uppercase tracking-wider text-label">
            Dietary tags <span className="normal-case text-muted">(optional)</span>
          </span>
          <button
            type="button"
            onClick={handleSuggestTags}
            disabled={suggestingTags}
            className={generateButtonClass}
          >
            <span aria-hidden="true" className="p2e-spark">
              ✦
            </span>
            <ButtonLabel pending={suggestingTags} pendingLabel="Suggesting…">
              Suggest tags
            </ButtonLabel>
          </button>
        </legend>
        <div className="flex flex-wrap gap-2">
          {DIETARY_TAGS.map((tag) => {
            const checked = selectedTags.has(tag.value);
            // AI-suggested but not yet accepted: the SAME checkbox pill in the
            // design's pending look (dashed amber, "+"). Checking it accepts —
            // the submit contract is untouched either way.
            const suggested = !checked && suggestedTags.has(tag.value);
            return (
              <label
                key={tag.value}
                className={`flex cursor-pointer items-center gap-1.5 rounded-pill border px-3 py-1 text-xs font-medium transition ${
                  checked
                    ? "border-[var(--color-success)] bg-[var(--color-success)]/12 text-success-deep"
                    : suggested
                      ? "border-dashed border-[var(--color-accent)] bg-[var(--color-accent)]/8 text-accent-deep hover:bg-[var(--color-accent)]/15"
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
                {checked ? (
                  <span aria-hidden="true" className="text-success-deep">
                    ✓
                  </span>
                ) : suggested ? (
                  <span aria-hidden="true" className="text-accent-deep">
                    +
                  </span>
                ) : null}
                {tag.label}
              </label>
            );
          })}
        </div>
        {tagNotice ? (
          <p className="text-xs text-[var(--color-warm)]" role="alert">
            {tagNotice}
          </p>
        ) : null}
        {[...suggestedTags].some((tag) => !selectedTags.has(tag)) ? (
          <p className="text-xs font-semibold text-accent-deep">
            <span aria-hidden="true" className="p2e-spark">
              ✦
            </span>{" "}
            Suggestions only. Confirm with your kitchen, then tap a dashed tag
            to accept it.
          </p>
        ) : null}
        <p className="rounded-control border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 px-3 py-2 text-xs text-ink">
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
        {isEdit ? "Save changes" : "Add item"}{" "}
        <span aria-hidden="true">→</span>
      </Button>
    </form>
  );
}
