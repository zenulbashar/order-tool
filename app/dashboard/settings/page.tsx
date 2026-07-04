import Link from "next/link";

import { Card } from "@/app/_components/card";
import { PageHeader } from "@/app/_components/page-header";
import { requireUser, requireVenue } from "@/lib/tenant";

import { LogoControl } from "./logo-control";
import { SettingsDetailsForm } from "./settings-details-form";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  await requireUser();
  const venue = await requireVenue();

  return (
    <main className="mx-auto max-w-3xl">
      <PageHeader title="Storefront settings" description={venue.name} />

      <section className="space-y-4 px-5 py-8">
        <Card>
          <SettingsForm
            settings={{
              brandColor: venue.brandColor,
              storefrontDescription: venue.storefrontDescription,
            }}
          />
        </Card>
        <Card>
          <LogoControl logoUrl={venue.logoUrl} />
        </Card>
        <p className="text-xs text-muted">
          Your storefront is live at{" "}
          <Link
            href={`/${venue.slug}`}
            className="font-medium text-[var(--action)] underline hover:opacity-80"
            target="_blank"
          >
            /{venue.slug}
          </Link>
          .
        </p>
      </section>

      <section className="border-t border-line px-5 py-8">
        <h2 className="font-display text-lg font-semibold tracking-tight text-ink">
          Business details
        </h2>
        <p className="mt-1 text-sm text-muted">
          These power your venue&rsquo;s Google search listing (structured data).
          Everything here is optional, and only the fields you fill in are
          published — blanks are never guessed.
        </p>
        <Card className="mt-4">
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
        </Card>
      </section>
    </main>
  );
}
