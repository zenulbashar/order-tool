import Link from "next/link";

import { Button } from "@/app/_components/button";
import { Card } from "@/app/_components/card";
import { PageHeader } from "@/app/_components/page-header";
import {
  type BillingOverview,
  getBillingOverview,
  getRosterAddonPriceCents,
} from "@/lib/billing/overview";
import { requireUser, requireVenue } from "@/lib/tenant";
import { formatCents } from "@/lib/validation";

import {
  addRosterAddon,
  createBillingPortalSession,
  removeRosterAddon,
} from "./actions";
import { PlanComparison } from "./plan-comparison";

// Authed + reads the live plan/status + subscription/invoices; never prerendered.
export const dynamic = "force-dynamic";

type BillingParams = {
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

const PLAN_LABELS: Record<string, string> = {
  trial: "Trial",
  pro: "Pro",
  scale: "Scale",
  free: "Free",
};

const STATUS_LABELS: Record<string, string> = {
  trialing: "Trialing",
  active: "Active",
  past_due: "Payment overdue",
  unpaid: "Unpaid",
  canceled: "Canceled",
  incomplete: "Incomplete",
  paused: "Paused",
};

function statusTone(planStatus: string): BadgeTone {
  if (planStatus === "trialing" || planStatus === "active") return "green";
  if (planStatus === "past_due" || planStatus === "incomplete") return "amber";
  return "gray";
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function daysLeft(date: Date): number {
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / 86_400_000));
}

