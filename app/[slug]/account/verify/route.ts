import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";

import {
  consumeLoginToken,
  createCustomerSession,
  upsertCustomerByEmail,
} from "@/lib/customer/auth";
import { db } from "@/lib/db";
import { venues } from "@/lib/db/schema";
import { isReservedSlug } from "@/lib/validation";

// Stripe-style hostile-surface handling: this consumes a single-use token and
// sets the customer session cookie, which is only legal in a Route Handler (Next
// 16 forbids cookie writes during RSC render). Node runtime for the Neon pool.
export const runtime = "nodejs";

/**
 * Magic-link callback. Consumes the token (single-use, by hash), verifies it was
 * minted for THIS venue, then upserts the customer and creates a venue-bound
 * session (sets the ot_customer_session cookie) and redirects to the account.
 * An invalid/expired/foreign-venue token bounces back to the sign-in form.
 *
 * All redirect() calls sit OUTSIDE try/catch (redirect throws a framework
 * control-flow error that must not be swallowed).
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await ctx.params;
  if (isReservedSlug(slug)) notFound();

  const [venue] = await db
    .select({ id: venues.id })
    .from(venues)
    .where(eq(venues.slug, slug.trim().toLowerCase()))
    .limit(1);
  if (!venue) notFound();

  const token = new URL(request.url).searchParams.get("token") ?? "";

  let consumed: { venueId: string; email: string } | null = null;
  try {
    consumed = await consumeLoginToken(token);
  } catch {
    consumed = null;
  }
  // Token must exist AND have been minted for THIS venue (defense in depth).
  if (!consumed || consumed.venueId !== venue.id) {
    redirect(`/${slug}/account?error=link`);
  }

  let customerId: string | null = null;
  try {
    const customer = await upsertCustomerByEmail(venue.id, consumed.email);
    customerId = customer.id;
  } catch {
    customerId = null;
  }
  if (!customerId) {
    redirect(`/${slug}/account?error=link`);
  }

  // Sets the httpOnly session cookie. Left outside try/catch so a rare failure
  // surfaces as a 500 rather than a silently signed-out redirect.
  await createCustomerSession(customerId, venue.id);

  redirect(`/${slug}/account`);
}
