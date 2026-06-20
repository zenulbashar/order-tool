import { redirect } from "next/navigation";

import { getCurrentVenue, requireUser } from "@/lib/tenant";

import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage() {
  await requireUser();
  const venue = await getCurrentVenue();
  if (venue) {
    redirect("/dashboard");
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Create your venue</h1>
          <p className="text-sm text-gray-600">
            Set up your venue to get started. You can refine the details later.
          </p>
        </div>
        <OnboardingForm />
      </div>
    </main>
  );
}
