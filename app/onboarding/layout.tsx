import { requireUser } from "@/lib/tenant";

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
        <header className="mb-6 flex items-center justify-center gap-2">
          <span aria-hidden="true" className="text-lg text-[var(--color-accent)]">
            ✦
          </span>
          <span className="font-display text-xl font-extrabold tracking-tight text-forest">
            Prompt2Eat
          </span>
        </header>
        <div className="rounded-card border border-line bg-surface-elevated p-5 shadow-card sm:p-6">
          {children}
        </div>
      </div>
    </div>
  );
}
