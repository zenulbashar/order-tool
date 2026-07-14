import { Button } from "@/app/_components/button";
import { Card } from "@/app/_components/card";
import { PageHeader } from "@/app/_components/page-header";
import { requireUser, requireVenue } from "@/lib/tenant";
import { formatCents } from "@/lib/validation";

import { connectStripe, refreshStripeStatus } from "./actions";
import {
  getConfirmedSalesSummary,
  getPayToCapabilityStatus,
  getPayoutSummary,
  type PayoutSummary,
  type PayToCapability,
  syncStripeAccountStatus,
} from "./queries";
import { LoyaltyForm } from "./loyalty-form";
import { PaytoDiscountForm } from "./payto-discount-form";
import { PayToToggle } from "./payto-toggle";

/** Payout status → badge tone + label (Stripe payout lifecycle). */
const PAYOUT_TONE: Partial<Record<string, { tone: BadgeTone; label: string }>> = {
  paid: { tone: "green", label: "Paid" },
  in_transit: { tone: "amber", label: "On the way" },
  pending: { tone: "amber", label: "Pending" },
  canceled: { tone: "gray", label: "Canceled" },
  failed: { tone: "gray", label: "Failed" },
};

/** Unix seconds → a short en-AU date (payout arrival / created). */
function fmtDay(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  });
}

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

  // Balance & payouts KPIs — only meaningful once the venue can actually charge.
  let payouts: PayoutSummary | null = null;
  let sales = { last30Cents: 0, count30: 0 };
  if (chargesEnabled && venue.stripeAccountId) {
    [payouts, sales] = await Promise.all([
      getPayoutSummary(venue.stripeAccountId),
      getConfirmedSalesSummary(venue.id),
    ]);
  }

  return (
    <main className="mx-auto max-w-3xl">
      <PageHeader title="Payments" description={venue.name} />

      <section className="px-5 py-8">
        <Card>
          <div className="mb-3 flex items-center gap-3 border-b border-line pb-3">
            <span
              aria-hidden="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#635bff] text-sm font-bold text-white"
            >
              S
            </span>
            <h2 className="font-display text-base font-semibold tracking-tight text-ink">
              Stripe Connect
            </h2>
          </div>
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

        {/* Balance & payouts — read live from the connected account, plus 30-day
            sales from our own confirmed orders. Shown once the venue can charge. */}
        {chargesEnabled && venue.stripeAccountId ? (
          <Card className="mt-4">
            <div className="mb-3 flex items-center gap-3 border-b border-line pb-3">
              <span
                aria-hidden="true"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-forest text-base text-[var(--color-accent)]"
              >
                $
              </span>
              <h2 className="font-display text-base font-semibold tracking-tight text-ink">
                Balance &amp; payouts
              </h2>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-label">
                  Available
                </p>
                <p className="mt-1 font-display text-lg font-extrabold text-ink">
                  {payouts ? `$${formatCents(payouts.availableCents)}` : "—"}
                </p>
                <p className="text-[10px] text-muted">ready to pay out</p>
              </div>
              <div>
                <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-label">
                  On the way
                </p>
                <p className="mt-1 font-display text-lg font-extrabold text-ink">
                  {payouts ? `$${formatCents(payouts.pendingCents)}` : "—"}
                </p>
                <p className="text-[10px] text-muted">pending in Stripe</p>
              </div>
              <div>
                <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-label">
                  Sales · 30d
                </p>
                <p className="mt-1 font-display text-lg font-extrabold text-ink">
                  ${formatCents(sales.last30Cents)}
                </p>
                <p className="text-[10px] text-muted">
                  {sales.count30} order{sales.count30 === 1 ? "" : "s"}
                </p>
              </div>
            </div>

            {payouts === null ? (
              <p className="mt-3 rounded-control border border-line px-3 py-2 text-xs text-muted">
                Couldn&apos;t load your balance from Stripe just now — try Refresh
                status above.
              </p>
            ) : payouts.payouts.length === 0 ? (
              <p className="mt-3 text-xs text-muted">
                No payouts yet — Stripe sends your takings to your bank on its
                payout schedule, and they&apos;ll appear here.
              </p>
            ) : (
              <div className="mt-3 border-t border-line pt-3">
                <p className="mb-2 font-mono text-[9px] font-bold uppercase tracking-wider text-label">
                  Recent payouts
                </p>
                <ul className="space-y-1.5">
                  {payouts.payouts.map((p) => {
                    const meta = PAYOUT_TONE[p.status];
                    return (
                      <li
                        key={p.id}
                        className="flex items-center justify-between gap-3 text-sm"
                      >
                        <span className="flex items-center gap-2">
                          <StatusBadge
                            tone={meta?.tone ?? "gray"}
                            label={meta?.label ?? p.status.replace(/_/g, " ")}
                          />
                          <span className="font-mono text-[11px] text-muted">
                            {fmtDay(p.arrivalDate ?? p.created)}
                          </span>
                        </span>
                        <span className="font-display text-[13px] font-extrabold text-ink">
                          ${formatCents(p.amountCents)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <p className="mt-3 text-[11px] text-muted">
              Balance and payouts are read live from your Stripe account; sales
              are the orders confirmed on your storefront.
            </p>
          </Card>
        ) : null}

        {/* Pay by bank (PayTo) — only relevant once the venue can charge.
            Turning it on requests the capability; PayTo then appears at
            checkout automatically. Australia-only; opt-in, default off. */}
        {connected && chargesEnabled ? (
          <Card className="mt-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 gap-3">
                <span
                  aria-hidden="true"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-forest text-base text-[var(--color-accent)]"
                >
                  ⇄
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-base font-semibold tracking-tight text-ink">
                      PayTo — pay by bank
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
                    Let diners approve a real-time bank-to-bank payment in their
                    banking app — no card needed. Lower fees than cards, and no
                    chargebacks. Australia only; payments still settle through
                    your Stripe account.
                  </p>
                  {venue.paytoEnabled && paytoCapability !== "active" ? (
                    <p className="mt-2 rounded-control border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 px-3 py-2 text-xs text-ink">
                      You&apos;ve turned PayTo on. Stripe is still verifying it
                      for your account — customers will see &ldquo;Pay by
                      bank&rdquo; at checkout once it&apos;s active.
                    </p>
                  ) : null}
                </div>
              </div>
              <PayToToggle enabled={venue.paytoEnabled} />
            </div>

            {/* Benefit row — the honest, non-fabricated PayTo properties. */}
            <div className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-3">
              {[
                { k: "Provider fee", v: "Lower than cards" },
                { k: "Approval", v: "In the bank app" },
                { k: "Chargebacks", v: "None" },
              ].map((s) => (
                <div key={s.k}>
                  <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-label">
                    {s.k}
                  </p>
                  <p className="mt-1 text-sm font-bold text-ink">{s.v}</p>
                </div>
              ))}
            </div>

            {/* Pay-by-bank saving — only meaningful once PayTo is on. */}
            {venue.paytoEnabled ? (
              <PaytoDiscountForm
                mode={venue.paytoDiscountMode}
                value={venue.paytoDiscountValue}
              />
            ) : null}
          </Card>
        ) : null}

        {/* Customer loyalty / points — earn on confirmed orders, redeem as a
            checkout discount. Only relevant once the venue can take orders. */}
        {connected && chargesEnabled ? (
          <Card className="mt-4">
            <div className="flex min-w-0 gap-3">
              <span
                aria-hidden="true"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-forest text-base text-[var(--color-accent)]"
              >
                ★
              </span>
              <div className="min-w-0">
                <h2 className="font-display text-base font-semibold tracking-tight text-ink">
                  Loyalty &amp; points
                </h2>
                <p className="mt-0.5 text-sm text-muted">
                  Reward repeat diners — they earn points as they order and
                  redeem them for a discount.
                </p>
              </div>
            </div>
            <LoyaltyForm
              enabled={venue.loyaltyEnabled}
              earnRatePerDollar={venue.loyaltyEarnRatePerDollar}
              redeemValueCents={venue.loyaltyRedeemValueCents}
              minRedeemPoints={venue.loyaltyMinRedeemPoints}
            />
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
