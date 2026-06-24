import Link from "next/link";

import { requireUser, requireVenue } from "@/lib/tenant";

import { connectStripe, refreshStripeStatus } from "./actions";
import { syncStripeAccountStatus } from "./queries";

// Authed + reads live Stripe status on return from onboarding; never prerendered.
export const dynamic = "force-dynamic";

type PaymentsParams = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

type BadgeTone = "gray" | "amber" | "green";

function StatusBadge({ tone, label }: { tone: BadgeTone; label: string }) {
  const classes: Record<BadgeTone, string> = {
    gray: "bg-gray-100 text-gray-600",
    amber: "bg-amber-100 text-amber-800",
    green: "bg-green-100 text-green-800",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${classes[tone]}`}
    >
      {label}
    </span>
  );
}

const primaryButton =
  "rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800";
const secondaryButton =
  "rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50";

export default async function PaymentsPage({ searchParams }: PaymentsParams) {
  await requireUser();
  const venue = await requireVenue();
  const sp = await searchParams;

  // On return from Stripe-hosted onboarding, refresh the live account status
  // before rendering. The page is dynamic, so we render from the fresh values.
  let chargesEnabled = venue.stripeChargesEnabled;
  let detailsSubmitted = venue.stripeOnboardedAt !== null;
  const justReturned =
    sp.onboarding === "return" || sp.onboarding === "refresh";
  if (venue.stripeAccountId && justReturned) {
    try {
      const status = await syncStripeAccountStatus(
        venue.id,
        venue.stripeAccountId,
      );
      chargesEnabled = status.chargesEnabled;
      detailsSubmitted = status.detailsSubmitted;
    } catch {
      // Stripe unreachable — fall back to the stored status; the Refresh button
      // lets the owner retry.
    }
  }

  const connected = venue.stripeAccountId !== null;
  const connectError = sp.error === "connect";

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="border-b border-gray-200 pb-6">
        <Link
          href="/dashboard"
          className="text-xs text-gray-500 hover:text-gray-900"
        >
          ← Back to dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Payments</h1>
        <p className="text-sm text-gray-500">{venue.name}</p>
      </header>

      <section className="py-8">
        <div className="rounded-lg border border-gray-200 p-5">
          {!connected ? (
            <div className="space-y-3">
              <StatusBadge tone="gray" label="Not connected" />
              <p className="text-sm text-gray-600">
                Connect a Stripe account to accept online payments. Customers pay
                your venue directly and payouts go to your Stripe account; the
                platform takes a small per-order fee.
              </p>
              <form action={connectStripe}>
                <button type="submit" className={primaryButton}>
                  Connect Stripe
                </button>
              </form>
            </div>
          ) : chargesEnabled ? (
            <div className="space-y-3">
              <StatusBadge tone="green" label="Accepting payments" />
              <p className="text-sm text-gray-600">
                Your Stripe account is connected and able to accept payments.
                Orders on your storefront can now be paid online.
              </p>
              <form action={refreshStripeStatus}>
                <button type="submit" className={secondaryButton}>
                  Refresh status
                </button>
              </form>
            </div>
          ) : (
            <div className="space-y-3">
              <StatusBadge
                tone="amber"
                label={detailsSubmitted ? "Under review" : "Onboarding incomplete"}
              />
              <p className="text-sm text-gray-600">
                {detailsSubmitted
                  ? "Stripe is verifying your details. You'll be able to accept payments once your account is approved."
                  : "Finish Stripe onboarding to start accepting payments."}
              </p>
              <div className="flex flex-wrap gap-2">
                <form action={connectStripe}>
                  <button type="submit" className={primaryButton}>
                    {detailsSubmitted ? "Update details" : "Continue onboarding"}
                  </button>
                </form>
                <form action={refreshStripeStatus}>
                  <button type="submit" className={secondaryButton}>
                    Refresh status
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>

        {connectError ? (
          <p className="mt-4 text-sm text-red-600" role="alert">
            We couldn&apos;t start Stripe onboarding. Please try again.
          </p>
        ) : null}

        <p className="mt-4 text-xs text-gray-500">
          Test mode — no real charges are made. Payments use Stripe Connect; your
          venue is charged customers directly on its own connected account.
        </p>
      </section>
    </main>
  );
}
