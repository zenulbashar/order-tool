import { ImportClient } from "@/app/dashboard/menu/import/import-client";
import { requireUser, requireVenue } from "@/lib/tenant";

import { WizardProgress } from "../_components/wizard-progress";
import { completeMenuStep } from "./actions";

// Operates on the created venue; reads nothing prerenderable.
export const dynamic = "force-dynamic";

export default async function MenuStepPage() {
  await requireUser();
  // No venue -> requireVenue redirects to /onboarding, which routes to Step 1.
  await requireVenue();

  return (
    <div className="space-y-6">
      <WizardProgress current={3} />
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
          Import your menu from a photo
        </h1>
        <p className="text-sm text-muted">
          Snap or upload a photo of your menu and we will read it into your
          storefront. You can review and tweak everything before it goes live.
        </p>
      </div>

      {/* Reuses the dashboard import flow as-is (extract -> review -> publish);
          onPublished advances the wizard instead of routing to the editor. */}
      <ImportClient onPublished={completeMenuStep} />

      <form action={completeMenuStep} className="border-t border-sand pt-4">
        <button
          type="submit"
          className="text-sm font-medium text-muted underline transition hover:text-ink"
        >
          I will add my menu later
        </button>
      </form>
    </div>
  );
}
