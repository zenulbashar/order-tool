"use client";

import { useState, useTransition } from "react";

import { Button } from "@/app/_components/button";

import { runVisibilityProbe } from "../actions";

/**
 * One click asks an AI search assistant the six diner questions about this
 * venue. Disabled in flight; the rate limiter is the backstop. A partial run
 * (some questions failed) is reported quietly, not as an error.
 */
export function RunVisibilityButton({ hasRun }: { hasRun: boolean }) {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);

  const run = () => {
    setNotice(null);
    startTransition(async () => {
      const result = await runVisibilityProbe();
      if (!result.ok) {
        setNotice(result.error);
      } else if (result.failed > 0) {
        setNotice(
          `${result.failed} of ${result.asked} questions couldn't be asked this time — the rest are recorded.`,
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
        loadingLabel="Asking"
      >
        {hasRun ? "Ask again" : "Ask AI search"}
      </Button>
      {notice ? (
        <p role="status" className="max-w-56 text-right text-xs text-muted">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
