"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/app/_components/button";
import { ButtonLabel } from "@/app/_components/spinner";
import { Textarea } from "@/app/_components/textarea";
import { formatCents } from "@/lib/validation";

import { draftEmptyDescriptions, saveItemDescriptions } from "./actions";

// AI generation trigger — sanctioned amber product signature (not var(--action)).
const aiButtonClass =
  "rounded-control bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-forest transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

// A review row: name/category/price are read-only context; only `description`
// (the AI suggestion) is editable, and only it is ever written.
type Row = {
  itemId: string;
  name: string;
  categoryName: string | null;
  priceCents: number;
  description: string;
};

export function DescriptionsClient({ emptyCount }: { emptyCount: number }) {
  const router = useRouter();

  // null = not drafted yet (stage 0); an array = the review list (stage 1).
  const [rows, setRows] = useState<Row[] | null>(null);
  const [capped, setCapped] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drafting, startDraft] = useTransition();
  const [saving, startSave] = useTransition();

  const canSave =
    rows !== null &&
    rows.some((row) => row.description.trim().length > 0) &&
    !saving;

  function handleDraft() {
    setError(null);
    startDraft(async () => {
      const result = await draftEmptyDescriptions();
      if (result.ok) {
        setRows(
          result.drafts.map((draft) => ({
            itemId: draft.itemId,
            name: draft.name,
            categoryName: draft.categoryName,
            priceCents: draft.priceCents,
            description: draft.suggestion,
          })),
        );
        setCapped(result.capped);
      } else {
        setError(result.error);
      }
    });
  }

  function updateRow(index: number, description: string) {
    setRows((prev) =>
      prev!.map((row, i) => (i === index ? { ...row, description } : row)),
    );
  }

  function removeRow(index: number) {
    setRows((prev) => prev!.filter((_, i) => i !== index));
  }

  function handleSave() {
    if (!rows) return;
    setError(null);
    // Only rows with a non-empty description are written; cleared/skipped rows
    // are left exactly as they were (no pointless null writes).
    const items = rows
      .filter((row) => row.description.trim().length > 0)
      .map((row) => ({ id: row.itemId, description: row.description.trim() }));
    if (items.length === 0) {
      setError("Write or keep at least one description, or go back.");
      return;
    }
    startSave(async () => {
      const result = await saveItemDescriptions({ items });
      if (result.ok) {
        router.push("/dashboard/menu");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  /* --------------------------- Stage 0: start --------------------------- */
  if (rows === null) {
    if (emptyCount === 0) {
      return (
        <section className="py-8">
          <div className="rounded-card border border-line p-5">
            <h2 className="text-sm font-semibold text-ink">
              Every item already has a description
            </h2>
            <p className="mt-1 text-sm text-muted">
              There is nothing to fill in right now. Add or import more items and
              come back any time.
            </p>
          </div>
        </section>
      );
    }

    return (
      <section className="py-8">
        <div className="rounded-card border border-line p-5">
          <h2 className="text-sm font-semibold text-ink">
            Draft descriptions for {emptyCount} item
            {emptyCount === 1 ? "" : "s"}
          </h2>
          <p className="mt-1 text-sm text-muted">
            We&apos;ll write a short, appetising description for each item that
            doesn&apos;t have one yet, using its name, category, and price. You
            review and edit every line, and nothing is saved to your menu until
            you choose “Save descriptions”.
          </p>

          {error ? (
            <p className="mt-3 text-sm text-[var(--color-warm)]" role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="button"
            onClick={handleDraft}
            disabled={drafting}
            className={`mt-4 ${aiButtonClass}`}
          >
            <ButtonLabel pending={drafting} pendingLabel="Drafting…">
              Draft descriptions
            </ButtonLabel>
          </button>
          <p className="mt-3 text-xs text-muted">
            Drafting uses AI and is a small one-time cost. Only items with no
            description are drafted.
          </p>
        </div>
      </section>
    );
  }

  /* ----------------------- Stage 1: review + save ----------------------- */
  return (
    <section className="py-8">
      <div className="rounded-card border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 p-4">
        <p className="text-sm text-accent-deep">
          <strong>Review every description before saving.</strong> These are AI
          suggestions from each item&apos;s name, category, and price, so edit
          anything that&apos;s off and remove any you don&apos;t want. Nothing is
          saved to your live menu until you choose “Save descriptions”.
        </p>
      </div>

      {capped ? (
        <p className="mt-4 text-sm text-muted">
          Showing the first {rows.length}. Save these, then run “Fill empty
          descriptions” again for the rest.
        </p>
      ) : null}

      {error ? (
        <p className="mt-4 text-sm text-[var(--color-warm)]" role="alert">
          {error}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <p className="mt-5 rounded-card border border-dashed border-line p-6 text-center text-sm text-muted">
          No items to review.
        </p>
      ) : (
        <ul className="mt-5 space-y-3">
          {rows.map((row, index) => (
            <li
              key={row.itemId}
              className="rounded-card border border-line p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">
                    {row.name}
                    <span className="ml-2 font-normal text-muted">
                      ${formatCents(row.priceCents)}
                    </span>
                  </p>
                  {row.categoryName ? (
                    <p className="truncate text-xs text-muted">
                      {row.categoryName}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => removeRow(index)}
                  className="shrink-0 text-xs font-medium text-[var(--color-warm)] transition hover:opacity-80"
                >
                  Remove
                </button>
              </div>

              <label className="mt-3 block text-sm font-medium text-ink">
                Description
                <Textarea
                  rows={3}
                  value={row.description}
                  maxLength={500}
                  onChange={(event) => updateRow(index, event.target.value)}
                  placeholder="Write a short description…"
                  className="mt-1"
                />
              </label>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-8 flex items-center gap-3 border-t border-line pt-6">
        <Button
          type="button"
          variant="primary"
          onClick={handleSave}
          disabled={!canSave}
          loading={saving}
          loadingLabel="Saving…"
        >
          Save descriptions
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setRows(null);
            setCapped(false);
            setError(null);
          }}
        >
          Start over
        </Button>
      </div>
      {!canSave && rows.length > 0 ? (
        <p className="mt-2 text-xs text-muted">
          Keep at least one description to save.
        </p>
      ) : null}
    </section>
  );
}
