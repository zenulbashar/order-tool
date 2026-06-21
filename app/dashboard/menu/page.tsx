import Link from "next/link";

import { requireUser, requireVenue } from "@/lib/tenant";

import { deleteCategory, moveCategory } from "./actions";
import { CategoryForm } from "./category-form";
import { ConfirmSubmit } from "./confirm-submit";
import { getCategoriesForVenue } from "./queries";

const secondaryButton =
  "rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40";

export default async function MenuPage() {
  await requireUser();
  const venue = await requireVenue();
  const categories = await getCategoriesForVenue(venue.id);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="border-b border-gray-200 pb-6">
        <Link href="/dashboard" className="text-xs text-gray-500 hover:text-gray-900">
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
          <span className="font-normal text-gray-400">({categories.length})</span>
        </h2>

        {categories.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
            No categories yet. Add your first one above.
          </p>
        ) : (
          <ul className="space-y-2">
            {categories.map((category, index) => (
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

                  <div className="flex shrink-0 items-center gap-1.5">
                    <form action={moveCategory}>
                      <input type="hidden" name="id" value={category.id} />
                      <input type="hidden" name="direction" value="up" />
                      <button
                        type="submit"
                        className={secondaryButton}
                        disabled={index === 0}
                        aria-label={`Move ${category.name} up`}
                      >
                        ↑
                      </button>
                    </form>
                    <form action={moveCategory}>
                      <input type="hidden" name="id" value={category.id} />
                      <input type="hidden" name="direction" value="down" />
                      <button
                        type="submit"
                        className={secondaryButton}
                        disabled={index === categories.length - 1}
                        aria-label={`Move ${category.name} down`}
                      >
                        ↓
                      </button>
                    </form>
                  </div>
                </div>

                <details className="border-t border-gray-100 px-4 py-3">
                  <summary className="cursor-pointer text-xs font-medium text-gray-600">
                    Edit
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
                    <form action={deleteCategory} className="border-t border-gray-100 pt-3">
                      <input type="hidden" name="id" value={category.id} />
                      <ConfirmSubmit
                        message={`Delete "${category.name}"? This also deletes all of its items, modifier groups, and options.`}
                        className="text-xs font-medium text-red-600 hover:text-red-700"
                      >
                        Delete category
                      </ConfirmSubmit>
                    </form>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
