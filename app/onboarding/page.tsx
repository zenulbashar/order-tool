import Link from "next/link";

import { getUserVenues, requireUser } from "@/lib/tenant";
import { getBaseUrl } from "@/lib/url";

import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage() {
  await requireUser();

  // An owner can run many venues, so we never bounce away from here. The form
  // is the entry point both for a brand-new owner and for adding another
  // location; only the copy changes between those two cases.
  const hasVenues = (await getUserVenues()).length > 0;

  // Host for the form's live storefront-link preview (e.g. order.zaleit.com.au
  // in prod, localhost:3000 in dev). Reuses the canonical base-URL helper so the
  // domain is never hardcoded.
  const baseHost = new URL(await getBaseUrl()).host;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
      <div className="space-y-6">
        {hasVenues ? (
          <Link
            href="/dashboard"
            className="text-xs text-gray-500 hover:text-gray-900"
          >
            ← Back to dashboard
          </Link>
        ) : null}
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {hasVenues ? "Add another location" : "Create your venue"}
          </h1>
          <p className="text-sm text-gray-600">
            {hasVenues
              ? "Set up another venue. It gets its own storefront, menu, orders, and payments — switch between locations any time."
              : "Set up your venue to get started. You can refine the details later."}
          </p>
        </div>
        <OnboardingForm baseHost={baseHost} />
      </div>
    </main>
  );
}
