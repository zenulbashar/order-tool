import { Button } from "@/app/_components/button";
import { Card } from "@/app/_components/card";
import { PageHeader } from "@/app/_components/page-header";
import { requireUser, requireVenue } from "@/lib/tenant";

import { connectStripe, refreshStripeStatus } from "./actions";
import {
  getPayToCapabilityStatus,
  type PayToCapability,
  syncStripeAccountStatus,
} from "./queries";
import { PayToToggle } from "./payto-toggle";

// Authed + reads live Stripe status on return from onboarding; never prerendered.
export const dynamic = "force-dynamic";

type PaymentsParams = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

type BadgeTone = "gray" | "amber" | "green";

function StatusBadge({ tone, label }: { tone: BadgeTone; label: string }) {
  const classes: Record<BadgeTone, string> = {
    gray: "bg-sand text-muted",
    amber: "bg-[var(--color-accent)]/15 text-accent-deep",
    green: "bg-[var(--color-success)]/15 text-success-deep",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider ${classes[tone]}`}
    >
      {label}
    </span>
  );
}

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

  // PayTo capability status (owner-only page, low traffic) — read live only
  // when the owner has opted in and can actually charge, so non-PayTo venues
  // pay nothing. Drives the honest "active / pending verification" copy.
  let paytoCapability: PayToCapability = "unavailable";
  if (venue.paytoEnabled && venue.stripeAccountId && chargesEnabled) {
    paytoCapability = await getPayToCapabilityStatus(venue.stripeAccountId);
  }

  return (
    <main className="mx-auto max-w-3xl">
      <PageHeader title="Payments" description={venue.name} />

      <section className="px-5 py-8">
        <Card>
          {!connected ? (
            <div className="space-y-3">
              <StatusBadge tone="gray" label="Not connected" />
              <p className="text-sm text-muted">
                Connect a Stripe account to accept online payments. Customers pay
                your venue directly and payouts go to your Stripe account; the
                platform takes a small per-order fee.
              </p>
              <form action={connectStripe}>
                <Button type="submit" variant="primary">
                  Connect Stripe
                </Button>
              </form>
            </div>
          ) : chargesEnabled ? (
            <div className="space-y-3">
              <StatusBadge tone="green" label="Accepting payments" />
              <p className="text-sm text-muted">
                Your Stripe account is connected and able to accept payments.
                Orders on your storefront can now be paid online.
              </p>
              <form action={refreshStripeStatus}>
                <Button type="submit" variant="secondary">
                  Refresh status
                </Button>
              </form>
            </div>
          ) : (
            <div className="space-y-3">
              <StatusBadge
                tone="amber"
                label={detailsSubmitted ? "Under review" : "Onboarding incomplete"}
              />
              <p className="rounded-control border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 px-3 py-2 text-sm text-ink">
                {detailsSubmitted
                  ? "Stripe is verifying your details. You'll be able to accept payments once your account is approved."
                  : "Finish Stripe onboarding to start accepting payments."}
              </p>
              <div className="flex flex-wrap gap-2">
                <form action={connectStripe}>
                  <Button type="submit" variant="primary">
                    {detailsSubmitted ? "Update details" : "Continue onboarding"}
                  </Button>
                </form>
                <form action={refreshStripeStatus}>
                  <Button type="submit" variant="secondary">
                    Refresh status
                  </Button>
                </form>
              </div>
            </div>
          )}
        </Card>

        {/* Pay by bank (PayTo) — only relevant once the venue can charge.
            Turning it on requests the capability; PayTo then appears at
            checkout automatically. Australia-only; opt-in, default off. */}
        {connected && chargesEnabled ? (
          <Card className="mt-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-base font-semibold tracking-tight text-ink">
                    Pay by bank (PayTo)
                  </h2>
                  {venue.paytoEnabled ? (
                    paytoCapability === "active" ? (
                      <StatusBadge tone="green" label="Active" />
                    ) : paytoCapability === "pending" ? (
                      <StatusBadge tone="amber" label="Pending verification" />
                    ) : (
                      <StatusBadge tone="amber" label="Awaiting Stripe" />
                    )
                  ) : (
                    <StatusBadge tone="gray" label="Off" />
                  )}
                </div>
                <p className="mt-1.5 text-sm text-muted">
                  Let customers pay straight from their bank account via PayTo —
                  they approve once in their banking app, no card needed.
                  Australia only. Payments still settle through your Stripe
                  account.
                </p>
                {venue.paytoEnabled && paytoCapability !== "active" ? (
                  <p className="mt-2 rounded-control border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 px-3 py-2 text-xs text-ink">
                    You&apos;ve turned PayTo on. Stripe is still verifying it for
                    your account — customers will see &ldquo;Pay by bank&rdquo;
                    at checkout once it&apos;s active.
                  </p>
                ) : null}
              </div>
              <PayToToggle enabled={venue.paytoEnabled} />
            </div>
          </Card>
        ) : null}

        {connectError ? (
          <p className="mt-4 text-sm text-[var(--color-warm)]" role="alert">
            We couldn&apos;t start Stripe onboarding. Please try again.
          </p>
        ) : null}

        <p className="mt-4 text-xs text-muted">
          Test mode — no real charges are made. Payments use Stripe Connect; your
          venue is charged customers directly on its own connected account.
        </p>
      </section>
    </main>
  );
}
