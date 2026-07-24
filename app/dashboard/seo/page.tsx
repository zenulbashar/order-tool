import type { Metadata } from "next";
import Link from "next/link";

import { buttonStyles } from "@/app/_components/button-variants";
import { cardStyles } from "@/app/_components/card";
import { PageHeader } from "@/app/_components/page-header";
import { FEATURES, hasFeature } from "@/lib/billing/plans";
import { getVenuePlan } from "@/lib/billing/queries";
import { isSearchConsoleConfigured } from "@/lib/search-console";
import { requireUser, requireVenue } from "@/lib/tenant";

import { AuditPanel } from "./_components/audit-panel";
import { ScoreRing } from "./_components/score-viz";
import { SearchStatsPanel } from "./_components/search-stats-panel";
import {
  getAuditHistory,
  getLatestAudit,
  getRecentAudits,
  getSearchStats,
} from "./queries";

// Live owner data + plan gate — always rendered per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "SEO & AEO" };

const dateFormat = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/**
 * The SEO & AEO studio (Scale plan). One-click audits of the venue's public
 * storefront for Google search (SEO) and AI answer engines (AEO), AI-drafted
 * fixes the owner reviews before anything publishes, and real Search Console
 * stats. The page gates on the plan AND every server action re-checks it —
 * never trust the client.
 */
export default async function SeoPage() {
  await requireUser();
  const venue = await requireVenue();
  const plan = await getVenuePlan(venue.id);
  const entitled = plan !== null && hasFeature({ plan }, FEATURES.SEO_AEO);

  if (!entitled) {
    return (
      <>
        <PageHeader
          title="SEO & AEO"
          description="Audit how your storefront ranks on Google and answers in AI assistants."
        />
        <div className="mx-auto max-w-2xl px-5 py-10">
          <div
            className={cardStyles({
              className: "flex flex-col items-center gap-5 text-center",
            })}
          >
            <span className="rounded-sm bg-accent px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide text-forest">
              Scale plan
            </span>
            <div aria-hidden="true" className="pointer-events-none select-none">
              <ScoreRing score={86} band="good" />
              <p className="mt-1 font-mono text-[9px] font-bold uppercase tracking-wider text-label">
                Sample score
              </p>
            </div>
            <div>
              <h2 className="font-display text-lg font-semibold text-ink">
                One click to audit and optimise your storefront
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted">
                Run SEO and AEO audits on your storefront, get AI-drafted
                descriptions and FAQs to review, and watch real Google clicks
                and impressions — all from this page. Included in the Scale
                plan (and free during your trial).
              </p>
            </div>
            <Link
              href="/dashboard/billing"
              className={buttonStyles("primary", "md")}
            >
              Upgrade to Scale
            </Link>
          </div>
        </div>
      </>
    );
  }

  const [latestSeo, latestAeo, seoHistory, aeoHistory, recent, searchStats] =
    await Promise.all([
      getLatestAudit(venue.id, "seo"),
      getLatestAudit(venue.id, "aeo"),
      getAuditHistory(venue.id, "seo"),
      getAuditHistory(venue.id, "aeo"),
      getRecentAudits(venue.id),
      getSearchStats(venue.id),
    ]);

  return (
    <>
      <PageHeader
        title="SEO & AEO"
        description={`How ${venue.name} ranks on Google and answers in AI assistants — audit, fix, and track it here.`}
      />
      <div className="space-y-8 px-5 py-6">
        <SearchStatsPanel
          configured={isSearchConsoleConfigured()}
          stats={searchStats}
        />

        <div className="grid gap-8 lg:grid-cols-2">
          <AuditPanel
            kind="seo"
            latest={latestSeo}
            history={seoHistory}
            currentDescription={venue.storefrontDescription}
          />
          <AuditPanel
            kind="aeo"
            latest={latestAeo}
            history={aeoHistory}
            currentDescription={venue.storefrontDescription}
          />
        </div>

        {recent.length > 0 ? (
          <section>
            <h2 className="font-display text-base font-semibold text-ink">
              Run history
            </h2>
            <div className="mt-3 overflow-hidden rounded-card border border-line">
              <ul className="divide-y divide-line/60">
                {recent.map((run) => (
                  <li
                    key={run.id}
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 bg-surface-elevated px-4 py-2.5"
                  >
                    <span className="flex items-center gap-3">
                      <span className="w-10 font-mono text-[10px] font-bold uppercase tracking-wider text-label">
                        {run.kind}
                      </span>
                      <span className="font-display text-sm font-extrabold text-ink">
                        {run.score}
                      </span>
                      <span className="text-xs capitalize text-muted">
                        {run.band}
                      </span>
                    </span>
                    <span className="flex items-center gap-3 text-xs text-muted">
                      <span>{run.model ? "AI + checks" : "checks only"}</span>
                      <span>{dateFormat.format(run.createdAt)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}

        <div className="flex items-start gap-2.5 rounded-card bg-forest-deep px-4 py-3">
          <span aria-hidden className="text-sm text-[var(--color-success)]">
            ℹ
          </span>
          <p className="text-xs leading-relaxed text-white/80">
            Audits read your storefront exactly as Google and AI assistants do.
            Prompt2Eat never publishes AI copy by itself — every suggestion
            waits for your review, and applied text stays editable in About
            &amp; description.
          </p>
        </div>
      </div>
    </>
  );
}
