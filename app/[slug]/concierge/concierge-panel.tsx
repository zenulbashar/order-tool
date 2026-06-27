"use client";

import { useMemo, useState, useTransition } from "react";

import { Spinner } from "@/app/_components/spinner";
import {
  DIETARY_DISCLAIMER,
  MAX_CONCIERGE_HISTORY,
  type ConciergeTurn,
} from "@/lib/validation";

import { RecommendationRow } from "../recommendation-row";
import type { PublicItem, PublicMenu } from "../types";
import { proposeCart, type ConciergeProposal } from "./actions";

/**
 * The diner-facing "prompt to eat" box (#12). The diner types what they feel
 * like; the server action proposes a cart of REAL menu items, shown as the
 * existing item-tile idiom. Tapping a tile routes through the SAME flow as every
 * other add: onSelectItem -> the storefront's ItemModifierSheet -> the existing
 * addItem. This panel NEVER mutates the cart and never resolves a price/name
 * from the model — every proposed id is resolved to its live PublicItem from the
 * menu it already holds (the recommendations pattern).
 *
 * Conversation state is ephemeral and lives here: the client resends a short,
 * capped history each turn so "make it cheaper" works, with nothing persisted.
 * The panel stays mounted under the modifier sheet (z-40 vs z-50) so the diner
 * can add several proposed items in turn.
 */

const EXAMPLE_PROMPTS = [
  "Something filling and halal under $20",
  "A coffee and a sweet snack",
  "A light vegetarian lunch",
];

function SparkleIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className="h-4 w-4 shrink-0"
    >
      <path d="M11.3 3.3a.75.75 0 0 1 1.4 0l1.1 3a4 4 0 0 0 2.4 2.4l3 1.1a.75.75 0 0 1 0 1.4l-3 1.1a4 4 0 0 0-2.4 2.4l-1.1 3a.75.75 0 0 1-1.4 0l-1.1-3a4 4 0 0 0-2.4-2.4l-3-1.1a.75.75 0 0 1 0-1.4l3-1.1a4 4 0 0 0 2.4-2.4l1.1-3ZM18.5 15.5a.6.6 0 0 1 1.1 0l.5 1.3a2 2 0 0 0 1.1 1.1l1.3.5a.6.6 0 0 1 0 1.1l-1.3.5a2 2 0 0 0-1.1 1.1l-.5 1.3a.6.6 0 0 1-1.1 0l-.5-1.3a2 2 0 0 0-1.1-1.1l-1.3-.5a.6.6 0 0 1 0-1.1l1.3-.5a2 2 0 0 0 1.1-1.1l.5-1.3Z" />
    </svg>
  );
}

export function ConciergePanel({
  slug,
  menu,
  onSelectItem,
}: {
  slug: string;
  menu: PublicMenu;
  // Open an item through the storefront's existing modifier sheet — the SAME
  // callback the menu tiles and recommendations use. The concierge never adds
  // directly: required size/modifier choices + display pricing happen there.
  onSelectItem: (item: PublicItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<ConciergeTurn[]>([]);
  const [proposals, setProposals] = useState<ConciergeProposal[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [asked, setAsked] = useState(false);
  const [pending, startTransition] = useTransition();

  // Resolve proposed ids to the live PublicItem the menu already holds — the
  // same id-resolution as recommendations. Anything not present is skipped; the
  // name/price the tile shows comes from the resolved item, never the model.
  const itemsById = useMemo(() => {
    const map = new Map<string, PublicItem>();
    for (const category of menu) {
      for (const item of category.items) map.set(item.id, item);
    }
    return map;
  }, [menu]);

  const proposedItems = useMemo(
    () =>
      proposals
        .map((proposal) => itemsById.get(proposal.itemId))
        .filter((item): item is PublicItem => item !== undefined),
    [proposals, itemsById],
  );

  function submit(message: string) {
    const trimmed = message.trim();
    if (trimmed.length === 0 || pending) return;
    setError(null);
    setAsked(true);
    // Resend the committed conversation (capped) so a refine has context. The
    // new message is sent separately and appended on success.
    const priorHistory = history.slice(-MAX_CONCIERGE_HISTORY);
    startTransition(async () => {
      const result = await proposeCart({
        slug,
        message: trimmed,
        history: priorHistory,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setHistory((current) => [
        ...current,
        { role: "user", content: trimmed },
        { role: "assistant", content: result.message },
      ]);
      setProposals(result.items);
      setInput("");
    });
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    submit(input);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-full border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition hover:border-gray-300 hover:bg-gray-50"
      >
        <SparkleIcon />
        Order by vibe — ask the menu assistant
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Menu assistant"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex max-h-[90dvh] w-full max-w-lg flex-col rounded-t-2xl bg-white sm:rounded-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4">
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-gray-900">
                  <SparkleIcon /> Menu assistant
                </h2>
                <p className="mt-0.5 text-sm text-gray-500">
                  Tell us what you feel like — we’ll suggest items from this menu
                  to review and add.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="shrink-0 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {!asked ? (
                <div className="space-y-2">
                  <p className="text-sm text-gray-500">Try one of these:</p>
                  <div className="flex flex-wrap gap-2">
                    {EXAMPLE_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => {
                          setInput(prompt);
                          submit(prompt);
                        }}
                        disabled={pending}
                        className="rounded-full border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {history.map((turn, index) =>
                turn.role === "user" ? (
                  <p
                    key={index}
                    className="ml-auto max-w-[85%] rounded-2xl bg-gray-900 px-3 py-2 text-sm text-white"
                  >
                    {turn.content}
                  </p>
                ) : (
                  <p key={index} className="max-w-[90%] text-sm text-gray-700">
                    {turn.content}
                  </p>
                ),
              )}

              {pending ? (
                <p className="flex items-center gap-2 text-sm text-gray-500">
                  <Spinner size="sm" /> Finding options…
                </p>
              ) : null}

              {error ? (
                <p className="text-sm text-red-600" role="alert">
                  {error}
                </p>
              ) : null}

              {proposedItems.length > 0 ? (
                <>
                  <RecommendationRow
                    title="Tap to review and add"
                    items={proposedItems}
                    onSelect={onSelectItem}
                  />
                  {/* LIFE-SAFETY: tags are the venue's guide, never a guarantee,
                      and the concierge never asserts allergen safety. */}
                  <p className="text-xs text-gray-400">
                    Suggestions use the venue’s dietary tags as a guide, not a
                    guarantee. {DIETARY_DISCLAIMER}
                  </p>
                </>
              ) : asked && !pending && !error ? (
                <p className="text-sm text-gray-500">
                  No matches this time — try describing it a different way.
                </p>
              ) : null}
            </div>

            <form
              onSubmit={handleSubmit}
              className="flex items-center gap-2 border-t border-gray-100 px-5 py-4"
            >
              <input
                type="text"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                maxLength={500}
                placeholder={
                  asked ? "Refine, e.g. make it cheaper" : "What do you feel like?"
                }
                aria-label="Describe what you feel like eating"
                className="min-w-0 flex-1 rounded-full border border-gray-300 px-4 py-2 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
              />
              <button
                type="submit"
                disabled={pending || input.trim().length === 0}
                className="shrink-0 rounded-full px-4 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40"
                style={{ backgroundColor: "var(--brand)" }}
              >
                {pending ? <Spinner size="sm" /> : "Ask"}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
