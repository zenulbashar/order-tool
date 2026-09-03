import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { acceptInvitation } from "@/lib/staff/invitations";
import { setSelectedVenueCookie } from "@/lib/tenant";

/**
 * Staff invitation acceptance (M5 / audit F4).
 *
 * A GET that mutates is normally wrong, but an emailed invite link IS the
 * user's intent — there is no earlier page to put a button on, and the token
 * is single-use, expiring, and bound to the recipient's email, so a
 * prefetch-or-replay can grant nothing extra. An unauthenticated visitor is
 * sent to sign in and returned here afterwards.
 *
 * WHY A ROUTE HANDLER AND NOT A PAGE: on success the accepted venue is
 * selected by writing the selected-venue cookie, and Next does not allow
 * cookies to be set while a Server Component renders — only in a Server
 * Function or a Route Handler. As a page this threw AFTER the membership and
 * accepted_at had committed, so every successful acceptance ended on an error
 * screen and a reload reported the (now used) invitation as invalid. The
 * outcome screen lives at /invite/invalid; a Route Handler can only redirect.
 *
 * Every failure lands on the SAME message: distinguishing "expired" from
 * "wrong account" would let someone probe which tokens exist.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<never> {
  const { token } = await params;
  const session = await auth();

  if (!session?.user?.id) {
    redirect(`/signin?callbackUrl=${encodeURIComponent(`/invite/${token}`)}`);
  }

  const result = await acceptInvitation({
    token,
    userId: session.user.id,
    userEmail: session.user.email,
  });

  if (result.ok) {
    // Land them in the venue they just joined rather than their oldest one.
    await setSelectedVenueCookie(result.venueId);
    redirect("/dashboard?joined=1");
  }

  redirect("/invite/invalid");
}
