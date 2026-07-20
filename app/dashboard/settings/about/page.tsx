import { Card } from "@/app/_components/card";
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
      <section className="max-w-3xl px-5 py-8">
        <Card>
          <AboutForm storefrontDescription={venue.storefrontDescription} />
        </Card>
      </section>
    </main>
  );
}
