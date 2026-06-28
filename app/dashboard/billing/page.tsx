import Link from "next/link";

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
const selectClass =
  "rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900";

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
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="border-b border-gray-200 pb-6">
        <Link
          href="/dashboard"
          className="text-xs text-gray-500 hover:text-gray-900"
        >
          ← Back to dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="text-sm text-gray-500">{venue.name}</p>
      </header>

      <section className="space-y-6 py-8">
        <div className="rounded-lg border border-gray-200 p-5">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-900">
              {planLabel} plan
            </span>
            <StatusBadge tone={statusTone(venue.planStatus)} label={statusLabel} />
          </div>
          {isTrialing && venue.trialEndsAt ? (
            <p className="mt-2 text-sm text-gray-600">
              Your trial includes every feature and ends{" "}
              {formatDate(venue.trialEndsAt)}. Choose a plan before then to keep
              going without interruption.
            </p>
          ) : (
            <p className="mt-2 text-sm text-gray-600">
              Manage your subscription, switch plans, or update your payment
              method.
            </p>
          )}
        </div>

        <div className="rounded-lg border border-gray-200 p-5">
          <h2 className="text-sm font-medium text-gray-900">
            {hasCustomer ? "Change plan" : "Choose a plan"}
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            Pricing is shown on the secure Stripe Checkout page. Annual billing
            is discounted.
          </p>
          <form
            action={createBillingCheckout}
            className="mt-4 flex flex-wrap items-center gap-3"
          >
            <label className="sr-only" htmlFor="plan">
              Plan
            </label>
            <select id="plan" name="plan" defaultValue="pro" className={selectClass}>
              <option value="pro">Pro</option>
              <option value="scale">Scale</option>
            </select>
            <label className="sr-only" htmlFor="interval">
              Billing interval
            </label>
            <select
              id="interval"
              name="interval"
              defaultValue="monthly"
              className={selectClass}
            >
              <option value="monthly">Billed monthly</option>
              <option value="annual">Billed annually</option>
            </select>
            <button type="submit" className={primaryButton}>
              {hasCustomer ? "Update subscription" : "Start subscription"}
            </button>
          </form>
        </div>

        {hasCustomer ? (
          <div className="rounded-lg border border-gray-200 p-5">
            <h2 className="text-sm font-medium text-gray-900">Manage billing</h2>
            <p className="mt-1 text-sm text-gray-600">
              Update your card, view invoices, or cancel in the Stripe billing
              portal.
            </p>
            <form action={createBillingPortalSession} className="mt-4">
              <button type="submit" className={secondaryButton}>
                Manage billing
              </button>
            </form>
          </div>
        ) : null}

        {checkoutCanceled ? (
          <p className="text-sm text-gray-500" role="status">
            Checkout canceled. No changes were made.
          </p>
        ) : null}
        {errored ? (
          <p className="text-sm text-red-600" role="alert">
            Something went wrong reaching Stripe. Please try again.
          </p>
        ) : null}

        <p className="text-xs text-gray-500">
          Test mode — no real charges are made. Platform billing is separate from
          the Stripe Connect account that takes your customers&apos; payments.
        </p>
      </section>
    </main>
  );
}
