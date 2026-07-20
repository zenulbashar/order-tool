import { Card } from "@/app/_components/card";
import { SettingsPane, StorefrontHint } from "../settings-pane";
import { PageHeader } from "@/app/_components/page-header";
import { requireUser, requireVenue } from "@/lib/tenant";

import { TaxForm } from "../tax-form";

export default async function TaxSettingsPage() {
  await requireUser();
  const venue = await requireVenue();

  return (
    <main className="mx-auto w-full max-w-[1600px]">
      <PageHeader
        title="Tax (GST)"
        backHref="/dashboard/settings"
        description="Australian prices include GST. Turn this on to show the GST portion on diner receipts and your order records — your menu prices and the amount charged stay exactly the same."
      />
      <section className="max-w-[1280px] px-5 py-8">
        <SettingsPane
          aside={<StorefrontHint slug={venue.slug} where="The GST portion shows on diner receipts and in your order records — your menu prices and the amount charged never change." />}
        >
        <Card>
          <TaxForm
            tax={{
              enabled: venue.taxEnabled,
              ratePercent: venue.taxRateBps
                ? (venue.taxRateBps / 100).toString()
                : "",
              label: venue.taxLabel,
            }}
          />
        </Card>
        </SettingsPane>
      </section>
    </main>
  );
}
