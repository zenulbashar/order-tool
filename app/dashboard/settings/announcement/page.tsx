import { Card } from "@/app/_components/card";
import { PageHeader } from "@/app/_components/page-header";
import { requireUser, requireVenue } from "@/lib/tenant";

import { AnnouncementForm } from "../announcement-form";

export default async function AnnouncementSettingsPage() {
  await requireUser();
  const venue = await requireVenue();

  return (
    <main className="mx-auto max-w-3xl">
      <PageHeader
        title="Announcement bar"
        backHref="/dashboard/settings"
        description="A slim promo message across the very top of your storefront."
      />
      <section className="px-5 py-8">
        <Card>
          <AnnouncementForm announcement={venue.announcement} />
        </Card>
      </section>
    </main>
  );
}
