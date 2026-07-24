"use client";

import { useState, useTransition } from "react";

import { Button } from "@/app/_components/button";
import { cardStyles } from "@/app/_components/card";
import type { SeoGeneratedCopy } from "@/lib/db/schema";

import { applyGeneratedCopy } from "../actions";

/**
 * Owner review surface for the AI-drafted output. NOTHING here publishes by
 * itself: the SEO draft applies only via the applyGeneratedCopy action (which
 * re-reads the stored draft server-side), and the AEO FAQs are copy-paste
 * suggestions. The current description is rendered live so an owner who edited
 * it since the audit sees exactly what "Apply" would overwrite.
 */

const VERDICT_STYLE: Record<string, string> = {
  strong: "bg-[var(--color-success)]/15 text-success-deep",
  adequate: "bg-[var(--color-accent)]/15 text-accent-deep",
  weak: "bg-[var(--color-warm)]/15 text-[var(--color-warm)]",
};

function CopyTextButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
        } catch {
          // Clipboard blocked (permissions) — the text is on screen to select.
        }
      }}
    >
      {copied ? "Copied" : label}
    </Button>
  );
}

export function CopyReviewCard({
  auditId,
  kind,
  currentDescription,
  copy,
}: {
  auditId: string;
  kind: "seo" | "aeo";
  currentDescription: string | null;
  copy: SeoGeneratedCopy;
}) {
  const [pending, startTransition] = useTransition();
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const proposed = copy.optimizedDescription ?? null;
  const alreadyApplied =
    proposed !== null && (currentDescription ?? "").trim() === proposed.trim();

  const apply = () => {
    setError(null);
    startTransition(async () => {
      const result = await applyGeneratedCopy({ auditId });
      if (result.ok) setApplied(true);
      else setError(result.error);
    });
  };

  return (
    <div className={cardStyles({ className: "p-4" })}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-muted">
          AI suggestions to review
        </p>
        {copy.assessment ? (
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${VERDICT_STYLE[copy.assessment.verdict] ?? "bg-sand text-muted"}`}
          >
            Content: {copy.assessment.verdict}
          </span>
        ) : null}
      </div>
      {copy.assessment ? (
        <p className="mt-2 text-sm text-muted">{copy.assessment.summary}</p>
      ) : null}

      {kind === "seo" ? (
        <div className="mt-4 space-y-4">
          {proposed ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border border-line bg-sand/40 p-3">
                <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-label">
                  Current description
                </p>
                <p className="mt-1.5 text-sm text-ink">
                  {currentDescription?.trim() || (
                    <span className="text-muted">(none set)</span>
                  )}
                </p>
              </div>
              <div className="rounded-md border border-[var(--color-success)]/40 bg-[var(--color-success)]/5 p-3">
                <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-success-deep">
                  Suggested description
                </p>
                <p className="mt-1.5 text-sm text-ink">{proposed}</p>
              </div>
            </div>
          ) : null}

          {copy.metaDescription ? (
            <div className="rounded-md border border-line bg-sand/40 p-3">
              <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-label">
                Suggested search snippet ({copy.metaDescription.length} chars)
              </p>
              <p className="mt-1.5 text-sm text-ink">{copy.metaDescription}</p>
            </div>
          ) : null}

          {proposed ? (
            <div className="flex flex-wrap items-center gap-2">
              {applied || alreadyApplied ? (
                <p className="text-sm font-medium text-success-deep">
                  ✓ Applied to your storefront.
                </p>
              ) : (
                <>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={apply}
                    loading={pending}
                    loadingLabel="Applying"
                  >
                    Apply to storefront
                  </Button>
                  <CopyTextButton text={proposed} label="Copy text" />
                  <p className="w-full text-xs text-muted">
                    Applying replaces your current storefront description (you
                    can edit it any time in About &amp; description).
                  </p>
                </>
              )}
              {error ? (
                <p role="alert" className="w-full text-xs text-warm-deep">
                  {error}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {copy.qa && copy.qa.length > 0 ? (
            <div>
              <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-label">
                Can an AI assistant answer…
              </p>
              <ul className="mt-2 space-y-2">
                {copy.qa.map((qa) => (
                  <li
                    key={qa.question}
                    className="rounded-md border border-line bg-sand/40 px-3 py-2"
                  >
                    <p className="text-sm font-medium text-ink">
                      <span
                        aria-hidden="true"
                        className={
                          qa.answerable ? "text-success-deep" : "text-warm-deep"
                        }
                      >
                        {qa.answerable ? "✓" : "✗"}
                      </span>{" "}
                      {qa.question}
                      <span className="sr-only">
                        {qa.answerable ? " — answerable" : " — not answerable"}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {qa.answerable ? qa.answer : qa.gap}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {copy.suggestedFaqs && copy.suggestedFaqs.length > 0 ? (
            <div>
              <div className="flex items-center justify-between gap-2">
                <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-label">
                  Suggested FAQs (paste into About &amp; description)
                </p>
                <CopyTextButton
                  label="Copy all"
                  text={copy.suggestedFaqs
                    .map((faq) => `${faq.question}\n${faq.answer}`)
                    .join("\n\n")}
                />
              </div>
              <ul className="mt-2 space-y-2">
                {copy.suggestedFaqs.map((faq) => (
                  <li
                    key={faq.question}
                    className="rounded-md border border-line bg-sand/40 px-3 py-2"
                  >
                    <p className="text-sm font-medium text-ink">{faq.question}</p>
                    <p className="mt-0.5 text-xs text-muted">{faq.answer}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
