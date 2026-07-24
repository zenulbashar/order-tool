import { asc } from "drizzle-orm";

import { Card } from "@/app/_components/card";
import { PageHeader } from "@/app/_components/page-header";
import { db } from "@/lib/db";
import { venueFaqs } from "@/lib/db/schema";
import { requireUser, requireVenue, scopedToVenue } from "@/lib/tenant";

import { SettingsPane, StorefrontHint } from "../settings-pane";
import { FaqsEditor } from "./faqs-editor";

export const dynamic = "force-dynamic";

/**
 * Storefront FAQ manager. What's saved here renders visibly on the storefront
 * footer AND as FAQPage JSON-LD from the same data. "Import from AEO audit"
 * brings over the suggestions from the SEO & AEO studio for review.
 */
export default async function FaqsSettingsPage() {
  await requireUser();
  const venue = await requireVenue();

  const faqs = await db
    .select({ question: venueFaqs.question, answer: venueFaqs.answer })
    .from(venueFaqs)
    .where(scopedToVenue(venueFaqs.venueId, venue.id))
    .orderBy(asc(venueFaqs.sortOrder), asc(venueFaqs.createdAt));

  return (
    <main className="mx-auto w-full max-w-[1600px]">
      <PageHeader
        title="FAQs"
        backHref="/dashboard/settings"
        description="Common questions shown on your storefront and used to answer diners in AI assistants."
      />
      <section className="max-w-[1280px] px-5 py-8">
        <SettingsPane
          aside={
            <StorefrontHint
              slug={venue.slug}
              where="Shown near the footer of your storefront, and published as FAQ structured data for Google and AI assistants."
            />
          }
        >
          <Card>
            <FaqsEditor initial={faqs} />
          </Card>
        </SettingsPane>
      </section>
    </main>
  );
}
