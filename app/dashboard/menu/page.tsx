import Link from "next/link";
import { Suspense } from "react";

import { buttonStyles } from "@/app/_components/button-variants";
import { PageHeader } from "@/app/_components/page-header";
import { computeMenuHealth } from "@/lib/menu-health";
import { requireUser, requireVenue } from "@/lib/tenant";

import { MenuHealthPanel } from "./_components/menu-health-panel";
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
    // Wider than the standard max-w-3xl owner page so the master-detail board
    // (320px list + detail) has room; scoped to this page only.
    <main className="mx-auto max-w-6xl">
      <PageHeader
        title="Menu"
        description={venue.name}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {emptyDescriptionCount > 0 ? (
              <Link
                href="/dashboard/menu/descriptions"
                className={buttonStyles("secondary", "sm")}
              >
                Fill empty descriptions ({emptyDescriptionCount})
              </Link>
            ) : null}
            <Link
              href="/dashboard/menu/import"
              className={buttonStyles("secondary", "sm")}
            >
              Import menu from photo
            </Link>
          </div>
        }
      />

      <div className="px-5 py-8">
        <MenuHealthPanel report={health} />

        {/* MenuEditor reads the ?item=/?category= selection via useSearchParams,
            which needs a Suspense boundary. */}
        <Suspense>
          <MenuEditor
            categories={categories}
            items={items}
            groups={groups}
            options={options}
            variants={variants}
            tags={tags}
            categoryOptions={categoryOptions}
          />
        </Suspense>
      </div>
    </main>
  );
}
