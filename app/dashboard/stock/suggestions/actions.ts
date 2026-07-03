"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { z } from "zod";

import { auth } from "@/lib/auth";
import { dismissNudge } from "@/lib/nudges";
import { requireVenue, type Venue } from "@/lib/tenant";

const SUGGESTIONS_PATH = "/dashboard/stock/suggestions";

async function requireVenueForAction(): Promise<Venue> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }
  return requireVenue();
}

// A dismiss target is a suggestion's stable dedupe key ("kind:subjectId").
const dismissSchema = z.object({
  dedupeKey: z.string().trim().min(1).max(120),
});

export async function dismissSuggestion(formData: FormData): Promise<void> {
  const venue = await requireVenueForAction();
  const parsed = dismissSchema.safeParse({
    dedupeKey: formData.get("dedupeKey") ?? "",
  });
  if (parsed.success) {
    await dismissNudge(venue.id, parsed.data.dedupeKey);
  }
  revalidatePath(SUGGESTIONS_PATH);
  redirect(SUGGESTIONS_PATH);
}