/** The consolidated subscription card — line items, one total, next charge. */
function SubscriptionCard({ overview }: { overview: BillingOverview }) {
  const cadence = overview.interval === "annual" ? "yearly" : "monthly";
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface-elevated shadow-card">
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 className="font-display text-base font-extrabold tracking-tight text-ink">
            Your subscription
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            Billed {cadence} · one invoice for everything Zale
          </p>
        </div>
        {overview.nextChargeAt ? (
          <div className="text-right">
            <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-label">
              Next charge
            </p>
            <p className="mt-0.5 text-xs font-bold text-ink">
              {formatDate(overview.nextChargeAt)}
            </p>
          </div>
        ) : null}
      </div>

      <ul className="px-5">
        {overview.lines.map((line) => (
          <li
            key={line.key}
            className="flex items-center gap-3 border-b border-line/60 py-3 last:border-0"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-ink">{line.label}</span>
                {line.isRoster ? (
                  <span className="rounded-[5px] bg-sand px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wider text-muted">
                    Add-on · by Zale
                  </span>
                ) : null}
              </div>
              {line.description ? (
                <p className="text-[11px] text-muted">{line.description}</p>
              ) : null}
            </div>
            <div className="shrink-0 text-right">
              <p className="font-display text-sm font-extrabold text-ink">
                ${formatCents(line.amountCents)}
              </p>
              <p className="font-mono text-[9px] uppercase text-label">
                /{overview.interval === "annual" ? "yr" : "mo"}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-3 border-t border-line bg-hover-secondary px-5 py-4">
        <div className="flex-1">
          <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-label">
            One total · billed {cadence}
          </p>
          {overview.interval === "annual" ? (
            <p className="text-[11px] text-muted">
              ${formatCents(overview.totalCents)} charged annually
            </p>
          ) : null}
        </div>
        <div className="text-right">
          <span className="font-display text-2xl font-extrabold text-ink">
            ${formatCents(overview.perMonthCents)}
          </span>
          <span className="text-xs text-muted">/mo</span>
        </div>
      </div>
    </div>
  );
}

export default async function BillingPage({ searchParams }: BillingParams) {
  await requireUser();
  const venue = await requireVenue();
  const sp = await searchParams;

  const planLabel = PLAN_LABELS[venue.plan] ?? venue.plan;
  const statusLabel = STATUS_LABELS[venue.planStatus] ?? venue.planStatus;
  const hasCustomer = venue.stripeCustomerId !== null;
  const hasSubscription = venue.stripeSubscriptionId !== null;
  const isTrialing = venue.planStatus === "trialing";
  const checkoutCanceled = sp.checkout === "cancel";
  const errored =
    sp.error === "checkout" || sp.error === "portal" || sp.error === "roster";
  const rosterAdded = sp.roster === "added";
  const rosterRemoved = sp.roster === "removed";

  // Live subscription + invoices (best-effort; falls back to the minimal UI).
  let overview: BillingOverview | null = null;
  if (venue.stripeSubscriptionId && venue.stripeCustomerId) {
    try {
      overview = await getBillingOverview(
        venue.stripeSubscriptionId,
        venue.stripeCustomerId,
      );
    } catch {
      overview = null;
    }
  }

  // Roster add-on price for the CTA (null = not configured in Stripe yet).
  const rosterPriceCents =
    hasSubscription && overview && !overview.rosterPresent
      ? await getRosterAddonPriceCents(overview.interval)
      : null;

  return (
    <main className="mx-auto w-full max-w-[1600px]">
      <PageHeader title="Billing & plan" description={venue.name} />

      <section className="max-w-3xl space-y-6 px-5 py-8">
        <Card>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-ink">
              {planLabel} plan
            </span>
            <StatusBadge tone={statusTone(venue.planStatus)} label={statusLabel} />
            {venue.rosterEntitled ? (
              <StatusBadge tone="green" label="+ Roster" />
            ) : null}
          </div>
          {isTrialing && venue.trialEndsAt ? (
            <div className="mt-3 rounded-control border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 px-3 py-2.5">
              <span className="inline-flex items-center rounded-full bg-[var(--color-accent)]/15 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-accent-deep">
                {daysLeft(venue.trialEndsAt)} days left
              </span>
              <p className="mt-1.5 text-sm text-ink">
                Your trial includes every feature and ends{" "}
                {formatDate(venue.trialEndsAt)}. Choose a plan before then to keep
                going without interruption.
              </p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted">
              Manage your subscription, switch plans, or update your payment
              method.
            </p>
          )}
        </Card>

        {rosterAdded ? (
          <p className="text-sm text-success-deep" role="status">
            Roster added — it&apos;s on this same invoice from now on.
          </p>
        ) : null}
        {rosterRemoved ? (
          <p className="text-sm text-muted" role="status">
            Roster removed from your subscription.
          </p>
        ) : null}

        {/* Consolidated subscription — real line items from Stripe. */}
        {overview ? <SubscriptionCard overview={overview} /> : null}

        {/* Roster add-on control. */}
        {hasSubscription && overview ? (
          <Card>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-base font-semibold tracking-tight text-ink">
                    Roster add-on
                  </h2>
                  {overview.rosterPresent ? (
                    <StatusBadge tone="green" label="Included" />
                  ) : null}
                </div>
                <p className="mt-1.5 text-sm text-muted">
                  Rostering &amp; wage costs for your team, billed as a line on
                  this same invoice — one charge, one receipt. Your staff sign in
                  with the venue login they already use.
                </p>
              </div>
              <div className="shrink-0">
                {overview.rosterPresent ? (
                  <form action={removeRosterAddon}>
                    <Button type="submit" variant="secondary" size="sm">
                      Remove
                    </Button>
                  </form>
                ) : rosterPriceCents !== null ? (
                  <form action={addRosterAddon}>
                    <Button type="submit" variant="primary" size="sm">
                      Add Roster · ${formatCents(rosterPriceCents)}/
                      {overview.interval === "annual" ? "yr" : "mo"}
                    </Button>
                  </form>
                ) : (
                  <span className="text-xs text-muted">
                    Pricing is being set up.
                  </span>
                )}
              </div>
            </div>
          </Card>
        ) : null}

        <Card>
          <h2 className="font-mono text-[11px] font-bold uppercase tracking-wider text-label">
            {hasCustomer ? "Change plan" : "Choose a plan"}
          </h2>
          <p className="mt-1 text-sm text-muted">
            Compare what each plan includes, then pick one — pricing is shown on
            the secure Stripe Checkout page.
          </p>
          {overview?.rosterPresent ? (
            <p className="mt-3 rounded-control border border-line px-3 py-2 text-xs text-muted">
              While Roster is added, change your plan or interval from the
              &ldquo;Manage billing&rdquo; portal below so both lines stay in sync
              on one invoice.
            </p>
          ) : (
            <PlanComparison currentPlan={venue.plan} hasCustomer={hasCustomer} />
          )}
        </Card>

        {/* Invoice history — real Stripe invoices. */}
        {overview && overview.invoices.length > 0 ? (
          <Card>
            <h2 className="font-display text-base font-extrabold tracking-tight text-ink">
              Invoice history
            </h2>
            <ul className="mt-3 divide-y divide-line">
              {overview.invoices.map((invoice) => (
                <li
                  key={invoice.id}
                  className="flex items-center gap-3 py-3 text-sm"
                >
                  <span className="flex-1 font-medium text-ink">
                    {formatDate(invoice.date)}
                  </span>
                  <span className="font-display font-extrabold text-ink">
                    ${formatCents(invoice.amountCents)}
                  </span>
                  <StatusBadge
                    tone={invoice.status === "paid" ? "green" : "amber"}
                    label={invoice.status}
                  />
                  {invoice.url ? (
                    <a
                      href={invoice.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-bold text-[var(--action)] hover:opacity-80"
                    >
                      View
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {/* Cross-sell to the Apps launcher — tinted callout, forest CTA. */}
        {overview && !overview.rosterPresent ? (
          <div className="flex items-center gap-3 rounded-card border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 px-4 py-3">
            <p className="flex-1 text-sm text-ink">
              <b>Add another Zale app and it joins this same bill.</b> No new
              card, no separate invoice — just one more line here.
            </p>
            <Link
              href="/dashboard/apps"
              className="shrink-0 text-sm font-bold text-[var(--action)] hover:opacity-80"
            >
              Browse apps →
            </Link>
          </div>
        ) : null}

        {hasCustomer ? (
          <Card>
            <h2 className="font-mono text-[11px] font-bold uppercase tracking-wider text-label">
              Manage billing
            </h2>
            <p className="mt-1 text-sm text-muted">
              Update your card, view all invoices, or cancel in the Stripe
              billing portal.
            </p>
            <form action={createBillingPortalSession} className="mt-4">
              <Button type="submit" variant="secondary">
                Manage billing
              </Button>
            </form>
          </Card>
        ) : null}

        {checkoutCanceled ? (
          <p className="text-sm text-muted" role="status">
            Checkout canceled. No changes were made.
          </p>
        ) : null}
        {errored ? (
          <p className="text-sm text-[var(--color-warm)]" role="alert">
            Something went wrong reaching Stripe. Please try again.
          </p>
        ) : null}

        <p className="text-xs text-muted">
          Test mode — no real charges are made. Platform billing is separate from
          the Stripe Connect account that takes your customers&apos; payments.
        </p>
      </section>
    </main>
  );
}
