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
 * Every failure renders the SAME message: distinguishing "expired" from
 * "wrong account" would let someone probe which tokens exist.
 */
export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
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

  return (
    <main
      id="main-content"
      className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center gap-4 px-5 py-16"
    >
      <h1 className="font-display text-2xl font-bold text-ink">
        This invitation is no longer valid
      </h1>
      <p className="text-base text-muted">
        It may have expired, already been used, been withdrawn, or been sent to
        a different email address than the one you&rsquo;re signed in with.
        {session.user.email ? (
          <>
            {" "}
            You&rsquo;re signed in as{" "}
            <span className="font-semibold text-ink">{session.user.email}</span>.
          </>
        ) : null}
      </p>
      <p className="text-base text-muted">
        Ask whoever invited you to send a new invitation.
      </p>
    </main>
  );
}
