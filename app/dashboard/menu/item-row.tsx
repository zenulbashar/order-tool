"use client";

import { Button } from "@/app/_components/button";
import type { DietaryTag } from "@/lib/validation";
import { formatCents } from "@/lib/validation";

import {
  deleteGroup,
  deleteItem,
  deleteOption,
  moveGroup,
  moveItem,
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

type ItemRowData = {
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
 * One menu item in the accordion. Collapsed it shows just enough to identify the
 * item (thumbnail, name, price — "from $X" for sized items — and badges). The
 * full editor is mounted ONLY while expanded, so only the open item's forms live
 * in the DOM. Expand/collapse is controlled by the parent (`isExpanded` +
 * `onToggle`), which enforces the one-open-at-a-time accordion.
 */
export function ItemRow({
  item,
  variants,
  groups,
  tags,
  categories,
  itemIndex,
  itemCount,
  isExpanded,
  onToggle,
}: {
  item: ItemRowData;
  variants: VariantRow[];
  groups: GroupRow[];
  tags: DietaryTag[];
  categories: { id: string; name: string }[];
  itemIndex: number;
  itemCount: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  // Mirror the storefront: a variant-priced item advertises its lowest size as
  // "from $X"; a flat item shows its single price. The base price_cents is
  // ignored when variants exist (the EITHER flat OR variant rule).
  const fromPriceCents =
    variants.length > 0
      ? Math.min(...variants.map((variant) => variant.priceCents))
      : null;

  return (
    <li
      id={`item-${item.id}`}
      className="scroll-mt-24 rounded-card border border-line bg-sand/40"
    >
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isExpanded}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
        >
          <span className="text-muted" aria-hidden="true">
            {isExpanded ? "▾" : "▸"}
          </span>
          {item.imageUrl ? (
            // Owner-supplied URL; next/image would need remote config.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.imageUrl}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-10 w-10 shrink-0 rounded-md border border-line object-cover"
            />
          ) : null}
          <span className="min-w-0">
            <span className="block truncate text-sm text-ink">
              {item.name}
              <span className="ml-2 text-muted">
                {fromPriceCents !== null
                  ? `from $${formatCents(fromPriceCents)}`
                  : `$${formatCents(item.priceCents)}`}
              </span>
              {variants.length > 0 ? (
                <span className="ml-2 rounded bg-sand px-1.5 py-0.5 text-xs text-muted">
                  {variants.length} size{variants.length === 1 ? "" : "s"}
                </span>
              ) : null}
              {!item.isAvailable ? (
                <span className="ml-2 rounded bg-sand px-1.5 py-0.5 text-xs text-muted">
                  Unavailable
                </span>
              ) : null}
            </span>
            {item.description ? (
              <span className="block truncate text-xs text-muted">
                {item.description}
              </span>
            ) : null}
          </span>
        </button>
        <MoveButtons
          action={moveItem}
          id={item.id}
          isFirst={itemIndex === 0}
          isLast={itemIndex === itemCount - 1}
          label={item.name}
        />
      </div>

      {isExpanded ? (
        <div className="space-y-3 border-t border-line px-3 py-3">
          {/* Photo as the image area. Its own upload/remove forms — a SIBLING of
              ItemForm below, never nested inside it, so image_url stays owned by
              the dedicated upload/remove actions. */}
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

          <HasSizesEditor itemId={item.id} variants={variants} />

          <ItemModifierGroups itemId={item.id} groups={groups} />

          <form
            action={deleteItem}
            className="border-t border-line pt-3"
          >
            <input type="hidden" name="id" value={item.id} />
            <ConfirmSubmit
              message={`Delete "${item.name}"? This also deletes its modifier groups and options.`}
            >
              Delete item
            </ConfirmSubmit>
          </form>
        </div>
      ) : null}
    </li>
  );
}

/**
 * Item modifier groups + their options. Relocated unchanged from the old page
 * tree (same nested <details> and the same group/option server actions). Kept
 * collapsed under one disclosure so the expanded item stays tidy.
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
