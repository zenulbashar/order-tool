import { cardStyles } from "@/app/_components/card";
import type { AeoVisibilityProbeRow } from "@/lib/db/schema";

import { RunVisibilityButton } from "./run-visibility-button";

/**
 * AI visibility: what an AI search assistant actually answers about this venue,
 * question by question, and whether the venue was cited. The AEO audit next to
 * it says what the assistant COULD answer from the storefront's data; this is
 * the observed result. Server component; the Run button is the client island.
 */

const dateFormat = (timeZone: string) =>
  new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });

const CITED_BY_LABEL: Record<string, string> = {
  storefront: "linked your storefront",
  website: "linked your website",
  name: "named you",
};

export function VisibilityPanel({
  configured,
  latest,
  history,
  timeZone,
}: {
  configured: boolean;
  latest: AeoVisibilityProbeRow[] | null;
  history: { runId: string; cited: number; asked: number; at: Date; trigger: string }[];
  timeZone: string;
}) {
  const citedCount = latest?.filter((row) => row.cited).length ?? 0;
  const ranAt = latest?.[latest.length - 1]?.createdAt ?? null;

  return (
    <section className={cardStyles()}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-base font-semibold tracking-tight text-ink">
            AI visibility — what AI search actually says
          </h2>
          <p className="mt-1 text-sm text-muted">
            The six diner questions, asked of an AI search assistant with live
            web grounding. A tick means the answer cited you — your storefront,
            your website, or your name.
          </p>
        </div>
        {configured ? <RunVisibilityButton hasRun={latest !== null} /> : null}
      </div>

      {!configured ? (
        <p className="mt-4 rounded-control border border-line px-3 py-2 text-sm text-muted">
          AI visibility probes aren&apos;t switched on for this deployment yet.
        </p>
      ) : latest === null ? (
        <p className="mt-4 text-sm text-muted">
          No probe yet. Run one to see whether AI search cites you today, then
          re-run after fixing your storefront to watch it change.
        </p>
      ) : (
        <>
          <p className="mt-4 text-sm text-ink">
            <span className="font-semibold">
              Cited on {citedCount} of {latest.length}
            </span>{" "}
            questions
            {ranAt ? (
              <span className="text-muted">
                {" "}
                · asked {dateFormat(timeZone).format(ranAt)}
              </span>
            ) : null}
          </p>
          <ul className="mt-3 divide-y divide-line/60">
            {latest.map((row) => (
              <li key={row.id} className="py-3">
                <div className="flex items-start gap-3">
                  <span
                    aria-label={row.cited ? "Cited" : "Not cited"}
                    className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-2xs font-bold ${
                      row.cited
                        ? "bg-[var(--color-success)]/15 text-success-deep"
                        : "bg-[var(--color-warm)]/15 text-[var(--color-warm-deep)]"
                    }`}
                  >
                    {row.cited ? "✓" : "–"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">{row.question}</p>
                    <p className="mt-1 line-clamp-3 text-xs text-muted">
                      {row.answer || "The assistant gave no answer."}
                    </p>
                    <p className="mt-1 font-mono text-2xs uppercase tracking-wider text-label">
                      {row.cited
                        ? `Cited — ${CITED_BY_LABEL[row.citedBy ?? ""] ?? "mentioned you"}`
                        : row.sources.length > 0
                          ? `Not cited — answered from ${row.sources.length} other ${row.sources.length === 1 ? "source" : "sources"}`
                          : "Not cited"}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {history.length > 1 ? (
            <p className="mt-3 text-xs text-muted">
              History:{" "}
              {history
                .slice(-8)
                .map((run) => `${run.cited}/${run.asked}`)
                .join(" → ")}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
