"use client";

import { Button } from "@/app/_components/button";
import { Card } from "@/app/_components/card";
import type { DietaryTag } from "@/lib/validation";

import {
  deleteGroup,
  deleteItem,
  deleteOption,
  moveGroup,
  moveOption,
} from "./actions";
import { ConfirmSubmit } from "./confirm-submit";
import { HasSizesEditor } from "./has-sizes-editor";
import { ItemForm } from "./item-form";
import { ModifierGroupForm } from "./modifier-group-form";
import { ModifierOptionForm } from "./modifier-option-form";
import { MoveButtons } from "./move-buttons";
import { PhotoControl } from "./photo-control";
import {
  type IngredientOption,
  type RecipeLineData,
  RecipeEditor,
} from "./recipe-editor";

const summaryClass =
  "cursor-pointer select-none text-xs font-medium text-muted hover:text-ink";

type ItemDetailData = {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  priceCents: number;
  imageUrl: string | null;
  isAvailable: boolean;
  station: "auto" | "kitchen" | "counter";
  stationId: string | null;
};

type VariantRow = { id: string; name: string; priceCents: number };

type OptionRow = {
  id: string;
  name: string;
  priceDeltaCents: number;
  isAvailable: boolean;
};

type GroupRow = {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: OptionRow[];
};

/**
 * The persistent detail pane for the selected item (master-detail). Composes the
 * SAME forms that the old accordion mounted when an item was expanded —
 * transplanted here unchanged: the photo control, the item form (incl. the amber
 * "Suggest description" affordance), the size-variant editor, the modifier
 * groups/options editor, and the delete form. No form wiring changed; only the
 * mount point moved from an inline <details> to this pane.
 */
export function ItemDetail({
  item,
  variants,
  groups,
  tags,
  recipeLines,
  ingredientOptions,
  categories,
  stationOptions,
}: {
  item: ItemDetailData;
  variants: VariantRow[];
  groups: GroupRow[];
  tags: DietaryTag[];
  recipeLines: RecipeLineData[];
  ingredientOptions: IngredientOption[];
  categories: { id: string; name: string }[];
  stationOptions: { id: string; name: string }[];
}) {
  return (
    <div className="space-y-4">
      {/* Top panel: photo + core fields, two columns at lg (photo left), stacked
          on narrow. PhotoControl is a SIBLING of ItemForm (grid columns) —
          never nested inside the form — so image_url stays owned by the
          dedicated upload/remove actions (the O9 invariant). */}
      <Card>
        <div className="grid gap-6 lg:grid-cols-[13rem_1fr]">
          <PhotoControl
            item={{ id: item.id, name: item.name, imageUrl: item.imageUrl }}
          />

          <ItemForm
            categories={categories}
            stationOptions={stationOptions}
            hasSizes={variants.length > 0}
            item={{
              id: item.id,
              categoryId: item.categoryId,
              name: item.name,
              description: item.description,
              priceCents: item.priceCents,
              isAvailable: item.isAvailable,
              station: item.station,
              stationId: item.stationId,
              tags,
            }}
          />
        </div>
      </Card>

      {/* Sizes panel. */}
      <Card>
        <HasSizesEditor itemId={item.id} variants={variants} />
      </Card>

      {/* Modifier groups panel — Card wrapper for visual separation ONLY; the
          accordion internals (ItemModifierGroups) are byte-identical to MD1. */}
      <Card>
        <ItemModifierGroups itemId={item.id} groups={groups} />
      </Card>

      {/* Recipe & cost panel (D2). Its own recipe-line actions — the item's core
          FormData contract is untouched. Cost derives from the ingredient
          library. */}
      <Card>
        <p className="mb-3 text-sm font-medium text-ink">Recipe &amp; cost</p>
        <RecipeEditor
          itemId={item.id}
          priceCents={item.priceCents}
          lines={recipeLines}
          ingredientOptions={ingredientOptions}
          variants={variants.map((v) => ({ name: v.name, priceCents: v.priceCents }))}
        />
      </Card>

      {/* Quiet destructive footer. */}
      <div className="flex justify-end">
        <form action={deleteItem}>
          <input type="hidden" name="id" value={item.id} />
          <ConfirmSubmit
            message={`Delete "${item.name}"? This also deletes its modifier groups and options.`}
          >
            Delete item
          </ConfirmSubmit>
        </form>
      </div>
    </div>
  );
}

