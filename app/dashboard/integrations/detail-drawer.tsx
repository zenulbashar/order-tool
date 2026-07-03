"use client";

import Link from "next/link";
import { useTransition } from "react";

import { Button } from "@/app/_components/button";
import { cx } from "@/app/_components/cx";

import { disconnectSquare, retryAllSquareJobs, retrySquareJob } from "./actions";
import { SquareLogo } from "./integration-card";

/**
 * Square detail drawer — the design's "activity & retries" panel: a right
 * drawer over the dimmed hub with stat chips, per-order activity rows
 * (mirrored ✓ / retrying / failed + Retry), and Disconnect · Pause · Retry-all
 * footer. All data arrives pre-shaped from the server page (snapshot-derived
 * labels, scrubbed errors); closing = navigating back to the plain hub URL.
 */
export type ActivityRow = {
  id: string;
  title: string; // "#4821 · Table 12 · $34.50"
  subtitle: string; // status line / scrubbed error
  tone: "ok" | "retrying" | "failed";
  agoLabel: string; // "2 MIN"
  retryable: boolean;
};

export type DrawerStats = {
  mirrored24h: number;
  attention: number;
  avgDelayLabel: string | null; // "4S" | "2 MIN"
};

export function SquareDetailDrawer({
  mappingLabel,
  stats,
  rows,
  closeHref,
}: {
  mappingLabel: string;
  stats: DrawerStats;
  rows: ActivityRow[];
  closeHref: string;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="fixed inset-0 z-40">
      <Link
        href={closeHref}
        aria-label="Close Square activity"
        className="absolute inset-0 bg-forest-deepest/40"
      />
      <aside
        role="dialog"
        aria-label="Square activity"
        className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-line bg-surface-elevated shadow-[-26px_0_52px_-20px_rgb(20_30_25/0.4)]"
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-line bg-hover-secondary px-5 py-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-forest">
            <SquareLogo />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-base font-extrabold tracking-tight text-ink">
              Square
            </h2>
            <p className="mt-0.5 truncate font-mono text-[9px] font-semibold uppercase tracking-wide text-label">
              {mappingLabel}
            </p>
          </div>
          <Link
            href={closeHref}
            aria-label="Close"
            className="shrink-0 rounded-pill px-2 py-1 text-base text-label hover:bg-sand hover:text-ink"
          >
            ✕
          </Link>
        </header>

        <div className="flex shrink-0 flex-wrap gap-1.5 px-5 pt-3">
          <span className="rounded-[6px] bg-sand px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-wide text-muted">
            {stats.mirrored24h} mirrored · 24h
          </span>
          <span
            className={cx(
              "rounded-[6px] px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-wide",
              stats.attention > 0
                ? "bg-[var(--color-warm)]/10 text-warm-deep"
                : "bg-sand text-muted",
            )}
          >
            {stats.attention} need attention
          </span>
          {stats.avgDelayLabel ? (
            <span className="rounded-[6px] bg-sand px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-wide text-muted">
              Avg delay {stats.avgDelayLabel}
            </span>
          ) : null}
        </div>

        <p className="shrink-0 px-5 pt-3 font-mono text-[9px] font-bold uppercase tracking-wider text-label">
          Activity
        </p>

        <div className="flex-1 space-y-2 overflow-y-auto px-5 py-2.5">
          {rows.length === 0 ? (
            <p className="rounded-card border border-dashed border-line p-6 text-center text-sm text-muted">
              No mirror activity yet — confirmed orders appear here as they
              sync to Square.
            </p>
          ) : (
            rows.map((row) => (
              <div
                key={row.id}
                className={cx(
                  "flex items-center gap-2.5 rounded-input border bg-surface-elevated px-3 py-2.5",
                  row.tone === "failed"
                    ? "border-[var(--color-warm)]/40"
                    : "border-line",
                )}
              >
                {row.tone === "ok" ? (
                  <span
                    aria-hidden="true"
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-success)]/12 text-xs text-success-deep"
                  >
                    ✓
                  </span>
                ) : row.tone === "retrying" ? (
                  <span
                    aria-hidden="true"
                    className="h-6 w-6 shrink-0 animate-spin rounded-full border-2 border-[var(--color-warm-deep)]/25 border-t-[var(--color-warm-deep)]"
                    style={{ animationDuration: "0.9s" }}
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-warm)]/12 text-xs font-bold text-warm-deep"
                  >
                    !
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-ink">{row.title}</p>
                  <p
                    className={cx(
                      "mt-0.5 truncate text-[11px]",
                      row.tone === "ok" ? "text-muted" : "font-semibold text-warm-deep",
                    )}
                  >
                    {row.subtitle}
                  </p>
                </div>
                {row.retryable ? (
                  <form action={retrySquareJob}>
                    <input type="hidden" name="jobId" value={row.id} />
                    <Button type="submit" variant="secondary" size="sm">
                      Retry
                    </Button>
                  </form>
                ) : (
                  <span className="shrink-0 font-mono text-[9px] font-bold uppercase text-label">
                    {row.agoLabel}
                  </span>
                )}
              </div>
            ))
          )}
          <p className="py-1 text-center text-[11px] text-label">
            Failed orders retry automatically with increasing delays for up to
            12 hours.
          </p>
        </div>

        <footer className="flex shrink-0 items-center gap-2 border-t border-line bg-hover-secondary px-5 py-3">
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              if (
                window.confirm(
                  "Disconnect Square? Mirroring stops; no menu or order data is deleted.",
                )
              ) {
                startTransition(async () => {
                  await disconnectSquare();
                });
              }
            }}
            className="text-xs font-bold text-error hover:opacity-80"
          >
            Disconnect
          </button>
          {stats.attention > 0 ? (
            <form action={retryAllSquareJobs} className="ml-auto">
              <Button type="submit" variant="primary" size="sm">
                Retry all {stats.attention} →
              </Button>
            </form>
          ) : null}
        </footer>
      </aside>
    </div>
  );
}
