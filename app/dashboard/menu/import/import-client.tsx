"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ButtonLabel } from "@/app/_components/spinner";
import {
  dollarsToCents,
  formatCents,
  MAX_SIZES_PER_ITEM,
} from "@/lib/validation";

import { extractMenu, publishMenu } from "./actions";

const fieldClass =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900";

const primaryButton =
  "rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50";

const secondaryButton =
  "rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 transition hover:bg-gray-50";

const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// UI draft: the price is held as the raw dollars string the owner is editing,
// converted to integer cents only at publish (via dollarsToCents). priceText is
// the model's reading of an ambiguous/missing price, shown as a hint.
//
// A SIZED item (sized === true) is priced by its `sizes` list — each a name +
// editable price — and its single priceInput is ignored. A flat item uses
// priceInput. The owner toggles between the two; nothing is written until the
// explicit publish, and the publish action re-derives + re-validates everything.
type UiSize = { name: string; priceInput: string };
type UiItem = {
  name: string;
  priceInput: string;
  priceText: string;
  description: string;
  sized: boolean;
  sizes: UiSize[];
};
type UiCategory = { name: string; items: UiItem[] };

function blankSize(): UiSize {
  return { name: "", priceInput: "" };
}
function blankItem(): UiItem {
  return {
    name: "",
    priceInput: "",
    priceText: "",
    description: "",
    sized: false,
    sizes: [],
  };
}

/** A size row is ready when it has a name and a parseable non-negative price. */
function sizeReady(size: UiSize): boolean {
  return size.name.trim().length > 0 && dollarsToCents(size.priceInput) !== null;
}

/**
 * Publish-gate predicate for one item — extended to cover sizes. A sized item
 * needs >= 1 size, each named with a valid price; a flat item needs a valid
 * single price (as before). This is the client mirror of publishDraftSchema's
 * server-side refusal of any zero-size or null-priced-size item.
 */
function itemReady(item: UiItem): boolean {
  if (item.name.trim().length === 0) return false;
  if (item.sized) {
    return item.sizes.length > 0 && item.sizes.every(sizeReady);
  }
  return dollarsToCents(item.priceInput) !== null;
}

