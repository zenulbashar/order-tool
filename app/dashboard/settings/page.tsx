import Link from "next/link";

import { requireUser, requireVenue } from "@/lib/tenant";

import { SettingsDetailsForm } from "./settings-details-form";
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

      <section className="border-t border-gray-200 py-8">
        <h2 className="text-lg font-semibold tracking-tight text-gray-900">
          Business details
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          These power your venue&rsquo;s Google search listing (structured data).
          Everything here is optional, and only the fields you fill in are
          published — blanks are never guessed.
        </p>
        <div className="mt-4 rounded-lg border border-gray-200 p-4">
          <SettingsDetailsForm
            details={{
              streetAddress: venue.streetAddress,
              suburb: venue.suburb,
              state: venue.state,
              postcode: venue.postcode,
              country: venue.country,
              phone: venue.phone,
              openingHours: venue.openingHours,
              latitude: venue.latitude,
              longitude: venue.longitude,
              schedulingEnabled: venue.schedulingEnabled,
              schedulingLeadMinutes: venue.schedulingLeadMinutes,
              schedulingMaxDaysAhead: venue.schedulingMaxDaysAhead,
            }}
          />
        </div>
      </section>
    </main>
  );
}
