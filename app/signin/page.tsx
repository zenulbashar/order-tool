import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { BrandMark, Wordmark } from "@/app/_components/wordmark";
import { auth } from "@/lib/auth";

import { SignInForm } from "./signin-form";

// noindex belt-and-braces alongside robots.txt (see dashboard/layout.tsx).
export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

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
        over --color-forest-deep) so no raw hex appears anywhere.
      */}
      <aside className="relative hidden overflow-hidden bg-forest-deep px-12 py-14 lg:flex lg:flex-col lg:justify-between [background:radial-gradient(60%_50%_at_25%_30%,_color-mix(in_oklab,_var(--color-accent)_28%,_transparent),_transparent_70%),_var(--color-forest-deep)]">
        <div className="flex items-center gap-2 text-surface">
          <BrandMark className="h-7 w-7 shrink-0" />
          <Wordmark className="text-lg" />
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
          <span className="rounded-full border border-sand/20 bg-forest px-3 py-1 font-mono text-xs uppercase tracking-wide text-sand">
            AI-native ordering
          </span>
          <span className="rounded-full border border-sand/20 bg-forest px-3 py-1 font-mono text-xs uppercase tracking-wide text-sand">
            Live in minutes
          </span>
        </div>
      </aside>

      {/* Form panel — phone-first, the priority surface. */}
      <section className="flex min-h-dvh flex-col bg-surface">
        {/* Compact brand header — mobile only, since the brand panel is hidden. */}
        <div className="flex items-center gap-2 bg-forest-deep px-6 py-4 text-surface lg:hidden">
          <BrandMark className="h-6 w-6 shrink-0" />
          <Wordmark className="text-base" />
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
