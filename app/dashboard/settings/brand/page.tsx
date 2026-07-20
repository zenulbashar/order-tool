import { Card } from "@/app/_components/card";
import { SettingsPane, StorefrontHint } from "../settings-pane";
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
      <section className="max-w-[1280px] px-5 py-8">
        <SettingsPane
          aside={<StorefrontHint slug={venue.slug} where="Your accent colour tints buttons, links and highlights across your whole storefront." />}
        >
        <Card>
          <BrandThemeForm
            brandColor={venue.brandColor}
            textColor={venue.brandTextColor}
          />
        </Card>
        </SettingsPane>
      </section>
    </main>
  );
}
