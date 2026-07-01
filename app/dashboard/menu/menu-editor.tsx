"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";

import { cx } from "@/app/_components/cx";
import type { DietaryTag } from "@/lib/validation";

import { ItemDetail } from "./item-detail";
import { ItemForm } from "./item-form";
import { MenuListPane } from "./menu-list-pane";

/* -------------------------------------------------------------------------- */
/*  Menu editor — master-detail.                                               */
/*                                                                            */
/*  The server page loads every row and passes flat, venue-scoped arrays; this  */
/*  groups them into the same Maps as before and renders a two-pane layout: a    */
/*  list pane (categories + the selected category's items) and a persistent      */
/*  detail pane for the selected item. "Which item/category is selected" lives   */
/*  in the URL (?category=&item=) so menu-health deep-links select-and-show, and */
/*  the selection survives refresh + back/forward. Item selection uses           */
/*  router.replace (no history spam); the health-panel links are real <Link>s.   */
/* -------------------------------------------------------------------------- */

const MENU_PATH = "/dashboard/menu";

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
  const router = useRouter();
  const searchParams = useSearchParams();

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
    const map = new Map<string, (GroupData & { options: OptionData[] })[]>();
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

  // Selection is read straight off the URL. `item=new` is the create sentinel;
  // any other `item` value selects that id and DERIVES its owning category, so a
  // deep-link only needs `?item=<id>` to also open the right category.
  const itemParam = searchParams.get("item");
  const categoryParam = searchParams.get("category");
  const isCreatingItem = itemParam === "new";
  const selectedItem =
    !isCreatingItem && itemParam
      ? items.find((item) => item.id === itemParam) ?? null
      : null;
  const selectedCategoryId =
    selectedItem?.categoryId ?? categoryParam ?? null;
  const hasDetail = Boolean(selectedItem || isCreatingItem);

  // Replace (not push) so clicking through items doesn't flood history; scroll
  // is preserved. A null value clears that param.
  const navigate = (next: { item?: string | null; category?: string | null }) => {
    const params = new URLSearchParams(searchParams.toString());
    if ("item" in next) {
      if (next.item) params.set("item", next.item);
      else params.delete("item");
    }
    if ("category" in next) {
      if (next.category) params.set("category", next.category);
      else params.delete("category");
    }
    const qs = params.toString();
    router.replace(qs ? `${MENU_PATH}?${qs}` : MENU_PATH, { scroll: false });
  };

  const onSelectCategory = (id: string) =>
    navigate({ category: selectedCategoryId === id ? null : id, item: null });
  // Item implies its category (derived), so we only need the item param.
  const onSelectItem = (id: string) => navigate({ item: id, category: null });
  const onNewItem = (categoryId: string) =>
    navigate({ category: categoryId, item: "new" });
  // Narrow-viewport "back": drop the item but keep the category open in the list.
  const clearDetail = () => navigate({ item: null, category: selectedCategoryId });

  return (
    <section className="pb-10 lg:grid lg:grid-cols-[284px_1fr] lg:overflow-hidden lg:rounded-card lg:border lg:border-line">
      {/* List pane — hidden on narrow viewports while a detail is open. On lg it
          is the framed master column: cream fill, hairline divider, own padding. */}
      <div
        className={cx(
          "min-w-0 lg:border-r lg:border-line lg:bg-hover-secondary lg:p-4",
          hasDetail && "hidden lg:block",
        )}
      >
        <MenuListPane
          categories={categories}
          itemsByCategory={itemsByCategory}
          variantsByItem={variantsByItem}
          selectedCategoryId={selectedCategoryId}
          selectedItemId={selectedItem?.id ?? null}
          isCreatingItem={isCreatingItem}
          onSelectCategory={onSelectCategory}
          onSelectItem={onSelectItem}
          onNewItem={onNewItem}
        />
      </div>

      {/* Detail pane — on narrow viewports it replaces the list when something
          is selected; on lg it's always present (empty prompt when idle). */}
      <div className={cx("min-w-0 lg:p-6", !hasDetail && "hidden lg:block")}>
        {hasDetail ? (
          <button
            type="button"
            onClick={clearDetail}
            className="mb-3 text-sm font-medium text-[var(--action)] transition hover:opacity-80 lg:hidden"
          >
            ← Back to menu
          </button>
        ) : null}

        {isCreatingItem && selectedCategoryId ? (
          <ItemForm categoryId={selectedCategoryId} />
        ) : selectedItem ? (
          <ItemDetail
            item={selectedItem}
            variants={variantsByItem.get(selectedItem.id) ?? []}
            groups={groupsByItem.get(selectedItem.id) ?? []}
            tags={tagsByItem.get(selectedItem.id) ?? []}
            categories={categoryOptions}
          />
        ) : (
          <p className="rounded-card border border-dashed border-line p-8 text-center text-sm text-muted">
            Select an item to edit, or choose a category and add a new one.
          </p>
        )}
      </div>
    </section>
  );
}
