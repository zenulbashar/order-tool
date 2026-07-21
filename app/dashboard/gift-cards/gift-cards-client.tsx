"use client";

import { useActionState, useState, useTransition } from "react";

import { Button } from "@/app/_components/button";
import { ConfirmSubmit } from "@/app/_components/confirm-submit";
import { StatusBadge } from "@/app/_components/status-badge";
import type { GiftCardRow } from "@/lib/giftcards/queries";
import { formatCents } from "@/lib/validation";

import {
  issueGiftCardAction,
  topUpGiftCardAction,
  voidGiftCardAction,
  type GiftCardState,
} from "./actions";

const control =
  "rounded-input border border-line bg-surface-elevated px-2.5 py-2 text-sm text-ink shadow-sm focus-visible:border-[var(--color-accent)] focus-visible:shadow-[var(--focus-ring-input)] focus-visible:outline-none";
const microLabel =
  "mb-1 block font-mono text-[9px] font-bold uppercase tracking-wider text-label";

export function GiftCardsClient({ cards }: { cards: GiftCardRow[] }) {
  const [state, formAction, pending] = useActionState<GiftCardState, FormData>(
    issueGiftCardAction,
    {},
  );

  return (
    <div className="space-y-6">
      {/* Issue a card */}
      <section className="rounded-card border border-line bg-surface-elevated p-5 shadow-card">
        <h2 className="font-display text-base font-semibold tracking-tight text-ink">
          Issue a gift card
        </h2>
        <p className="mt-0.5 text-sm text-muted">
          Creates a card with the balance you set and a code to share.
        </p>

        <form action={formAction} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className={microLabel}>Amount ($)</span>
            <input
              name="amount"
              inputMode="decimal"
              required
              placeholder="25.00"
              className={`${control} w-28`}
            />
          </label>
          <label className="block min-w-0 flex-1">
            <span className={microLabel}>
              Note <span className="normal-case text-muted">(optional)</span>
            </span>
            <input
              name="note"
              maxLength={120}
              placeholder="e.g. refund for order A1B2"
              className={`${control} w-full`}
            />
          </label>
          <Button type="submit" variant="primary" size="sm" loading={pending}>
            Issue card
          </Button>
        </form>

        {state.error ? (
          <p className="mt-3 text-sm text-[var(--color-warm)]" role="alert">
            {state.error}
          </p>
        ) : null}
        {state.issuedCode ? <IssuedCode code={state.issuedCode} /> : null}
      </section>

      {/* Existing cards */}
      <section>
        <h2 className="mb-3 font-display text-base font-semibold tracking-tight text-ink">
          Your gift cards
        </h2>
        {cards.length === 0 ? (
          <p className="rounded-card border border-dashed border-line p-8 text-center text-sm text-muted">
            No gift cards yet. Issue one above to get started.
          </p>
        ) : (
          <ul className="space-y-2">
            {cards.map((card) => (
              <GiftCardItem key={card.id} card={card} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** The freshly-issued code, shown once with a copy button. */
function IssuedCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 rounded-control border border-[var(--color-success)]/30 bg-[var(--color-success)]/10 px-3 py-2.5">
      <span className="text-xs text-ink">New card created:</span>
      <span className="font-mono text-sm font-bold tracking-wider text-ink">
        {code}
      </span>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(code);
          setCopied(true);
        }}
        className="rounded-control border border-line-strong bg-surface-elevated px-3 py-1 text-xs font-semibold text-ink transition hover:bg-hover-secondary"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function GiftCardItem({ card }: { card: GiftCardRow }) {
  const [pending, startTransition] = useTransition();
  const isVoid = card.status === "void";

  return (
    <li className="rounded-card border border-line bg-surface-elevated p-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-bold tracking-wider text-ink">
              {card.code}
            </span>
            {isVoid ? <StatusBadge tone="cancelled">Void</StatusBadge> : null}
          </div>
          <p className="mt-0.5 text-xs text-muted">
            Balance{" "}
            <span className="font-semibold text-ink">
              ${formatCents(card.balanceCents)}
            </span>{" "}
            of ${formatCents(card.initialCents)} issued
            {card.note ? ` · ${card.note}` : ""}
          </p>
        </div>

        {!isVoid ? (
          <div className="flex shrink-0 items-center gap-2">
            <form
              action={(formData) =>
                startTransition(async () => {
                  await topUpGiftCardAction(formData);
                })
              }
              className="flex items-center gap-1.5"
            >
              <input type="hidden" name="cardId" value={card.id} />
              <input
                name="amount"
                inputMode="decimal"
                required
                placeholder="10.00"
                aria-label="Top-up amount"
                className={`${control} w-20`}
              />
              <Button type="submit" variant="secondary" size="sm" loading={pending}>
                Top up
              </Button>
            </form>
            <form
              action={(formData) =>
                startTransition(async () => {
                  await voidGiftCardAction(formData);
                })
              }
            >
              <input type="hidden" name="cardId" value={card.id} />
              <ConfirmSubmit message="Void this gift card? Its remaining balance can't be spent afterwards. This can't be undone.">
                Void
              </ConfirmSubmit>
            </form>
          </div>
        ) : null}
      </div>
    </li>
  );
}
