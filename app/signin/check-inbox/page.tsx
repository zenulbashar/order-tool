import Link from "next/link";

/**
 * Magic-link confirmation, registered as Auth.js's `verifyRequest` page
 * (see lib/auth.ts). Purely presentational: Auth.js redirects here AFTER the
 * email is sent, so there is no auth call, no data, and no resend wiring on
 * this page. The address is intentionally NOT echoed — the verify-request page
 * does not reliably receive it, and we will not alter the flow to pass it.
 */
export default function CheckInboxPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-forest-deep px-6 py-12 [background:radial-gradient(60%_50%_at_50%_30%,_color-mix(in_oklab,_var(--color-accent)_22%,_transparent),_transparent_70%),_var(--color-forest-deep)]">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-sand/15 bg-forest px-8 py-10 text-center">
        <div className="flex items-center justify-center gap-2 text-surface">
          <span aria-hidden className="inline-block h-7 w-7 rounded-lg bg-accent" />
          <span className="font-display text-lg font-semibold tracking-tight">
            Prompt2Eat
          </span>
        </div>

        <div className="space-y-2">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-surface">
            Check your inbox
          </h1>
          <p className="text-sm leading-relaxed text-sand">
            We&apos;ve sent a one-tap magic link to your email. It expires
            shortly and can be used once.
          </p>
        </div>

        <a
          href="mailto:"
          className="block w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-ink transition hover:bg-surface"
        >
          Open email app
        </a>

        <p className="text-sm text-sand">
          Didn&apos;t get it?{" "}
          <Link href="/signin" className="font-medium text-accent underline">
            Try again
          </Link>
        </p>
      </div>
    </main>
  );
}
