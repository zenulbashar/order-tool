import { requireUser, requireVenue } from "@/lib/tenant";

import { WizardProgress } from "../_components/wizard-progress";
import { ServiceForm } from "./service-form";

// Reads the current venue's saved flags so a resumed wizard pre-checks them.
export const dynamic = "force-dynamic";

export default async function ServiceStepPage() {
  await requireUser();
  // No venue -> requireVenue redirects to /onboarding, which routes to Step 1.
  const venue = await requireVenue();

  return (
    <div className="space-y-6">
      <WizardProgress current={2} />
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
          How do customers order?
        </h1>
        <p className="text-sm text-muted">
          Pick the ways you serve. You can change these any time.
        </p>
      </div>
      <ServiceForm
        defaults={{
          offersDineIn: venue.offersDineIn,
          offersTakeaway: venue.offersTakeaway,
          offersDelivery: venue.offersDelivery,
        }}
      />
    </div>
  );
}
