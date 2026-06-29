"use server";

import { redirect } from "next/navigation";

import { auth, signOut } from "@/lib/auth";
import { isVenueMember, setSelectedVenueCookie } from "@/lib/tenant";

/**
 * Switch the venue the owner is managing. Invoked from the venue switcher,
 * which binds the target venueId per row (setCurrentVenue.bind(null, id)).
 *
 * Server Functions are reachable via direct POST and the bound id is
 * client-controlled, so we re-validate BOTH here: the caller must be signed in
 * AND a member of the target venue. A non-member request is refused without
 * touching the cookie — never trust the venueId without the membership check.
 */
export async function setCurrentVenue(venueId: string): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }

  // IDOR gate: only honour a venue the user actually belongs to.
  if (!(await isVenueMember(session.user.id, venueId))) {
    return;
  }

  await setSelectedVenueCookie(venueId);

  // Land on the dashboard home so the switch is unambiguous; redirect() throws
  // a control-flow signal, so it stays outside any try/catch.
  redirect("/dashboard");
}

/**
 * Sign the owner out. A thin wrapper over Auth.js signOut so the client sidebar
 * footer can post to it without importing `@/lib/auth` (keeping the owner auth
 * out of the client bundle and the customer↔owner firewall intact).
 */
export async function signOutOwner(): Promise<void> {
  await signOut({ redirectTo: "/signin" });
}
