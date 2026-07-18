import { requireUser, requireVenue } from "@/lib/tenant";

import { WizardProgress } from "../_components/wizard-progress";
import { advanceToLiveStep } from "./actions";
import { PlanPicker } from "./plan-picker";

// Reflects live plan/return state from Stripe; never prerendered.
export const dynamic = "force-dynamic";

type PlanParams = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function PlanStepPage({ searchParams }: PlanParams) {
  await requireUser();
  // No venue -> requireVenue redirects to /onboarding, which routes to Step 1.
  await requireVenue();
  const sp = await searchParams;
  const success = sp.checkout === "success";
  const canceled = sp.checkout === "cancel";

  return (
    <div className="space-y-6">
      <WizardProgress current={5} />

      {success ? (
        // Webhook-lag-safe: the subscription + trial are set up the moment
        // Checkout completes, so we continue without waiting on the webhook to
        // confirm the plan (it syncs shortly via the billing webhook).
        <div className="space-y-5">
          <div className="space-y-1">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
              Your free trial is set up
            </h1>
            <p className="text-sm text-muted">
              You have full access for 30 days. We will email you before it ends.
            </p>
          </div>
          <form action={advanceToLiveStep}>
            <button
              type="submit"
              className="w-full rounded-md bg-forest px-4 py-2 text-sm font-medium text-surface-elevated transition hover:bg-forest-deep"
            >
              Continue
            </button>
          </form>
        </div>
      ) : (
        <>
          <div className="space-y-1">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
              Choose your plan
            </h1>
            <p className="text-sm text-muted">
              Start with a free trial. You will not be charged today.
            </p>
          </div>

          {canceled ? (
            <p className="text-sm text-muted" role="status">
              No problem, nothing was charged. Pick a plan when you are ready.
            </p>
          ) : null}

          <PlanPicker />

          <form action={advanceToLiveStep} className="border-t border-sand pt-4">
            <button
              type="submit"
              className="text-sm font-medium text-muted underline transition hover:text-ink"
            >
              I will decide later
            </button>
          </form>
        </>
      )}
    </div>
  );
}
