import Link from "next/link";

import { requireUser, requireVenue } from "@/lib/tenant";
import { formatCents } from "@/lib/validation";

import {
  deleteCategory,
  deleteGroup,
  deleteItem,
  deleteOption,
  moveCategory,
  moveGroup,
  moveItem,
  moveOption,
} from "./actions";
import { CategoryForm } from "./category-form";
import { ConfirmSubmit } from "./confirm-submit";
import { ItemForm } from "./item-form";
import { ModifierGroupForm } from "./modifier-group-form";
import { ModifierOptionForm } from "./modifier-option-form";
import {
  getCategoriesForVenue,
  getGroupsForVenue,
  getItemsForVenue,
  getOptionsForVenue,
} from "./queries";

const secondaryButton =
  "rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40";

const summaryClass =
  "cursor-pointer select-none text-xs font-medium text-gray-600 hover:text-gray-900";

const deleteLink = "text-xs font-medium text-red-600 hover:text-red-700";

function MoveButtons({
  action,
  id,
  isFirst,
  isLast,
  label,
}: {
  action: (formData: FormData) => void;
  id: string;
  isFirst: boolean;
  isLast: boolean;
  label: string;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <form action={action}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="direction" value="up" />
        <button
          type="submit"
          className={secondaryButton}
          disabled={isFirst}
          aria-label={`Move ${label} up`}
        >
          ↑
        </button>
      </form>
      <form action={action}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="direction" value="down" />
        <button
          type="submit"
          className={secondaryButton}
          disabled={isLast}
          aria-label={`Move ${label} down`}
        >
          ↓
        </button>
      </form>
    </div>
  );
}

