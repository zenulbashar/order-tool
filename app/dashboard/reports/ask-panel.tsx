"use client";

import { useState, useTransition } from "react";

import { Button } from "@/app/_components/button";
import type { InsightsAnswer } from "@/lib/insights-core";
import { INSIGHTS_QUESTION_MAX, INSIGHTS_SUGGESTED_QUESTIONS } from "@/lib/insights-core";

import { askYourData } from "./actions";

export type AskPanelState = "ready" | "no-plan" | "unconfigured" | "no-sales";

const eyebrow = "font-mono text-2xs font-bold uppercase tracking-wider text-label";

/**
 * "Ask your data" — a question box over the venue's own 30-day figures. The
 * answer arrives as text plus the figures the model used, so the owner can
 * check the arithmetic against the cards above. Disabled states explain
 * themselves; the server action is the real gate.
 */
export function AskPanel({ state }: { state: AskPanelState }) {
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState<string | null>(null);
  const [answer, setAnswer] = useState<InsightsAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const disabled = state !== "ready";

  function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    setQuestion(trimmed);
    setError(null);
    startTransition(async () => {
      const result = await askYourData(trimmed);
      setAsked(trimmed);
      if (result.ok) {
        setAnswer(result.answer);
      } else {
        setAnswer(null);
        setError(result.error);
      }
    });
  }

  return (
    <section className="rounded-card border border-line bg-surface-elevated p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={eyebrow}>Ask your data</p>
          <p className="mt-1 text-sm text-muted">
            Plain-language questions, answered only from the last 30 days of
            figures on this page.
          </p>
        </div>
      </div>

      {state === "no-plan" ? (
        <p className="mt-3 text-sm text-muted">
          Included in the Pro and Scale plans (and free during your trial).
        </p>
      ) : state === "unconfigured" ? (
        <p className="mt-3 text-sm text-muted">
          AI insights aren&apos;t switched on for this deployment yet.
        </p>
      ) : state === "no-sales" ? (
        <p className="mt-3 text-sm text-muted">
          Once orders come in, you can ask questions about them here.
        </p>
      ) : null}

      <form
        className="mt-4"
        onSubmit={(event) => {
          event.preventDefault();
          ask(question);
        }}
      >
        <label htmlFor="ask-your-data" className="sr-only">
          Your question
        </label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <textarea
            id="ask-your-data"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            maxLength={INSIGHTS_QUESTION_MAX}
            rows={2}
            disabled={disabled || pending}
            placeholder="e.g. Which day was my best this month?"
            className="min-h-[2.75rem] flex-1 resize-none rounded-[12px] border border-line bg-surface px-3 py-2 text-base text-ink placeholder:text-muted sm:text-sm focus:border-ink focus:outline-none disabled:opacity-60"
          />
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={disabled || question.trim().length < 3}
            loading={pending}
            loadingLabel="Thinking"
          >
            Ask
          </Button>
        </div>
      </form>

      <div className="mt-3 flex flex-wrap gap-2">
        {INSIGHTS_SUGGESTED_QUESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            disabled={disabled || pending}
            onClick={() => ask(suggestion)}
            className="rounded-pill border border-line bg-surface px-3 py-1 text-xs font-medium text-ink transition-colors hover:border-ink disabled:opacity-50"
          >
            {suggestion}
          </button>
        ))}
      </div>

      {error ? (
        <p role="alert" className="mt-4 text-sm text-muted">
          {error}
        </p>
      ) : null}

      {answer ? (
        <div className="mt-4 rounded-[12px] border border-line bg-surface p-4">
          {asked ? (
            <p className="text-xs font-semibold text-muted">“{asked}”</p>
          ) : null}
          <p className="mt-2 text-sm leading-relaxed text-ink">{answer.answer}</p>
          {answer.figures.length > 0 ? (
            <dl className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {answer.figures.map((figure) => (
                <div key={`${figure.label}:${figure.value}`} className="flex justify-between gap-3 text-xs">
                  <dt className="text-muted">{figure.label}</dt>
                  <dd className="font-mono font-semibold text-ink">{figure.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          <p className="mt-3 text-micro text-muted">
            {answer.coverage === "full"
              ? "Answered from your figures. Check them against the cards above."
              : answer.coverage === "partial"
                ? "Partly answered — some of what you asked isn't in the 30-day figures."
                : "Your 30-day figures can't answer that one."}
          </p>
        </div>
      ) : null}
    </section>
  );
}
