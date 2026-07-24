"use client";

import { useRef, useState, useTransition } from "react";

import { Button } from "@/app/_components/button";
import { Input } from "@/app/_components/input";
import { Textarea } from "@/app/_components/textarea";
import { MAX_VENUE_FAQS } from "@/lib/validation";

import {
  importAeoFaqSuggestions,
  saveVenueFaqs,
  type FaqRow,
} from "./actions";

type Row = FaqRow & { key: number };

const microLabel =
  "mb-1 block font-mono text-[9px] font-bold uppercase tracking-wider text-label";

/**
 * Owner editor for storefront FAQs. Manages a small list of question/answer
 * pairs and saves them as a replace-all set. "Import from AEO audit" pulls the
 * suggested FAQs from the SEO & AEO studio for review. Nothing publishes until
 * Save — the visible storefront FAQ and its FAQPage JSON-LD both come from what
 * is saved here.
 */
export function FaqsEditor({ initial }: { initial: FaqRow[] }) {
  // Initial keys are assigned by index (no ref access during render); the ref
  // only advances in event handlers below, so new rows get fresh stable keys.
  const initialRows: Row[] = (
    initial.length > 0 ? initial : [{ question: "", answer: "" }]
  ).map((row, index) => ({ ...row, key: index }));
  const nextKey = useRef(initialRows.length);
  const makeRow = (row: FaqRow): Row => ({ ...row, key: nextKey.current++ });

  const [rows, setRows] = useState<Row[]>(initialRows);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<
    { kind: "ok" | "error"; text: string } | null
  >(null);

  const atMax = rows.length >= MAX_VENUE_FAQS;

  function update(key: number, patch: Partial<FaqRow>) {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }
  function remove(key: number) {
    setRows((current) => current.filter((row) => row.key !== key));
  }
  function add() {
    if (atMax) return;
    setRows((current) => [...current, makeRow({ question: "", answer: "" })]);
  }

  function save() {
    setMessage(null);
    startTransition(async () => {
      const result = await saveVenueFaqs({
        faqs: rows.map(({ question, answer }) => ({ question, answer })),
      });
      if (result.ok) {
        setMessage({
          kind: "ok",
          text:
            result.saved === 0
              ? "Saved. Your storefront has no FAQs now."
              : `Saved ${result.saved} FAQ${result.saved === 1 ? "" : "s"} to your storefront.`,
        });
      } else {
        setMessage({ kind: "error", text: result.error });
      }
    });
  }

  function importSuggestions() {
    setMessage(null);
    startTransition(async () => {
      const result = await importAeoFaqSuggestions();
      if (!result.ok) {
        setMessage({ kind: "error", text: result.error });
        return;
      }
      setRows((current) => {
        // Drop leading blank rows, then append suggestions up to the cap.
        const kept = current.filter(
          (row) => row.question.trim() !== "" || row.answer.trim() !== "",
        );
        const room = Math.max(0, MAX_VENUE_FAQS - kept.length);
        const added = result.faqs.slice(0, room).map(makeRow);
        return [...kept, ...added];
      });
      setMessage({
        kind: "ok",
        text: "Imported AEO suggestions below. Review them, then Save.",
      });
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Add the questions diners actually ask. They show on your storefront and
          help AI assistants answer for you. Up to {MAX_VENUE_FAQS}.
        </p>
        <Button size="sm" onClick={importSuggestions} loading={pending}>
          Import from AEO audit
        </Button>
      </div>

      <ul className="space-y-4">
        {rows.map((row, index) => (
          <li key={row.key} className="rounded-card border border-line p-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-label">
                FAQ {index + 1}
              </span>
              <button
                type="button"
                onClick={() => remove(row.key)}
                className="text-xs font-semibold text-muted transition hover:text-[var(--color-warm)]"
              >
                Remove
              </button>
            </div>
            <label className="mt-2 block">
              <span className={microLabel}>Question</span>
              <Input
                value={row.question}
                maxLength={160}
                placeholder="Do you take bookings?"
                onChange={(event) =>
                  update(row.key, { question: event.target.value })
                }
              />
            </label>
            <label className="mt-3 block">
              <span className={microLabel}>Answer</span>
              <Textarea
                value={row.answer}
                rows={2}
                maxLength={600}
                placeholder="Answer in a sentence or two, using only what's true of your venue."
                onChange={(event) =>
                  update(row.key, { answer: event.target.value })
                }
              />
            </label>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={add} disabled={atMax}>
          + Add FAQ
        </Button>
        <Button
          variant="primary"
          onClick={save}
          loading={pending}
          loadingLabel="Saving…"
        >
          Save <span aria-hidden="true">→</span>
        </Button>
        {atMax ? (
          <span className="text-xs text-muted">
            You&apos;ve reached the {MAX_VENUE_FAQS}-FAQ limit.
          </span>
        ) : null}
      </div>

      {message ? (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={
            message.kind === "error"
              ? "text-sm text-[var(--color-warm)]"
              : "text-sm text-[var(--color-success)]"
          }
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
