import Link from "next/link";

import { Card } from "@/app/_components/card";
import { PageHeader } from "@/app/_components/page-header";
import { requireUser, requireVenue } from "@/lib/tenant";

import { ImageryControl } from "./imagery-control";
import { LogoControl } from "./logo-control";
import { NotifyToggle } from "./notify-toggle";
import { SettingsDetailsForm } from "./settings-details-form";
import { SettingsForm } from "./settings-form";
import { TaxForm } from "./tax-form";

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
        <Card>
          <div className="space-y-6">
            <div>
              <h2 className="font-display text-base font-semibold tracking-tight text-ink">
                Storefront imagery
              </h2>
              <p className="mt-0.5 text-xs text-muted">
                Brand your storefront with a cover photo and a backdrop that
                fills the space beside your menu on larger screens. JPEG, PNG or
                WebP, up to 5MB each. Both are optional — leave them off to keep
                the current look.
              </p>
            </div>
            <ImageryControl
              slot="cover"
              title="Cover image"
              description="Replaces the coloured banner across the top of your storefront. A wide, landscape photo works best."
              imageUrl={venue.coverUrl}
            />
            <div className="border-t border-line pt-6">
              <ImageryControl
                slot="background"
                title="Background image"
                description="Fills the empty space on either side of your menu on wide screens (desktop). Shown on your menu, checkout, order, and account pages. Keep the focus toward the edges — the centre sits behind your menu."
                imageUrl={venue.backgroundUrl}
              />
            </div>
          </div>
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
          Notifications
        </h2>
        <p className="mt-1 text-sm text-muted">
          Get a push notification on your phone the moment a new order comes in
          (needs the Prompt2Eat app installed and signed in).
        </p>
        <Card className="mt-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-ink">
                New-order notifications
              </p>
              <p className="text-xs text-muted">
                Sent to every device signed in to this venue.
              </p>
            </div>
            <NotifyToggle enabled={venue.pushNewOrders} />
          </div>
        </Card>
      </section>

      <section className="border-t border-line px-5 py-8">
        <h2 className="font-display text-lg font-semibold tracking-tight text-ink">
          Tax (GST)
        </h2>
        <p className="mt-1 text-sm text-muted">
          Australian prices include GST. Turn this on to show the GST portion on
          diner receipts and your order records — your menu prices and the amount
          charged stay exactly the same.
        </p>
        <Card className="mt-4">
          <TaxForm
            tax={{
              enabled: venue.taxEnabled,
              ratePercent: venue.taxRateBps ? (venue.taxRateBps / 100).toString() : "",
              label: venue.taxLabel,
            }}
          />
        </Card>
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
