import Link from "next/link";

import { requireUser, requireVenue } from "@/lib/tenant";

import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  await requireUser();
  const venue = await requireVenue();

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="border-b border-gray-200 pb-6">
        <Link
          href="/dashboard"
          className="text-xs text-gray-500 hover:text-gray-900"
        >
          ← Back to dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Storefront settings
        </h1>
        <p className="text-sm text-gray-500">{venue.name}</p>
      </header>

      <section className="py-8">
        <div className="rounded-lg border border-gray-200 p-4">
          <SettingsForm
            settings={{
              brandColor: venue.brandColor,
              logoUrl: venue.logoUrl,
              storefrontDescription: venue.storefrontDescription,
            }}
          />
        </div>
        <p className="mt-4 text-xs text-gray-500">
          Your storefront is live at{" "}
          <Link
            href={`/${venue.slug}`}
            className="font-medium text-gray-700 underline"
            target="_blank"
          >
            /{venue.slug}
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