export default async function MenuPage() {
  await requireUser();
  const venue = await requireVenue();

  const [categories, items, groups, options] = await Promise.all([
    getCategoriesForVenue(venue.id),
    getItemsForVenue(venue.id),
    getGroupsForVenue(venue.id),
    getOptionsForVenue(venue.id),
  ]);

  const itemsByCategory = new Map<string, typeof items>();
  for (const item of items) {
    const list = itemsByCategory.get(item.categoryId) ?? [];
    list.push(item);
    itemsByCategory.set(item.categoryId, list);
  }
  const groupsByItem = new Map<string, typeof groups>();
  for (const group of groups) {
    const list = groupsByItem.get(group.itemId) ?? [];
    list.push(group);
    groupsByItem.set(group.itemId, list);
  }
  const optionsByGroup = new Map<string, typeof options>();
  for (const option of options) {
    const list = optionsByGroup.get(option.groupId) ?? [];
    list.push(option);
    optionsByGroup.set(option.groupId, list);
  }
  const categoryOptions = categories.map((c) => ({ id: c.id, name: c.name }));

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="border-b border-gray-200 pb-6">
        <Link
          href="/dashboard"
          className="text-xs text-gray-500 hover:text-gray-900"
        >
          ← Back to dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Menu</h1>
        <p className="text-sm text-gray-500">{venue.name}</p>
      </header>

      <section className="py-8">
        <h2 className="text-sm font-semibold text-gray-900">Add a category</h2>
        <div className="mt-3 rounded-lg border border-gray-200 p-4">
          <CategoryForm />
        </div>
      </section>

      <section className="space-y-3 pb-10">
        <h2 className="text-sm font-semibold text-gray-900">
          Categories{" "}
          <span className="font-normal text-gray-400">
            ({categories.length})
          </span>
        </h2>

        {categories.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
            No categories yet. Add your first one above.
          </p>
        ) : (
          <ul className="space-y-2">
            {categories.map((category, categoryIndex) => {
              const categoryItems = itemsByCategory.get(category.id) ?? [];
              return (
                <li
                  key={category.id}
                  className="rounded-lg border border-gray-200"
                >
                  <div className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-900">
                        {category.name}
                        {!category.isActive ? (
                          <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs font-normal text-gray-500">
                            Hidden
                          </span>
                        ) : null}
                      </p>
                      {category.description ? (
                        <p className="truncate text-xs text-gray-500">
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

                  <details className="border-t border-gray-100 px-4 py-3">
                    <summary className={summaryClass}>
                      Items ({categoryItems.length})
                    </summary>
                    <div className="mt-3 space-y-2">
                      {categoryItems.length === 0 ? (
                        <p className="text-xs text-gray-500">No items yet.</p>
                      ) : (
                        <ul className="space-y-2">
                          {categoryItems.map((item, itemIndex) => {
                            const itemGroups = groupsByItem.get(item.id) ?? [];
                            return (
                              <li
                                key={item.id}
                                className="rounded-md border border-gray-200 bg-gray-50/50"
                              >
                                <div className="flex items-center justify-between gap-3 px-3 py-2">
                                  <div className="min-w-0">
                                    <p className="truncate text-sm text-gray-900">
                                      {item.name}
                                      <span className="ml-2 text-gray-500">
                                        ${formatCents(item.priceCents)}
                                      </span>
                                      {!item.isAvailable ? (
                                        <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                                          Unavailable
                                        </span>
                                      ) : null}
                                    </p>
                                    {item.description ? (
                                      <p className="truncate text-xs text-gray-500">
                                        {item.description}
                                      </p>
                                    ) : null}
                                  </div>
                                  <MoveButtons
                                    action={moveItem}
                                    id={item.id}
                                    isFirst={itemIndex === 0}
                                    isLast={
                                      itemIndex === categoryItems.length - 1
                                    }
                                    label={item.name}
                                  />
                                </div>

                                <details className="border-t border-gray-100 px-3 py-2">
                                  <summary className={summaryClass}>
                                    Modifier groups ({itemGroups.length})
                                  </summary>
                                  <div className="mt-3 space-y-2">
                                    {itemGroups.length === 0 ? (
                                      <p className="text-xs text-gray-500">
                                        No modifier groups yet.
                                      </p>
                                    ) : (
                                      <ul className="space-y-2">
                                        {itemGroups.map((group, groupIndex) => {
                                          const groupOptions =
                                            optionsByGroup.get(group.id) ?? [];
                                          return (
                                            <li
                                              key={group.id}
                                              className="rounded-md border border-gray-200 bg-white"
                                            >
                                              <div className="flex items-center justify-between gap-3 px-3 py-2">
                                                <div className="min-w-0">
                                                  <p className="truncate text-sm text-gray-900">
                                                    {group.name}
                                                    {group.minSelect >= 1 ? (
                                                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">
                                                        Required
                                                      </span>
                                                    ) : null}
                                                  </p>
                                                  <p className="text-xs text-gray-500">
                                                    min {group.minSelect} · max{" "}
                                                    {group.maxSelect}
                                                  </p>
                                                </div>
                                                <MoveButtons
                                                  action={moveGroup}
                                                  id={group.id}
                                                  isFirst={groupIndex === 0}
                                                  isLast={
                                                    groupIndex ===
                                                    itemGroups.length - 1
                                                  }
                                                  label={group.name}
                                                />
                                              </div>

                                              <details className="border-t border-gray-100 px-3 py-2">
                                                <summary className={summaryClass}>
                                                  Options ({groupOptions.length})
                                                </summary>
                                                <div className="mt-3 space-y-2">
                                                  {groupOptions.length === 0 ? (
                                                    <p className="text-xs text-gray-500">
                                                      No options yet.
                                                    </p>
                                                  ) : (
                                                    <ul className="space-y-1.5">
                                                      {groupOptions.map(
                                                        (option, optionIndex) => (
                                                          <li
                                                            key={option.id}
                                                            className="rounded border border-gray-200 bg-gray-50/50"
                                                          >
                                                            <div className="flex items-center justify-between gap-3 px-3 py-1.5">
                                                              <p className="truncate text-sm text-gray-900">
                                                                {option.name}
                                                                {option.priceDeltaCents >
                                                                0 ? (
                                                                  <span className="ml-2 text-gray-500">
                                                                    +$
                                                                    {formatCents(
                                                                      option.priceDeltaCents,
                                                                    )}
                                                                  </span>
                                                                ) : null}
                                                                {!option.isAvailable ? (
                                                                  <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                                                                    Unavailable
                                                                  </span>
                                                                ) : null}
                                                              </p>
                                                              <MoveButtons
                                                                action={
                                                                  moveOption
                                                                }
                                                                id={option.id}
                                                                isFirst={
                                                                  optionIndex ===
                                                                  0
                                                                }
                                                                isLast={
                                                                  optionIndex ===
                                                                  groupOptions.length -
                                                                    1
                                                                }
                                                                label={
                                                                  option.name
                                                                }
                                                              />
                                                            </div>
                                                            <details className="border-t border-gray-100 px-3 py-1.5">
                                                              <summary
                                                                className={
                                                                  summaryClass
                                                                }
                                                              >
                                                                Edit
                                                              </summary>
                                                              <div className="mt-3 space-y-4">
                                                                <ModifierOptionForm
                                                                  option={{
                                                                    id: option.id,
                                                                    name: option.name,
                                                                    priceDeltaCents:
                                                                      option.priceDeltaCents,
                                                                    isAvailable:
                                                                      option.isAvailable,
                                                                  }}
                                                                />
                                                                <form
                                                                  action={
                                                                    deleteOption
                                                                  }
                                                                  className="border-t border-gray-100 pt-3"
                                                                >
                                                                  <input
                                                                    type="hidden"
                                                                    name="id"
                                                                    value={
                                                                      option.id
                                                                    }
                                                                  />
                                                                  <button
                                                                    type="submit"
                                                                    className={
                                                                      deleteLink
                                                                    }
                                                                  >
                                                                    Delete option
                                                                  </button>
                                                                </form>
                                                              </div>
                                                            </details>
                                                          </li>
                                                        ),
                                                      )}
                                                    </ul>
                                                  )}

                                                  <details className="rounded border border-dashed border-gray-300 px-3 py-1.5">
                                                    <summary
                                                      className={summaryClass}
                                                    >
                                                      Add an option
                                                    </summary>
                                                    <div className="mt-3">
                                                      <ModifierOptionForm
                                                        groupId={group.id}
                                                      />
                                                    </div>
                                                  </details>
                                                </div>
                                              </details>

                                              <details className="border-t border-gray-100 px-3 py-2">
                                                <summary className={summaryClass}>
                                                  Edit group
                                                </summary>
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
                                                    className="border-t border-gray-100 pt-3"
                                                  >
                                                    <input
                                                      type="hidden"
                                                      name="id"
                                                      value={group.id}
                                                    />
                                                    <ConfirmSubmit
                                                      message={`Delete "${group.name}"? This also deletes its options.`}
                                                      className={deleteLink}
                                                    >
                                                      Delete group
                                                    </ConfirmSubmit>
                                                  </form>
                                                </div>
                                              </details>
                                            </li>
                                          );
                                        })}
                                      </ul>
                                    )}

                                    <details className="rounded-md border border-dashed border-gray-300 px-3 py-2">
                                      <summary className={summaryClass}>
                                        Add a modifier group
                                      </summary>
                                      <div className="mt-3">
                                        <ModifierGroupForm itemId={item.id} />
                                      </div>
                                    </details>
                                  </div>
                                </details>

                                <details className="border-t border-gray-100 px-3 py-2">
                                  <summary className={summaryClass}>
                                    Edit item
                                  </summary>
                                  <div className="mt-3 space-y-4">
                                    <ItemForm
                                      categories={categoryOptions}
                                      item={{
                                        id: item.id,
                                        categoryId: item.categoryId,
                                        name: item.name,
                                        description: item.description,
                                        priceCents: item.priceCents,
                                        imageUrl: item.imageUrl,
                                        isAvailable: item.isAvailable,
                                      }}
                                    />
                                    <form
                                      action={deleteItem}
                                      className="border-t border-gray-100 pt-3"
                                    >
                                      <input
                                        type="hidden"
                                        name="id"
                                        value={item.id}
                                      />
                                      <ConfirmSubmit
                                        message={`Delete "${item.name}"? This also deletes its modifier groups and options.`}
                                        className={deleteLink}
                                      >
                                        Delete item
                                      </ConfirmSubmit>
                                    </form>
                                  </div>
                                </details>
                              </li>
                            );
                          })}
                        </ul>
                      )}

                      <details className="rounded-md border border-dashed border-gray-300 px-3 py-2">
                        <summary className={summaryClass}>Add an item</summary>
                        <div className="mt-3">
                          <ItemForm categoryId={category.id} />
                        </div>
                      </details>
                    </div>
                  </details>

                  <details className="border-t border-gray-100 px-4 py-3">
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
                        className="border-t border-gray-100 pt-3"
                      >
                        <input type="hidden" name="id" value={category.id} />
                        <ConfirmSubmit
                          message={`Delete "${category.name}"? This also deletes all of its items, modifier groups, and options.`}
                          className={deleteLink}
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
    </main>
  );
}