/**
 * Item modifier groups + their options (MD3, inline). Options are now ALWAYS
 * visible — each option's form renders directly in its row (no per-option "Edit"
 * disclosure), with the always-visible "+ new option" create row at the bottom.
 * Group editing and group creation stay small disclosures (infrequent actions).
 * Every server action, hidden name="id" input, and useActionState is unchanged —
 * only the click-to-reveal wrappers were removed. There is no auto-save: each
 * option keeps its own explicit Save submit.
 */
function ItemModifierGroups({
  itemId,
  groups,
}: {
  itemId: string;
  groups: GroupRow[];
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-ink">
        Modifier groups ({groups.length})
      </p>

      {groups.length === 0 ? (
        <p className="text-xs text-muted">No modifier groups yet.</p>
      ) : (
        <ul className="space-y-2">
          {groups.map((group, groupIndex) => (
            <li
              key={group.id}
              className="rounded-md border border-line bg-surface-elevated"
            >
              <div className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-ink">
                      {group.name}
                    </p>
                    {/* Diner-facing selection constraint, surfaced from maxSelect. */}
                    <span className="shrink-0 rounded-pill bg-sand px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-label">
                      {group.maxSelect === 1
                        ? "Choose 1"
                        : `Choose up to ${group.maxSelect}`}
                    </span>
                  </div>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted">
                    Min {group.minSelect} · Max {group.maxSelect} ·{" "}
                    {group.minSelect >= 1 ? "required" : "optional"}
                  </p>
                </div>
                <MoveButtons
                  action={moveGroup}
                  id={group.id}
                  isFirst={groupIndex === 0}
                  isLast={groupIndex === groups.length - 1}
                  label={group.name}
                />
              </div>

              {/* Options — always visible, each its own inline form + Save. */}
              <div className="space-y-1.5 border-t border-line px-3 py-2">
                {group.options.length === 0 ? (
                  <p className="text-xs text-muted">No options yet.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {group.options.map((option, optionIndex) => (
                      <li
                        key={option.id}
                        className="flex flex-wrap items-start gap-2 rounded-input border border-line bg-surface-elevated px-2 py-1.5"
                      >
                        <ModifierOptionForm
                          option={{
                            id: option.id,
                            name: option.name,
                            priceDeltaCents: option.priceDeltaCents,
                            isAvailable: option.isAvailable,
                          }}
                        />
                        <div className="flex shrink-0 items-center gap-1.5">
                          <MoveButtons
                            action={moveOption}
                            id={option.id}
                            isFirst={optionIndex === 0}
                            isLast={optionIndex === group.options.length - 1}
                            label={option.name}
                          />
                          <form action={deleteOption}>
                            <input type="hidden" name="id" value={option.id} />
                            <Button
                              type="submit"
                              variant="destructive"
                              size="sm"
                              aria-label={`Delete option ${option.name}`}
                            >
                              ✕
                            </Button>
                          </form>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                {/* Always-visible create row (replaces the old "Add an option"
                    disclosure). */}
                <div className="rounded-input border border-dashed border-line px-2 py-1.5">
                  <ModifierOptionForm groupId={group.id} />
                </div>
              </div>

              <details className="border-t border-line px-3 py-2">
                <summary className={summaryClass}>Edit group</summary>
                <div className="mt-3 space-y-4">
                  <ModifierGroupForm
                    group={{
                      id: group.id,
                      name: group.name,
                      minSelect: group.minSelect,
                      maxSelect: group.maxSelect,
                    }}
                  />
                  <form
                    action={deleteGroup}
                    className="border-t border-line pt-3"
                  >
                    <input type="hidden" name="id" value={group.id} />
                    <ConfirmSubmit
                      message={`Delete "${group.name}"? This also deletes its options.`}
                    >
                      Delete group
                    </ConfirmSubmit>
                  </form>
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}

      <details className="rounded-md border border-dashed border-line px-3 py-2">
        <summary className={summaryClass}>Add a modifier group</summary>
        <div className="mt-3">
          <ModifierGroupForm itemId={itemId} />
        </div>
      </details>
    </div>
  );
}
