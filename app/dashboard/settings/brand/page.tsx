import { Card } from "@/app/_components/card";
import { PageHeader } from "@/app/_components/page-header";
import { requireUser, requireVenue } from "@/lib/tenant";

import { BrandThemeForm } from "../brand-theme-form";

export default async function BrandSettingsPage() {
  await requireUser();
  const venue = await requireVenue();

  return (
    <main className="mx-auto w-full max-w-[1600px]">
      <PageHeader
        title="Brand & colours"
        backHref="/dashboard/settings"
        description="The accent colour and text colour used across your storefront."
      />
      <section className="max-w-3xl px-5 py-8">
        <Card>
          <BrandThemeForm
            brandColor={venue.brandColor}
            textColor={venue.brandTextColor}
          />
        </Card>
      </section>
    </main>
  );
}
