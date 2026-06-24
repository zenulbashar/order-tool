"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { dollarsToCents, formatCents } from "@/lib/validation";

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
type UiItem = {
  name: string;
  priceInput: string;
  priceText: string;
  description: string;
};
type UiCategory = { name: string; items: UiItem[] };

function blankItem(): UiItem {
  return { name: "", priceInput: "", priceText: "", description: "" };
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

  // Publish is gated until every category is named and every item has a name
  // AND a valid price — the model never silently provides a missing price.
  const canPublish =
    draft !== null &&
    draft.length > 0 &&
    draft.every(
      (category) =>
        category.name.trim().length > 0 &&
        category.items.every(
          (item) =>
            item.name.trim().length > 0 &&
            dollarsToCents(item.priceInput) !== null,
        ),
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
            items: category.items.map((item) => ({
              name: item.name,
              priceInput: item.priceCents === null ? "" : formatCents(item.priceCents),
              priceText: item.priceText,
              description: item.description,
            })),
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
        items: category.items.map((item) => ({
          name: item.name.trim(),
          // canPublish guarantees a non-null parse; ?? 0 is a type guard only.
          priceCents: dollarsToCents(item.priceInput) ?? 0,
          description: item.description.trim(),
        })),
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
            {extracting ? "Reading menu…" : "Read menu"}
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
          <strong>Review every line before adding it.</strong> Prices come from
          an AI reading a photo and can be wrong — check each one, especially any
          flagged below. Nothing is added to your live menu until you choose
          “Add these to my menu”. Re-importing later adds these again.
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
                const priceMissing = dollarsToCents(item.priceInput) === null;
                return (
                  <li
                    key={ii}
                    className="rounded-md border border-gray-200 bg-gray-50/50 p-3"
                  >
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
                            updateItem(ci, ii, { priceInput: event.target.value })
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

                    {priceMissing ? (
                      <p className="mt-1.5 text-xs font-medium text-red-600">
                        Set a price
                        {item.priceText
                          ? ` — the menu shows “${item.priceText}”`
                          : ""}
                        .
                      </p>
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
          {publishing ? "Adding…" : "Add these to my menu"}
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
          Give every category a name and every item a name and price to continue.
        </p>
      ) : null}
    </section>
  );
}
