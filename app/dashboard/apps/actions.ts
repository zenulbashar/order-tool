"use server";

import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import {
  getRosterSSOUrl,
  mintRosterHandoffToken,
} from "@/lib/sso/roster";
import { requireVenue } from "@/lib/tenant";

export type RosterHandoff = { token: string; url: string };

/**
 * Mint a one-time Roster SSO handoff for the current owner + venue. Auth is
 * re-checked (Server Functions are POST-able); the email comes from the
 * Auth.js magic-link session, so it is VERIFIED. The token is returned to the
 * caller, which POSTs it to Roster as a form field (never a query string) so
 * it never enters a URL or log. If the SSO key isn't configured, the mint
 * throws and the launcher surfaces a calm error — no partial handoff.
 */
export async function createRosterHandoff(): Promise<RosterHandoff> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }
  const email = session.user.email;
  if (!email) {
    // Owner auth is email magic-link, so this is effectively unreachable; guard
    // anyway rather than mint a token with no subject.
    throw new Error("No verified email on the current session.");
  }
  const venue = await requireVenue();

  const token = mintRosterHandoffToken({
    email,
    name: session.user.name ?? venue.name,
    venue: { id: venue.id, slug: venue.slug, name: venue.name },
    rosterEntitled: venue.rosterEntitled,
  });

  return { token, url: getRosterSSOUrl() };
}
