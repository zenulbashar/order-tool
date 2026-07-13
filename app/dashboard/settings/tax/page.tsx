import { Card } from "@/app/_components/card";
import { PageHeader } from "@/app/_components/page-header";
import { requireUser, requireVenue } from "@/lib/tenant";

import { TaxForm } from "../tax-form";

export default async function TaxSettingsPage() {
  await requireUser();
  const venue = await requireVenue();

  return (
    <main className="mx-auto max-w-3xl">
      <PageHeader
        title="Tax (GST)"
        backHref="/dashboard/settings"
        description="Australian prices include GST. Turn this on to show the GST portion on diner receipts and your order records — your menu prices and the amount charged stay exactly the same."
      />
      <section className="px-5 py-8">
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
      </section>
    </main>
  );
}