export function ImportClient() {
  const router = useRouter();

  const [files, setFiles] = useState<File[]>([]);
  const [draft, setDraft] = useState<UiCategory[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [extracting, startExtract] = useTransition();
  const [publishing, startPublish] = useTransition();

  const tooMany = files.length > MAX_IMAGES;
  const tooBig = files.some((file) => file.size > MAX_IMAGE_BYTES);
  const canExtract = files.length > 0 && !tooMany && !tooBig && !extracting;

  // Publish is gated until every category is named and every item is ready — a
  // flat item needs a valid price; a sized item needs >= 1 named, priced size
  // (see itemReady). The model never silently provides a missing price.
  const canPublish =
    draft !== null &&
    draft.length > 0 &&
    draft.every(
      (category) =>
        category.name.trim().length > 0 &&
        category.items.every(itemReady),
    );

  function handleFiles(list: FileList | null) {
    setError(null);
    setFiles(list ? Array.from(list) : []);
  }

  function handleExtract() {
    setError(null);
    startExtract(async () => {
      const formData = new FormData();
      for (const file of files) formData.append("images", file);
      const result = await extractMenu(formData);
      if (result.ok) {
        setDraft(
          result.draft.categories.map((category) => ({
            name: category.name,
            items: category.items.map((item) => {
              const sizes = item.sizes.map((size) => ({
                name: size.name,
                priceInput:
                  size.priceCents === null ? "" : formatCents(size.priceCents),
              }));
              return {
                name: item.name,
                priceInput:
                  item.priceCents === null ? "" : formatCents(item.priceCents),
                priceText: item.priceText,
                description: item.description,
                // The model proposed sizes -> start sized; the gate makes the
                // owner confirm each size's name + price before publish.
                sized: sizes.length > 0,
                sizes,
              };
            }),
          })),
        );
      } else {
        setError(result.error);
      }
    });
  }

  function handlePublish() {
    if (!draft || !canPublish) return;
    setError(null);
    const payload = {
      categories: draft.map((category) => ({
        name: category.name.trim(),
        items: category.items.map((item) => {
          const base = {
            name: item.name.trim(),
            description: item.description.trim(),
          };
          // canPublish guarantees a non-null parse below; ?? 0 is a type guard
          // only. A sized item sends its sizes (no flat price); a flat item
          // sends its single price. The server re-derives + re-validates both.
          if (item.sized) {
            return {
              ...base,
              sizes: item.sizes.map((size) => ({
                name: size.name.trim(),
                priceCents: dollarsToCents(size.priceInput) ?? 0,
              })),
            };
          }
          return { ...base, priceCents: dollarsToCents(item.priceInput) ?? 0 };
        }),
      })),
    };
    startPublish(async () => {
      const result = await publishMenu(payload);
      if (result.ok) {
        router.push("/dashboard/menu");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  /* ----------------------------- draft mutations ---------------------------- */

  function updateCategory(ci: number, name: string) {
    setDraft((prev) =>
      prev!.map((category, index) =>
        index === ci ? { ...category, name } : category,
      ),
    );
  }
  function removeCategory(ci: number) {
    setDraft((prev) => prev!.filter((_, index) => index !== ci));
  }
  function addCategory() {
    setDraft((prev) => [...(prev ?? []), { name: "", items: [blankItem()] }]);
  }
  function updateItem(ci: number, ii: number, patch: Partial<UiItem>) {
    setDraft((prev) =>
      prev!.map((category, index) =>
        index === ci
          ? {
              ...category,
              items: category.items.map((item, j) =>
                j === ii ? { ...item, ...patch } : item,
              ),
            }
          : category,
      ),
    );
  }
  function removeItem(ci: number, ii: number) {
    setDraft((prev) =>
      prev!.map((category, index) =>
        index === ci
          ? { ...category, items: category.items.filter((_, j) => j !== ii) }
          : category,
      ),
    );
  }
  function addItem(ci: number) {
    setDraft((prev) =>
      prev!.map((category, index) =>
        index === ci
          ? { ...category, items: [...category.items, blankItem()] }
          : category,
      ),
    );
  }

  /* ------------------------------ size mutations ---------------------------- */

  /** Apply a transform to a single item — the base for the size operations. */
  function mutateItem(ci: number, ii: number, fn: (item: UiItem) => UiItem) {
    setDraft((prev) =>
      prev!.map((category, index) =>
        index === ci
          ? {
              ...category,
              items: category.items.map((item, j) =>
                j === ii ? fn(item) : item,
              ),
            }
          : category,
      ),
    );
  }

  // Convert an item between flat and sized. WRITES NOTHING (mirrors the live
  // HasSizesEditor): flat -> sized reveals the size list, seeding one row that
  // carries any single price already typed; sized -> flat keeps a single price,
  // prefilled from the first size when blank so a value is never silently lost.
  function toggleSized(ci: number, ii: number) {
    mutateItem(ci, ii, (item) => {
      if (item.sized) {
        return {
          ...item,
          sized: false,
          priceInput: item.priceInput || (item.sizes[0]?.priceInput ?? ""),
        };
      }
      return {
        ...item,
        sized: true,
        sizes:
          item.sizes.length > 0
            ? item.sizes
            : [{ name: "", priceInput: item.priceInput }],
      };
    });
  }
  function updateSize(
    ci: number,
    ii: number,
    si: number,
    patch: Partial<UiSize>,
  ) {
    mutateItem(ci, ii, (item) => ({
      ...item,
      sizes: item.sizes.map((size, k) =>
        k === si ? { ...size, ...patch } : size,
      ),
    }));
  }
  function addSize(ci: number, ii: number) {
    mutateItem(ci, ii, (item) =>
      item.sizes.length >= MAX_SIZES_PER_ITEM
        ? item
        : { ...item, sizes: [...item.sizes, blankSize()] },
    );
  }
  function removeSize(ci: number, ii: number, si: number) {
    mutateItem(ci, ii, (item) => ({
      ...item,
      sizes: item.sizes.filter((_, k) => k !== si),
    }));
  }

  /* --------------------------------- render -------------------------------- */

  // Stage 1: upload.
  if (draft === null) {
    return (
      <section className="py-8">
        <div className="rounded-lg border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900">
            Upload a photo of your menu
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Add up to {MAX_IMAGES} clear, straight-on photos (JPEG, PNG, WebP, or
            GIF; max 5MB each). We read the categories, items, and prices into a
            draft you can review and fix before anything is added to your menu.
          </p>

          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            onChange={(event) => handleFiles(event.target.files)}
            className="mt-4 block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border file:border-gray-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-50"
          />

          {files.length > 0 ? (
            <p className="mt-2 text-xs text-gray-500">
              {files.length} photo{files.length === 1 ? "" : "s"} selected.
            </p>
          ) : null}
          {tooMany ? (
            <p className="mt-2 text-sm text-red-600" role="alert">
              Add at most {MAX_IMAGES} photos.
            </p>
          ) : null}
          {tooBig ? (
            <p className="mt-2 text-sm text-red-600" role="alert">
              Each photo must be 5MB or smaller.
            </p>
          ) : null}
          {error ? (
            <p className="mt-2 text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="button"
            onClick={handleExtract}
            disabled={!canExtract}
            className={`mt-4 ${primaryButton}`}
          >
            <ButtonLabel pending={extracting} pendingLabel="Reading menu…">
              Read menu
            </ButtonLabel>
          </button>
          <p className="mt-3 text-xs text-gray-400">
            Reading a menu uses AI and is a small one-time cost. The photo is sent
            for reading only — it is not stored.
          </p>
        </div>
      </section>
    );
  }

  // Stage 2: review + correct (the gate). Nothing is written until publish.
  return (
    <section className="py-8">
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm text-amber-800">
          <strong>Review every line before adding it.</strong> Prices and sizes
          come from an AI reading a photo and can be wrong — check each one,
          especially any flagged below. For an item priced by size, confirm each
          size’s name and price, or untick “This item has sizes” to give it a
          single price. Nothing is added to your live menu until you choose “Add
          these to my menu”. Re-importing later adds these again.
        </p>
      </div>

      {error ? (
        <p className="mt-4 text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-5 space-y-4">
        {draft.map((category, ci) => (
          <div key={ci} className="rounded-lg border border-gray-200 p-4">
            <div className="flex items-start gap-3">
              <label className="flex-1 text-sm font-medium text-gray-900">
                Category
                <input
                  type="text"
                  value={category.name}
                  maxLength={100}
                  onChange={(event) => updateCategory(ci, event.target.value)}
                  placeholder="e.g. Mains"
                  className={`mt-1 ${fieldClass}`}
                />
              </label>
              <button
                type="button"
                onClick={() => removeCategory(ci)}
                className="mt-6 text-xs font-medium text-red-600 hover:text-red-700"
              >
                Remove
              </button>
            </div>

            <ul className="mt-4 space-y-3">
              {category.items.map((item, ii) => {
                // Flag the single price only for a FLAT item; a sized item is
                // priced by its sizes, each flagged on its own row below.
                const priceMissing =
                  !item.sized && dollarsToCents(item.priceInput) === null;
                const noSizes = item.sized && item.sizes.length === 0;
                return (
                  <li
                    key={ii}
                    className="rounded-md border border-gray-200 bg-gray-50/50 p-3"
                  >
                    {/* Name, plus the single price when flat. A sized item hides
                        the single price — its sizes carry the prices. */}
                    {item.sized ? (
                      <label className="block text-sm font-medium text-gray-900">
                        Item
                        <input
                          type="text"
                          value={item.name}
                          maxLength={100}
                          onChange={(event) =>
                            updateItem(ci, ii, { name: event.target.value })
                          }
                          placeholder="e.g. Latte"
                          className={`mt-1 ${fieldClass}`}
                        />
                      </label>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
                        <label className="text-sm font-medium text-gray-900">
                          Item
                          <input
                            type="text"
                            value={item.name}
                            maxLength={100}
                            onChange={(event) =>
                              updateItem(ci, ii, { name: event.target.value })
                            }
                            placeholder="e.g. Flat white"
                            className={`mt-1 ${fieldClass}`}
                          />
                        </label>
                        <label className="text-sm font-medium text-gray-900">
                          Price ($)
                          <input
                            type="text"
                            inputMode="decimal"
                            value={item.priceInput}
                            onChange={(event) =>
                              updateItem(ci, ii, {
                                priceInput: event.target.value,
                              })
                            }
                            placeholder="0.00"
                            aria-invalid={priceMissing}
                            className={`mt-1 ${fieldClass} ${
                              priceMissing
                                ? "border-red-400 focus:border-red-500 focus:ring-red-500"
                                : ""
                            }`}
                          />
                        </label>
                      </div>
                    )}

                    {priceMissing ? (
                      <p className="mt-1.5 text-xs font-medium text-red-600">
                        Set a price
                        {item.priceText
                          ? ` — the menu shows “${item.priceText}”`
                          : ""}
                        .
                      </p>
                    ) : null}

                    {/* Has-sizes toggle — mirrors the live editor; writes
                        nothing until publish. */}
                    <label className="mt-2 flex items-center gap-2 text-sm font-medium text-gray-900">
                      <input
                        type="checkbox"
                        checked={item.sized}
                        onChange={() => toggleSized(ci, ii)}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      This item has sizes
                    </label>

                    {item.sized ? (
                      <div className="mt-2 space-y-2 rounded-md border border-gray-200 bg-white p-3">
                        <p className="text-xs text-gray-500">
                          Sizes set the price — give each a name and price. The
                          single price above is ignored while sizes are on.
                        </p>
                        {item.priceText ? (
                          <p className="text-xs text-gray-400">
                            The menu shows “{item.priceText}”.
                          </p>
                        ) : null}

                        <ul className="space-y-2">
                          {item.sizes.map((size, si) => {
                            const sizePriceMissing =
                              dollarsToCents(size.priceInput) === null;
                            return (
                              <li
                                key={si}
                                className="grid gap-2 sm:grid-cols-[1fr_7rem_auto] sm:items-start"
                              >
                                <label className="text-xs font-medium text-gray-700">
                                  Size
                                  <input
                                    type="text"
                                    value={size.name}
                                    maxLength={100}
                                    onChange={(event) =>
                                      updateSize(ci, ii, si, {
                                        name: event.target.value,
                                      })
                                    }
                                    placeholder="e.g. Large"
                                    className={`mt-1 ${fieldClass}`}
                                  />
                                </label>
                                <label className="text-xs font-medium text-gray-700">
                                  Price ($)
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={size.priceInput}
                                    onChange={(event) =>
                                      updateSize(ci, ii, si, {
                                        priceInput: event.target.value,
                                      })
                                    }
                                    placeholder="0.00"
                                    aria-invalid={sizePriceMissing}
                                    className={`mt-1 ${fieldClass} ${
                                      sizePriceMissing
                                        ? "border-red-400 focus:border-red-500 focus:ring-red-500"
                                        : ""
                                    }`}
                                  />
                                </label>
                                <button
                                  type="button"
                                  onClick={() => removeSize(ci, ii, si)}
                                  className="text-xs font-medium text-red-600 hover:text-red-700 sm:mt-6"
                                >
                                  Remove
                                </button>
                                {sizePriceMissing ? (
                                  <p className="text-xs font-medium text-red-600 sm:col-span-3">
                                    Set a price for this size.
                                  </p>
                                ) : null}
                              </li>
                            );
                          })}
                        </ul>

                        {noSizes ? (
                          <p className="text-xs font-medium text-red-600">
                            Add at least one size, or untick “This item has
                            sizes”.
                          </p>
                        ) : null}

                        {item.sizes.length < MAX_SIZES_PER_ITEM ? (
                          <button
                            type="button"
                            onClick={() => addSize(ci, ii)}
                            className={secondaryButton}
                          >
                            + Add size
                          </button>
                        ) : null}
                      </div>
                    ) : null}

                    <label className="mt-2 block text-sm font-medium text-gray-900">
                      Description{" "}
                      <span className="font-normal text-gray-400">(optional)</span>
                      <textarea
                        rows={2}
                        value={item.description}
                        maxLength={500}
                        onChange={(event) =>
                          updateItem(ci, ii, { description: event.target.value })
                        }
                        className={`mt-1 ${fieldClass}`}
                      />
                    </label>

                    <div className="mt-2 text-right">
                      <button
                        type="button"
                        onClick={() => removeItem(ci, ii)}
                        className="text-xs font-medium text-red-600 hover:text-red-700"
                      >
                        Remove item
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>

            <button
              type="button"
              onClick={() => addItem(ci)}
              className={`mt-3 ${secondaryButton}`}
            >
              + Add item
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addCategory}
        className={`mt-4 ${secondaryButton}`}
      >
        + Add category
      </button>

      <div className="mt-8 flex items-center gap-3 border-t border-gray-200 pt-6">
        <button
          type="button"
          onClick={handlePublish}
          disabled={!canPublish || publishing}
          className={primaryButton}
        >
          <ButtonLabel pending={publishing} pendingLabel="Adding…">
            Add these to my menu
          </ButtonLabel>
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft(null);
            setFiles([]);
            setError(null);
          }}
          className="text-sm font-medium text-gray-500 hover:text-gray-900"
        >
          Start over
        </button>
      </div>
      {!canPublish ? (
        <p className="mt-2 text-xs text-gray-500">
          Give every category a name, every item a name, and either a price or at
          least one named, priced size to continue.
        </p>
      ) : null}
    </section>
  );
}
