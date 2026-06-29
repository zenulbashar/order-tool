import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

import { SignInForm } from "./signin-form";

export default async function SignInPage() {
  const session = await auth();
  if (session?.user) {
    redirect("/");
  }

  return (
    <main className="min-h-dvh lg:grid lg:grid-cols-2">
      {/*
        Brand / atmosphere panel. Desktop-only (the form is the phone-first
        priority); a compact header carries the identity on mobile. The amber
        glow is a radial-gradient built from the design tokens (--color-accent
        over --color-brand-deep) so no raw hex appears anywhere.
      */}
      <aside className="relative hidden overflow-hidden bg-brand-deep px-12 py-14 lg:flex lg:flex-col lg:justify-between [background:radial-gradient(60%_50%_at_25%_30%,_color-mix(in_oklab,_var(--color-accent)_28%,_transparent),_transparent_70%),_var(--color-brand-deep)]">
        <div className="flex items-center gap-2 text-surface">
          <span
            aria-hidden
            className="inline-block h-7 w-7 rounded-lg bg-accent"
          />
          <span className="font-display text-lg font-semibold tracking-tight">
            Prompt2Eat
          </span>
        </div>

        <div className="max-w-md space-y-5">
          <h2 className="font-display text-4xl font-semibold leading-tight tracking-tight text-surface xl:text-5xl">
            Order at the speed of craving.
          </h2>
          <p className="text-base leading-relaxed text-sand">
            The AI-native ordering platform for cafes and restaurants. Import
            your menu from a photo, go live in minutes.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <span className="rounded-full border border-sand/20 bg-brand px-3 py-1 font-mono text-xs uppercase tracking-wide text-sand">
            AI-native ordering
          </span>
          <span className="rounded-full border border-sand/20 bg-brand px-3 py-1 font-mono text-xs uppercase tracking-wide text-sand">
            Live in minutes
          </span>
        </div>
      </aside>

      {/* Form panel — phone-first, the priority surface. */}
      <section className="flex min-h-dvh flex-col bg-surface">
        {/* Compact brand header — mobile only, since the brand panel is hidden. */}
        <div className="flex items-center gap-2 bg-brand-deep px-6 py-4 text-surface lg:hidden">
          <span
            aria-hidden
            className="inline-block h-6 w-6 rounded-md bg-accent"
          />
          <span className="font-display text-base font-semibold tracking-tight">
            Prompt2Eat
          </span>
        </div>

        <div className="flex flex-1 flex-col justify-center px-6 py-12">
          <div className="mx-auto w-full max-w-md space-y-6">
            <div className="space-y-2">
              <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">
                Welcome back
              </h1>
              <p className="text-sm text-muted">
                Sign in to your Prompt2Eat dashboard.
              </p>
            </div>

            <SignInForm />

            <p className="text-sm text-muted">
              No passwords, ever. We email you a secure one-tap link.
            </p>

            <p className="border-t border-sand pt-6 text-sm text-muted">
              New to Prompt2Eat? Enter your email above to get started.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
