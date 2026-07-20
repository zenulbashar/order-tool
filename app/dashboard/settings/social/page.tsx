import { Card } from "@/app/_components/card";
import { SettingsPane, StorefrontHint } from "../settings-pane";
import { PageHeader } from "@/app/_components/page-header";
import { requireUser, requireVenue } from "@/lib/tenant";

import { SocialLinksForm } from "../social-links-form";

export default async function SocialSettingsPage() {
  await requireUser();
  const venue = await requireVenue();

  return (
    <main className="mx-auto w-full max-w-[1600px]">
      <PageHeader
        title="Social links"
        backHref="/dashboard/settings"
        description="Link your social profiles — they appear as “Follow us” links in your storefront footer."
      />
      <section className="max-w-[1280px] px-5 py-8">
        <SettingsPane
          aside={<StorefrontHint slug={venue.slug} where="Appear as “Follow us” links in your storefront footer." />}
        >
        <Card>
          <SocialLinksForm
            links={{
              instagramUrl: venue.instagramUrl,
              facebookUrl: venue.facebookUrl,
              xUrl: venue.xUrl,
              youtubeUrl: venue.youtubeUrl,
              tiktokUrl: venue.tiktokUrl,
              linkedinUrl: venue.linkedinUrl,
              websiteUrl: venue.websiteUrl,
            }}
          />
        </Card>
        </SettingsPane>
      </section>
    </main>
  );
}
