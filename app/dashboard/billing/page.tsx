import { Button } from "@/app/_components/button";
import { Card } from "@/app/_components/card";
import { PageHeader } from "@/app/_components/page-header";
import { requireUser, requireVenue } from "@/lib/tenant";

import { createBillingCheckout, createBillingPortalSession } from "./actions";

// Authed + reads the live plan/status on return from Stripe; never prerendered.
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

// Inline auto-width selects (the change-plan row is a flex-wrap line, not a
// stacked form), so kept native + tokenized rather than the full-width Select
// primitive — same rationale as the settings time inputs.
const selectClass =
  "rounded-input border border-line bg-surface-elevated px-3 py-2 text-sm text-ink shadow-sm focus-visible:border-[var(--color-accent)] focus-visible:shadow-[var(--focus-ring-input)] focus-visible:outline-none";

// Space Mono micro-eyebrow, matching the reconciled owner forms.
const microLabel =
  "mb-1 block font-mono text-[9px] font-bold uppercase tracking-wider text-label";

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

// Whole days remaining until `date` (never negative). Derived from the existing
// trialEndsAt — the page is force-dynamic, so this reflects the current day.
function daysLeft(date: Date): number {
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / 86_400_000));
}

export default async function BillingPage({ searchParams }: BillingParams) {
  await requireUser();
  const venue = await requireVenue();
  const sp = await searchParams;

  const planLabel = PLAN_LABELS[venue.plan] ?? venue.plan;
  const statusLabel = STATUS_LABELS[venue.planStatus] ?? venue.planStatus;
  const hasCustomer = venue.stripeCustomerId !== null;
  const isTrialing = venue.planStatus === "trialing";
  const checkoutCanceled = sp.checkout === "cancel";
  const errored = sp.error === "checkout" || sp.error === "portal";

  return (
    <main className="mx-auto max-w-3xl">
      <PageHeader title="Billing" description={venue.name} />

      <section className="space-y-6 px-5 py-8">
        <Card>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-ink">
              {planLabel} plan
            </span>
            <StatusBadge tone={statusTone(venue.planStatus)} label={statusLabel} />
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

        <Card>
          <h2 className="font-mono text-[11px] font-bold uppercase tracking-wider text-label">
            {hasCustomer ? "Change plan" : "Choose a plan"}
          </h2>
          <p className="mt-1 text-sm text-muted">
            Pricing is shown on the secure Stripe Checkout page. Annual billing
            is discounted.
          </p>
          <form
            action={createBillingCheckout}
            className="mt-4 flex flex-wrap items-end gap-3"
          >
            <label className="block">
              <span className={microLabel}>Plan</span>
              <select
                id="plan"
                name="plan"
                defaultValue="pro"
                className={selectClass}
              >
                <option value="pro">Pro</option>
                <option value="scale">Scale</option>
              </select>
            </label>
            <label className="block">
              <span className={microLabel}>Billing interval</span>
              <select
                id="interval"
                name="interval"
                defaultValue="monthly"
                className={selectClass}
              >
                <option value="monthly">Billed monthly</option>
                <option value="annual">Billed annually</option>
              </select>
            </label>
            <Button type="submit" variant="primary">
              {hasCustomer ? "Update subscription" : "Start subscription"}
            </Button>
          </form>
        </Card>

        {hasCustomer ? (
          <Card>
            <h2 className="font-mono text-[11px] font-bold uppercase tracking-wider text-label">
              Manage billing
            </h2>
            <p className="mt-1 text-sm text-muted">
              Update your card, view invoices, or cancel in the Stripe billing
              portal.
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
