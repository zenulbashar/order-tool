"use client";

import { Button } from "@/app/_components/button";
import { cx } from "@/app/_components/cx";

import { deleteCategory, moveCategory } from "./actions";
import { CategoryForm } from "./category-form";
import { ConfirmSubmit } from "./confirm-submit";
import { ItemRow } from "./item-row";
import { MoveButtons } from "./move-buttons";

const summaryClass =
  "cursor-pointer select-none text-xs font-medium text-muted hover:text-ink";

type CategoryData = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
};

type ItemData = {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  priceCents: number;
  imageUrl: string | null;
  isAvailable: boolean;
};

type VariantData = {
  id: string;
  itemId: string;
  name: string;
  priceCents: number;
};

/**
 * The master list pane: every category (with its item count) plus, for the
 * SELECTED category only, its items as an indented sub-list. Selecting a
 * category or item drives the `?category=`/`?item=` URL params (handled by the
 * parent). Category create / reorder / delete / settings all live here now —
 * the same server-action forms, just relocated into the compact list rows.
 */
export function MenuListPane({
  categories,
  itemsByCategory,
  variantsByItem,
  selectedCategoryId,
  selectedItemId,
  isCreatingItem,
  onSelectCategory,
  onSelectItem,
  onNewItem,
}: {
  categories: CategoryData[];
  itemsByCategory: Map<string, ItemData[]>;
  variantsByItem: Map<string, VariantData[]>;
  selectedCategoryId: string | null;
  selectedItemId: string | null;
  isCreatingItem: boolean;
  onSelectCategory: (id: string) => void;
  onSelectItem: (id: string) => void;
  onNewItem: (categoryId: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">
          Categories{" "}
          <span className="font-normal text-muted">({categories.length})</span>
        </h2>
      </div>

      {/* New-category create — a small disclosure, not the detail pane. */}
      <details className="rounded-card border border-dashed border-line px-3 py-2">
        <summary className={summaryClass}>＋ New category</summary>
        <div className="mt-3">
          <CategoryForm />
        </div>
      </details>

      {categories.length === 0 ? (
        <p className="rounded-card border border-dashed border-line p-6 text-center text-sm text-muted">
          No categories yet. Add your first one above.
        </p>
      ) : (
        <ul className="space-y-2">
          {categories.map((category, categoryIndex) => {
            const categoryItems = itemsByCategory.get(category.id) ?? [];
            const isOpen = selectedCategoryId === category.id;
            return (
              <li
                key={category.id}
                className={cx(
                  "rounded-card border",
                  isOpen ? "border-[var(--action)]" : "border-line",
                )}
              >
                <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => onSelectCategory(category.id)}
                    aria-expanded={isOpen}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <span className="truncate text-sm font-medium text-ink">
                      {category.name}
                    </span>
                    {!category.isActive ? (
                      <span className="shrink-0 rounded bg-sand px-1.5 py-0.5 text-xs font-normal text-muted">
                        Hidden
                      </span>
                    ) : null}
                    <span className="ml-auto shrink-0 font-mono text-xs text-muted">
                      {categoryItems.length}
                    </span>
                  </button>
                  <MoveButtons
                    action={moveCategory}
                    id={category.id}
                    isFirst={categoryIndex === 0}
                    isLast={categoryIndex === categories.length - 1}
                    label={category.name}
                  />
                </div>

                {isOpen ? (
                  <div className="space-y-2 border-t border-line px-3 py-3">
                    {categoryItems.length === 0 ? (
                      <p className="text-xs text-muted">No items yet.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {categoryItems.map((item, itemIndex) => (
                          <ItemRow
                            key={item.id}
                            item={item}
                            variants={variantsByItem.get(item.id) ?? []}
                            itemIndex={itemIndex}
                            itemCount={categoryItems.length}
                            isSelected={selectedItemId === item.id}
                            onSelect={() => onSelectItem(item.id)}
                          />
                        ))}
                      </ul>
                    )}

                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      aria-current={isCreatingItem ? "true" : undefined}
                      onClick={() => onNewItem(category.id)}
                    >
                      + New item
                    </Button>

                    <details className="border-t border-line pt-2">
                      <summary className={summaryClass}>
                        Category settings
                      </summary>
                      <div className="mt-3 space-y-4">
                        <CategoryForm
                          category={{
                            id: category.id,
                            name: category.name,
                            description: category.description,
                            isActive: category.isActive,
                          }}
                        />
                        <form
                          action={deleteCategory}
                          className="border-t border-line pt-3"
                        >
                          <input type="hidden" name="id" value={category.id} />
                          <ConfirmSubmit
                            message={`Delete "${category.name}"? This also deletes all of its items, modifier groups, and options.`}
                          >
                            Delete category
                          </ConfirmSubmit>
                        </form>
                      </div>
                    </details>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
