import Link from "next/link";

import { PageHeader } from "@/app/_components/page-header";
import { requireUser, requireVenue } from "@/lib/tenant";

import { LaunchRoster } from "./launch-roster";

export const dynamic = "force-dynamic";

const VALUE_CARDS = [
  {
    eyebrow: "One login",
    body: "Your team signs in with the prompt2eat account they already have.",
  },
  {
    eyebrow: "One bill",
    body: "Add-ons land as a line on the invoice you already pay. Nothing new to manage.",
  },
  {
    eyebrow: "Shared data",
    body: "Sales flow into wage-cost reports automatically — no exports, no re-typing.",
  },
];

/**
 * Apps launcher — the Zale suite (design: P2E-Owner Apps panel). Roster is the
 * first sibling app; "Open Roster" runs the signed one-time SSO handoff
 * (lib/sso/roster.ts) — no second password, identity stores stay separate.
 * The billing note points at Build 5's consolidated billing; the "Included in
 * your plan" badge is shown only when the venue actually holds the Roster
 * add-on (honest until Build 5 wires the purchase). No amber — not an AI
 * surface.
 */
export default async function AppsPage() {
  const user = await requireUser();
  const venue = await requireVenue();
  const ownerName = (user.name ?? venue.name).split(" ")[0];

  return (
    <main className="mx-auto w-full max-w-[1600px]">
      <PageHeader
        title="Apps"
        description={venue.name}
        action={
          <span className="rounded-pill bg-sand px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-muted">
            Zale suite
          </span>
        }
      />

      <section className="space-y-4 px-5 py-8">
        <p className="text-sm text-muted">
          More from Zale — every app shares this venue, your team&apos;s logins
          and one consolidated bill.
        </p>

        <div className="grid gap-3.5 sm:grid-cols-3">
          {VALUE_CARDS.map((card) => (
            <div
              key={card.eyebrow}
              className="rounded-[14px] border border-line bg-surface-elevated p-4 shadow-card"
            >
              <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-label">
                {card.eyebrow}
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">
                {card.body}
              </p>
            </div>
          ))}
        </div>

        <div className="grid gap-3.5 sm:grid-cols-2">
          {/* Roster tile */}
          <div className="flex flex-col gap-3 rounded-card border border-line bg-surface-elevated p-4 shadow-card">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] bg-forest">
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 18 18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  aria-hidden="true"
                  className="text-surface"
                >
                  <rect x="2.5" y="3.5" width="13" height="12" rx="2" />
                  <path d="M2.5 7.5h13M6 2v3M12 2v3" strokeLinecap="round" />
                  <path
                    d="M5.8 11l1.6 1.6 3-3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display text-base font-extrabold tracking-tight text-ink">
                    Roster
                  </span>
                  <span className="rounded-[5px] bg-sand px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wider text-muted">
                    By Zale
                  </span>
                  {venue.rosterEntitled ? (
                    <span className="rounded-[6px] bg-[var(--color-success)]/12 px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wider text-success-deep">
                      Included in your plan
                    </span>
                  ) : null}
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-muted">
                  Rosters, shifts and wage costs for hospitality teams — your
                  staff clock in with the venue login they already use.
                </p>
              </div>
            </div>
            <p className="font-mono text-[8px] font-bold uppercase tracking-wider text-label">
              Shares: venue · team · sales
            </p>
            <div className="mt-auto">
              <LaunchRoster venueName={venue.name} ownerName={ownerName} />
            </div>
          </div>

          {/* Future apps */}
          <div className="flex flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line-strong bg-hover-secondary p-5 text-center">
            <span aria-hidden="true" className="text-2xl font-bold text-label">
              ＋
            </span>
            <p className="text-sm font-bold text-ink">More apps on the way</p>
            <p className="max-w-[16rem] text-xs leading-relaxed text-muted">
              Invoicing and loyalty are in the works — tell us what would help
              your venue most.
            </p>
          </div>
        </div>

        {/* Consolidated-billing note (Build 5 wires the actual add-on). */}
        <div className="flex items-center gap-2.5 rounded-[13px] bg-forest-deep px-3.5 py-3">
          <span aria-hidden="true" className="shrink-0 text-[13px] text-concierge-mint">
            ℹ
          </span>
          <p className="flex-1 text-[11px] leading-relaxed text-concierge-sage">
            Roster bills as a line item on your prompt2eat invoice — one charge,
            one receipt.
          </p>
          <Link
            href="/dashboard/billing"
            className="shrink-0 text-[11px] font-bold text-surface hover:opacity-80"
          >
            Open Billing →
          </Link>
        </div>
      </section>
    </main>
  );
}
