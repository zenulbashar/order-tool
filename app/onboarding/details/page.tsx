import { getBaseUrl } from "@/lib/url";

import { WizardProgress } from "../_components/wizard-progress";
import { DetailsForm } from "./details-form";

// Step 1 has no venue yet (it creates one), so it only needs the signed-in user
// (enforced by the onboarding layout). Dynamic for the live base-URL preview.
export const dynamic = "force-dynamic";

export default async function DetailsStepPage() {
  // Host for the storefront-link preview (prompt2eat.com in prod, localhost in
  // dev) — reuses the canonical base-URL helper, never hardcoded.
  const baseHost = new URL(await getBaseUrl()).host;

  return (
    <div className="space-y-6">
      <WizardProgress current={1} />
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
          Tell us about your venue
        </h1>
        <p className="text-sm text-muted">
          The basics for your storefront. You can refine any of this later in
          settings.
        </p>
      </div>
      <DetailsForm baseHost={baseHost} />
    </div>
  );
}
