"use client";

import { Button } from "@/app/_components/button";
import { Card } from "@/app/_components/card";
import type { DietaryTag } from "@/lib/validation";
import { formatCents } from "@/lib/validation";

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
  categories,
}: {
  item: ItemDetailData;
  variants: VariantRow[];
  groups: GroupRow[];
  tags: DietaryTag[];
  categories: { id: string; name: string }[];
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
            hasSizes={variants.length > 0}
            item={{
              id: item.id,
              categoryId: item.categoryId,
              name: item.name,
              description: item.description,
              priceCents: item.priceCents,
              isAvailable: item.isAvailable,
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
 * Item modifier groups + their options. Transplanted UNCHANGED from item-row's
 * old expanded block (same nested <details> and the same group/option server
 * actions) — the inline-editable rebuild is MD3's job, not this PR.
 */
function ItemModifierGroups({
  itemId,
  groups,
}: {
  itemId: string;
  groups: GroupRow[];
}) {
  return (
    <details className="border-t border-line pt-3">
      <summary className={summaryClass}>
        Modifier groups ({groups.length})
      </summary>
      <div className="mt-3 space-y-2">
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
                    <p className="truncate text-sm text-ink">
                      {group.name}
                      {group.minSelect >= 1 ? (
                        <span className="ml-2 rounded bg-[var(--color-accent)]/15 px-1.5 py-0.5 text-xs text-accent-deep">
                          Required
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted">
                      min {group.minSelect} · max {group.maxSelect}
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

                <details className="border-t border-line px-3 py-2">
                  <summary className={summaryClass}>
                    Options ({group.options.length})
                  </summary>
                  <div className="mt-3 space-y-2">
                    {group.options.length === 0 ? (
                      <p className="text-xs text-muted">No options yet.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {group.options.map((option, optionIndex) => (
                          <li
                            key={option.id}
                            className="rounded border border-line bg-sand/40"
                          >
                            <div className="flex items-center justify-between gap-3 px-3 py-1.5">
                              <p className="truncate text-sm text-ink">
                                {option.name}
                                {option.priceDeltaCents > 0 ? (
                                  <span className="ml-2 text-muted">
                                    +${formatCents(option.priceDeltaCents)}
                                  </span>
                                ) : null}
                                {!option.isAvailable ? (
                                  <span className="ml-2 rounded bg-sand px-1.5 py-0.5 text-xs text-muted">
                                    Unavailable
                                  </span>
                                ) : null}
                              </p>
                              <MoveButtons
                                action={moveOption}
                                id={option.id}
                                isFirst={optionIndex === 0}
                                isLast={optionIndex === group.options.length - 1}
                                label={option.name}
                              />
                            </div>
                            <details className="border-t border-line px-3 py-1.5">
                              <summary className={summaryClass}>Edit</summary>
                              <div className="mt-3 space-y-4">
                                <ModifierOptionForm
                                  option={{
                                    id: option.id,
                                    name: option.name,
                                    priceDeltaCents: option.priceDeltaCents,
                                    isAvailable: option.isAvailable,
                                  }}
                                />
                                <form
                                  action={deleteOption}
                                  className="border-t border-line pt-3"
                                >
                                  <input
                                    type="hidden"
                                    name="id"
                                    value={option.id}
                                  />
                                  <Button
                                    type="submit"
                                    variant="destructive"
                                    size="sm"
                                  >
                                    Delete option
                                  </Button>
                                </form>
                              </div>
                            </details>
                          </li>
                        ))}
                      </ul>
                    )}

                    <details className="rounded border border-dashed border-line px-3 py-1.5">
                      <summary className={summaryClass}>Add an option</summary>
                      <div className="mt-3">
                        <ModifierOptionForm groupId={group.id} />
                      </div>
                    </details>
                  </div>
                </details>

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
    </details>
  );
}
