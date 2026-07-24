"use server";

import { and, asc, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { seoAudits, venueFaqs } from "@/lib/db/schema";
import { requireVenue, scopedToVenue, type Venue } from "@/lib/tenant";
import { venueFaqsSchema } from "@/lib/validation";

const FAQ_PATH = "/dashboard/settings/faqs";

/**
 * Server Functions are POST-reachable, so re-check auth on every call before
 * resolving the tenant. Redirects throw control-flow signals — keep OUTSIDE any
 * try/catch (there is none here).
 */
async function requireVenueForAction(): Promise<Venue> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }
  return requireVenue();
}

export type FaqRow = { question: string; answer: string };

/** Current storefront FAQs for the owner editor (ordered). */
export async function listVenueFaqs(): Promise<FaqRow[]> {
  const venue = await requireVenueForAction();
  return db
    .select({ question: venueFaqs.question, answer: venueFaqs.answer })
    .from(venueFaqs)
    .where(scopedToVenue(venueFaqs.venueId, venue.id))
    .orderBy(asc(venueFaqs.sortOrder), asc(venueFaqs.createdAt));
}

export type SaveFaqsResult =
  | { ok: true; saved: number }
  | { ok: false; error: string };

/**
 * Replace the venue's FAQ set with the reviewed list (venue-scoped). Blank rows
 * are dropped first, then the rest is validated. A replace-all keeps ordering
 * trivial (array index = sort_order) and is the whole write path — there is no
 * partial per-row mutation to get wrong.
 */
export async function saveVenueFaqs(input: {
  faqs: FaqRow[];
}): Promise<SaveFaqsResult> {
  const venue = await requireVenueForAction();

  const nonEmpty = (input?.faqs ?? []).filter(
    (faq) => (faq.question ?? "").trim() !== "" || (faq.answer ?? "").trim() !== "",
  );
  const parsed = venueFaqsSchema.safeParse({ faqs: nonEmpty });
  if (!parsed.success) {
    return {
      ok: false,
      error:
        parsed.error.issues[0]?.message ??
        "Some FAQs need fixing before saving.",
    };
  }

  await db.transaction(async (tx) => {
    await tx.delete(venueFaqs).where(scopedToVenue(venueFaqs.venueId, venue.id));
    if (parsed.data.faqs.length > 0) {
      await tx.insert(venueFaqs).values(
        parsed.data.faqs.map((faq, index) => ({
          venueId: venue.id,
          question: faq.question,
          answer: faq.answer,
          sortOrder: index,
        })),
      );
    }
  });

  revalidatePath(FAQ_PATH);
  revalidatePath(`/${venue.slug}`);
  revalidatePath(`/${venue.slug}/menu`);
  return { ok: true, saved: parsed.data.faqs.length };
}

export type ImportFaqsResult =
  | { ok: true; faqs: FaqRow[] }
  | { ok: false; error: string };

/**
 * Pull the suggested FAQs from the venue's most recent AEO audit (the SEO & AEO
 * studio) so the owner can review and save them here. Read-only — it returns
 * suggestions for the editor to append; nothing is published until the owner
 * saves. Venue-scoped.
 */
export async function importAeoFaqSuggestions(): Promise<ImportFaqsResult> {
  const venue = await requireVenueForAction();
  const [audit] = await db
    .select({ generatedCopy: seoAudits.generatedCopy })
    .from(seoAudits)
    .where(
      and(scopedToVenue(seoAudits.venueId, venue.id), eq(seoAudits.kind, "aeo")),
    )
    .orderBy(desc(seoAudits.createdAt))
    .limit(1);

  const suggestions = audit?.generatedCopy?.suggestedFaqs ?? [];
  if (suggestions.length === 0) {
    return {
      ok: false,
      error:
        "No AEO suggestions yet. Run an AEO audit in SEO & AEO first, then import.",
    };
  }
  return {
    ok: true,
    faqs: suggestions.map((faq) => ({
      question: faq.question,
      answer: faq.answer,
    })),
  };
}
