import { Card } from "@/app/_components/card";
import { SettingsPane, StorefrontHint } from "../settings-pane";
import { PageHeader } from "@/app/_components/page-header";
import { requireUser, requireVenue } from "@/lib/tenant";

import { SettingsDetailsForm } from "../settings-details-form";

export default async function HoursSettingsPage() {
  await requireUser();
  const venue = await requireVenue();

  return (
    <main className="mx-auto w-full max-w-[1600px]">
      <PageHeader
        title="Opening hours & location"
        backHref="/dashboard/settings"
        description="Your address, phone, opening hours and pickup scheduling — these power your Google search listing. Everything is optional and only the fields you fill in are published."
      />
      <section className="max-w-[1280px] px-5 py-8">
        <SettingsPane
          aside={<StorefrontHint slug={venue.slug} where="Your address, phone and opening hours show on your storefront; scheduling sets the pickup times diners choose at checkout." />}
        >
        <Card>
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
        </SettingsPane>
      </section>
    </main>
  );
}
