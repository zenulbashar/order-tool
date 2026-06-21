"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { venueMembers, venues } from "@/lib/db/schema";
import { isReservedSlug, slugSchema, venueNameSchema } from "@/lib/validation";

export type CreateVenueState = { error?: string };

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

export async function createVenue(
  _prevState: CreateVenueState,
  formData: FormData,
): Promise<CreateVenueState> {
  // Server Functions are reachable via direct POST — always re-check auth.
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }
  const userId = session.user.id;

  const nameResult = venueNameSchema.safeParse(formData.get("name"));
  if (!nameResult.success) {
    return { error: nameResult.error.issues[0]?.message ?? "Invalid venue name." };
  }
  const slugResult = slugSchema.safeParse(formData.get("slug"));
  if (!slugResult.success) {
    return { error: slugResult.error.issues[0]?.message ?? "Invalid address." };
  }
  const name = nameResult.data;
  const slug = slugResult.data;

  // The slug becomes a public top-level path (/{slug}); never let it collide
  // with an app route. Reserved slugs are also rejected by the public resolver.
  if (isReservedSlug(slug)) {
    return {
      error: `The address "${slug}" is reserved. Please choose another.`,
    };
  }

  // Phase 0: one venue per owner.
  const existingMembership = await db
    .select({ venueId: venueMembers.venueId })
    .from(venueMembers)
    .where(eq(venueMembers.userId, userId))
    .limit(1);
  if (existingMembership.length > 0) {
    redirect("/dashboard");
  }

  const slugTaken = await db
    .select({ id: venues.id })
    .from(venues)
    .where(eq(venues.slug, slug))
    .limit(1);
  if (slugTaken.length > 0) {
    return { error: `The address "${slug}" is already taken.` };
  }

  try {
    // Venue + owner membership must be created atomically.
    await db.transaction(async (tx) => {
      const [venue] = await tx
        .insert(venues)
        .values({ slug, name, ownerUserId: userId })
        .returning({ id: venues.id });
      await tx
        .insert(venueMembers)
        .values({ venueId: venue.id, userId, role: "owner" });
    });
  } catch (error) {
    // Backstop the slug pre-check against a race (unique index violation).
    if (isUniqueViolation(error)) {
      return { error: `The address "${slug}" is already taken.` };
    }
    throw error;
  }

  // Outside the try/catch: redirect throws a control-flow signal that must
  // not be swallowed.
  redirect("/dashboard");
}
