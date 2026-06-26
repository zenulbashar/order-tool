import Link from "next/link";

import { computeMenuHealth } from "@/lib/menu-health";
import { requireUser, requireVenue } from "@/lib/tenant";

import { MenuHealthPanel } from "./_components/menu-health-panel";
import { CategoryForm } from "./category-form";
import { MenuEditor } from "./menu-editor";
import {
  getCategoriesForVenue,
  getGroupsForVenue,
  getItemsForVenue,
  getOptionsForVenue,
  getTagsForVenue,
  getVariantsForVenue,
} from "./queries";

export default async function MenuPage() {
  await requireUser();
  const venue = await requireVenue();

  const [categories, items, groups, options, variants, tags] =
    await Promise.all([
      getCategoriesForVenue(venue.id),
      getItemsForVenue(venue.id),
      getGroupsForVenue(venue.id),
      getOptionsForVenue(venue.id),
      getVariantsForVenue(venue.id),
      getTagsForVenue(venue.id),
    ]);

  const categoryOptions = categories.map((c) => ({ id: c.id, name: c.name }));

  // Items with no description yet — drives the "Fill empty descriptions" entry
  // point. Derived from the items already loaded above (no extra query).
  const emptyDescriptionCount = items.filter(
    (item) => !item.description || item.description.trim().length === 0,
  ).length;

  // Menu health — computed read-only from the venue-scoped data already loaded
  // above (no extra query, no writes). Drives the "Menu health" panel below.
  const health = computeMenuHealth(items, categories);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="border-b border-gray-200 pb-6">
        <Link
          href="/dashboard"
          className="text-xs text-gray-500 hover:text-gray-900"
        >
          ← Back to dashboard
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Menu</h1>
            <p className="text-sm text-gray-500">{venue.name}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {emptyDescriptionCount > 0 ? (
              <Link
                href="/dashboard/menu/descriptions"
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              >
                Fill empty descriptions ({emptyDescriptionCount})
              </Link>
            ) : null}
            <Link
              href="/dashboard/menu/import"
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              Import menu from photo
            </Link>
          </div>
        </div>
      </header>

      <MenuHealthPanel report={health} />

      <section className="py-8">
        <h2 className="text-sm font-semibold text-gray-900">Add a category</h2>
        <div className="mt-3 rounded-lg border border-gray-200 p-4">
          <CategoryForm />
        </div>
      </section>

      <MenuEditor
        categories={categories}
        items={items}
        groups={groups}
        options={options}
        variants={variants}
        tags={tags}
        categoryOptions={categoryOptions}
      />
    </main>
  );
}
