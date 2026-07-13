import { Card } from "@/app/_components/card";
import { PageHeader } from "@/app/_components/page-header";
import { requireUser, requireVenue } from "@/lib/tenant";

import { SocialLinksForm } from "../social-links-form";

export default async function SocialSettingsPage() {
  await requireUser();
  const venue = await requireVenue();

  return (
    <main className="mx-auto max-w-3xl">
      <PageHeader
        title="Social links"
        backHref="/dashboard/settings"
        description="Link your social profiles — they appear as “Follow us” links in your storefront footer."
      />
      <section className="px-5 py-8">
        <Card>
          <SocialLinksForm instagramUrl={venue.instagramUrl} />
        </Card>
      </section>
    </main>
  );
}
