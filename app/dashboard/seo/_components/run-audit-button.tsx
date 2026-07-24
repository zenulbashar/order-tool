"use client";

import { useState, useTransition } from "react";

import { Button } from "@/app/_components/button";

import { runAeoAudit, runSeoAudit } from "../actions";

/**
 * The one-click trigger. Disabled while the run is in flight (double-click
 * guard; the rate limiter is the backstop). A checks-only run (AI layer
 * unavailable/rate-limited) is surfaced as a quiet note, never an error.
 */
export function RunAuditButton({
  kind,
  hasRun,
}: {
  kind: "seo" | "aeo";
  hasRun: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);

  const label = hasRun
    ? "Run again"
    : kind === "seo"
      ? "Run SEO audit"
      : "Run AEO audit";

  const run = () => {
    setNotice(null);
    startTransition(async () => {
      const result = kind === "seo" ? await runSeoAudit() : await runAeoAudit();
      if (!result.ok) {
        setNotice(result.error);
      } else if (result.llm === "skipped") {
        setNotice(
          "Checks ran. AI suggestions were unavailable this time, so this run is checks-only.",
        );
      }
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="primary"
        size="sm"
        onClick={run}
        loading={pending}
        loadingLabel="Auditing"
      >
        {label}
      </Button>
      {notice ? (
        <p role="status" className="max-w-56 text-right text-xs text-muted">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
