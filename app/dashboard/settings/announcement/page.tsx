import { Card } from "@/app/_components/card";
import { SettingsPane, StorefrontHint } from "../settings-pane";
import { PageHeader } from "@/app/_components/page-header";
import { requireUser, requireVenue } from "@/lib/tenant";

import { AnnouncementForm } from "../announcement-form";

export default async function AnnouncementSettingsPage() {
  await requireUser();
  const venue = await requireVenue();

  return (
    <main className="mx-auto w-full max-w-[1600px]">
      <PageHeader
        title="Announcement bar"
        backHref="/dashboard/settings"
        description="A slim promo message across the very top of your storefront."
      />
      <section className="max-w-[1280px] px-5 py-8">
        <SettingsPane
          aside={<StorefrontHint slug={venue.slug} where="A slim bar across the very top of your storefront, above everything else." />}
        >
        <Card>
          <AnnouncementForm announcement={venue.announcement} />
        </Card>
        </SettingsPane>
      </section>
    </main>
  );
}
