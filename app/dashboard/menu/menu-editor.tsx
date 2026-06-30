"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/app/_components/button";
import type { DietaryTag } from "@/lib/validation";

import { deleteCategory, moveCategory } from "./actions";
import { CategoryForm } from "./category-form";
import { ConfirmSubmit } from "./confirm-submit";
import { ItemForm } from "./item-form";
import { ItemRow } from "./item-row";
import { MoveButtons } from "./move-buttons";

/* -------------------------------------------------------------------------- */
/*  Menu editor — the interactive category/item tree.                          */
/*                                                                            */
/*  Owns the accordion (`expandedItemId`: one item open at a time, all         */
/*  collapsed by default) and the per-category inline add-item state. The       */
/*  server page loads every row and passes them here as flat, venue-scoped      */
/*  arrays; this component groups them (exactly as the page used to) and renders */
/*  the tree. Editing/adding/removing revalidates the server page, which        */
/*  re-renders this same instance with fresh props WITHOUT resetting the open    */
/*  row — so a save never collapses what you're working on.                     */
/*                                                                            */
/*  It also owns the menu-health deep link: navigating to #item-<id> (on load   */
/*  AND on hashchange) expands that item, then scrolls to it once it has        */
/*  rendered — fixing the old bug where the scroll fired into a collapsed        */
/*  <details> that wasn't laid out yet.                                         */
/* -------------------------------------------------------------------------- */

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

type GroupData = {
  id: string;
  itemId: string;
  name: string;
  minSelect: number;
  maxSelect: number;
};

type OptionData = {
  id: string;
  groupId: string;
  name: string;
  priceDeltaCents: number;
  isAvailable: boolean;
};

type VariantData = {
  id: string;
  itemId: string;
  name: string;
  priceCents: number;
};

type TagData = { itemId: string; tag: DietaryTag };

export function MenuEditor({
  categories,
  items,
  groups,
  options,
  variants,
  tags,
  categoryOptions,
}: {
  categories: CategoryData[];
  items: ItemData[];
  groups: GroupData[];
  options: OptionData[];
  variants: VariantData[];
  tags: TagData[];
  categoryOptions: { id: string; name: string }[];
}) {
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [addingCategoryId, setAddingCategoryId] = useState<string | null>(null);

  const itemsByCategory = useMemo(() => {
    const map = new Map<string, ItemData[]>();
    for (const item of items) {
      const list = map.get(item.categoryId) ?? [];
      list.push(item);
      map.set(item.categoryId, list);
    }
    return map;
  }, [items]);

  const optionsByGroup = useMemo(() => {
    const map = new Map<string, OptionData[]>();
    for (const option of options) {
      const list = map.get(option.groupId) ?? [];
      list.push(option);
      map.set(option.groupId, list);
    }
    return map;
  }, [options]);

  // Groups for an item, each already carrying its options in sort order.
  const groupsByItem = useMemo(() => {
    const map = new Map<
      string,
      (GroupData & { options: OptionData[] })[]
    >();
    for (const group of groups) {
      const list = map.get(group.itemId) ?? [];
      list.push({ ...group, options: optionsByGroup.get(group.id) ?? [] });
      map.set(group.itemId, list);
    }
    return map;
  }, [groups, optionsByGroup]);

  const variantsByItem = useMemo(() => {
    const map = new Map<string, VariantData[]>();
    for (const variant of variants) {
      const list = map.get(variant.itemId) ?? [];
      list.push(variant);
      map.set(variant.itemId, list);
    }
    return map;
  }, [variants]);

  const tagsByItem = useMemo(() => {
    const map = new Map<string, DietaryTag[]>();
    for (const row of tags) {
      const list = map.get(row.itemId) ?? [];
      list.push(row.tag);
      map.set(row.itemId, list);
    }
    return map;
  }, [tags]);

  // Deep link: react to the hash on mount and on every change. An item anchor
  // expands the item, then scrolls to it on the next frame — once the expanded
  // editor has actually rendered — which fixes the old bug where the scroll
  // fired into a still-collapsed (un-laid-out) row. Other anchors (e.g. a
  // category) just scroll.
  useEffect(() => {
    function reveal() {
      const hash = window.location.hash;
      if (hash.length < 2) return;
      const targetId = decodeURIComponent(hash.slice(1));
      if (targetId.startsWith("item-")) {
        setExpandedItemId(targetId.slice("item-".length));
      }
      // Defer past the expand re-render (two frames) so we land on the open
      // item rather than a row that hasn't been laid out yet.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          document
            .getElementById(targetId)
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
        });
      });
    }
    reveal();
    window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, []);

  return (
    <section className="space-y-3 pb-10">
      <h2 className="text-sm font-semibold text-ink">
        Categories{" "}
        <span className="font-normal text-muted">({categories.length})</span>
      </h2>

      {categories.length === 0 ? (
        <p className="rounded-card border border-dashed border-line p-6 text-center text-sm text-muted">
          No categories yet. Add your first one above.
        </p>
      ) : (
        <ul className="space-y-2">
          {categories.map((category, categoryIndex) => {
            const categoryItems = itemsByCategory.get(category.id) ?? [];
            const isAdding = addingCategoryId === category.id;
            return (
              <li
                key={category.id}
                id={`category-${category.id}`}
                className="scroll-mt-24 rounded-card border border-line"
              >
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">
                      {category.name}
                      {!category.isActive ? (
                        <span className="ml-2 rounded bg-sand px-1.5 py-0.5 text-xs font-normal text-muted">
                          Hidden
                        </span>
                      ) : null}
                    </p>
                    {category.description ? (
                      <p className="truncate text-xs text-muted">
                        {category.description}
                      </p>
                    ) : null}
                  </div>
                  <MoveButtons
                    action={moveCategory}
                    id={category.id}
                    isFirst={categoryIndex === 0}
                    isLast={categoryIndex === categories.length - 1}
                    label={category.name}
                  />
                </div>

                <div className="border-t border-line px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-muted">
                      Items ({categoryItems.length})
                    </p>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        setAddingCategoryId(isAdding ? null : category.id)
                      }
                    >
                      {isAdding ? "Close" : "+ Add item"}
                    </Button>
                  </div>

                  {isAdding ? (
                    <div className="mt-3 rounded-md border border-dashed border-line p-3">
                      <ItemForm categoryId={category.id} />
                    </div>
                  ) : null}

                  {categoryItems.length === 0 ? (
                    <p className="mt-3 text-xs text-muted">No items yet.</p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {categoryItems.map((item, itemIndex) => (
                        <ItemRow
                          key={item.id}
                          item={item}
                          variants={variantsByItem.get(item.id) ?? []}
                          groups={groupsByItem.get(item.id) ?? []}
                          tags={tagsByItem.get(item.id) ?? []}
                          categories={categoryOptions}
                          itemIndex={itemIndex}
                          itemCount={categoryItems.length}
                          isExpanded={expandedItemId === item.id}
                          onToggle={() =>
                            setExpandedItemId(
                              expandedItemId === item.id ? null : item.id,
                            )
                          }
                        />
                      ))}
                    </ul>
                  )}
                </div>

                <details className="border-t border-line px-4 py-3">
                  <summary className={summaryClass}>Category settings</summary>
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
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
