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
    <div className="min-h-dvh bg-surface px-6 py-10">
      <div className="mx-auto w-full max-w-md">
        <header className="mb-6 text-center">
          <span className="font-display text-xl font-semibold tracking-tight text-brand">
            Prompt2Eat
          </span>
        </header>
        <div className="rounded-2xl border border-sand bg-surface-elevated p-6 shadow-sm">
          {children}
        </div>
      </div>
    </div>
  );
}
