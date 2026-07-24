import type { Metadata } from "next";

import { Wordmark } from "@/app/_components/wordmark";
import { requireUser } from "@/lib/tenant";

// noindex belt-and-braces alongside robots.txt (see dashboard/layout.tsx).
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Onboarding wizard shell (Phase 3a). The persistent chrome shared by every
 * step: the Prompt2Eat wordmark header and the warm centered card the step
 * content sits in. The per-step "Step N of 5" progress lives in each page (it
 * varies by step) via WizardProgress. Steps 3-5 slot into this same layout in
 * later sub-phases. Semantic design tokens only — no raw hex.
 */
export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Every onboarding surface is owner-only; the steps re-check too.
  await requireUser();

  return (
    <div className="min-h-dvh bg-surface px-5 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-md">
        <header className="mb-6 flex items-center justify-center">
          <Wordmark glow className="text-xl text-forest" />
        </header>
        <div className="rounded-card border border-line bg-surface-elevated p-5 shadow-card sm:p-6">
          {children}
        </div>
      </div>
    </div>
  );
}
