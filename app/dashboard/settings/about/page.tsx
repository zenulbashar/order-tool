import { Card } from "@/app/_components/card";
import { SettingsPane, StorefrontHint } from "../settings-pane";
import { PageHeader } from "@/app/_components/page-header";
import { requireUser, requireVenue } from "@/lib/tenant";

import { AboutForm } from "../about-form";

export default async function AboutSettingsPage() {
  await requireUser();
  const venue = await requireVenue();

  return (
    <main className="mx-auto w-full max-w-[1600px]">
      <PageHeader
        title="About & description"
        backHref="/dashboard/settings"
        description="A short welcome line shown under your venue name on the storefront."
      />
      <section className="max-w-[1280px] px-5 py-8">
        <SettingsPane
          aside={<StorefrontHint slug={venue.slug} where="Shown as a short welcome line under your venue name on your storefront." />}
        >
        <Card>
          <AboutForm storefrontDescription={venue.storefrontDescription} />
        </Card>
        </SettingsPane>
      </section>
    </main>
  );
}
