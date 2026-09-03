import { auth } from "@/lib/auth";

/**
 * The single outcome screen for a staff invitation that could not be accepted
 * (see app/invite/[token]/route.ts). One message for every cause, on purpose:
 * distinguishing "expired" from "wrong account" would let someone probe which
 * tokens exist.
 */
export default async function InvalidInvitePage() {
  const session = await auth();
  const email = session?.user?.email ?? null;

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
        {email ? (
          <>
            {" "}
            You&rsquo;re signed in as{" "}
            <span className="font-semibold text-ink">{email}</span>.
          </>
        ) : null}
      </p>
      <p className="text-base text-muted">
        Ask whoever invited you to send a new invitation.
      </p>
    </main>
  );
}
