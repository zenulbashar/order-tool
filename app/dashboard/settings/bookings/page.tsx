import { Card } from "@/app/_components/card";
import { PageHeader } from "@/app/_components/page-header";
import { requireUser, requireVenuePermission } from "@/lib/tenant";

import { BookingForm } from "../booking-form";
import { SettingsPane, StorefrontHint } from "../settings-pane";

export default async function BookingSettingsPage() {
  await requireUser();
  const venue = await requireVenuePermission("settings:manage");

  return (
    <main className="mx-auto w-full max-w-[1600px]">
      <PageHeader
        title="Bookings"
        backHref="/dashboard/settings"
        description="Let diners reserve a table from your storefront. Bookable times come from your opening hours, and both you and the diner get a confirmation email."
      />
      <section className="max-w-[1280px] px-5 py-8">
        <SettingsPane
          aside={
            <StorefrontHint
              slug={venue.slug}
              where="A 'Book a table' link appears on your storefront, and bookings show under Orders & customers → Bookings."
            />
          }
        >
          <Card>
            <BookingForm
              booking={{
                enabled: venue.bookingsEnabled,
                leadMinutes: venue.bookingLeadMinutes,
                maxDaysAhead: venue.bookingMaxDaysAhead,
                maxPartySize: venue.bookingMaxPartySize,
                durationMinutes: venue.bookingDurationMinutes,
                hasHours: Boolean(venue.openingHours?.length),
              }}
            />
          </Card>
        </SettingsPane>
      </section>
    </main>
  );
}
