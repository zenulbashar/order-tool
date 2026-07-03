"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/app/_components/button";
import { buttonStyles } from "@/app/_components/button-variants";
import { cx } from "@/app/_components/cx";
import { ButtonLabel } from "@/app/_components/spinner";
import { ThinkingDots } from "@/app/_components/thinking-dots";
import { costPerUnitCents, formatUnitCost } from "@/lib/stock/cost";
import { dollarsToCents, formatCents } from "@/lib/validation";

import {
  applyInvoice,
  type ApplyInput,
  type DraftLine,
  type ExtractResult,
  extractInvoice,
} from "./actions";

// AI feature — the sanctioned amber product signature (Stock's first amber
// surface, because invoice scanning IS an AI vision feature).
const aiButtonClass =
  "rounded-control bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-forest transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
const aiBadgeClass =
  "inline-flex items-center gap-1 rounded-pill bg-[var(--color-accent)]/15 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-accent-deep";

const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type RecentScan = {
  id: string;
  supplier: string | null;
  lineCount: number;
  updatedCount: number;
  createdCount: number;
  scannedLabel: string;
};

// A review-gate row: the draft line plus the owner's in-progress decision and
// editable values. Prices are held as raw dollar strings until apply.
type ReviewLine = {
  draft: DraftLine;
  action: "apply" | "skip"; // "apply" = update a match OR create a new one
  nameInput: string;
  unitInput: "g" | "ml" | "each";
  packSizeInput: string;
  packCostInput: string;
};

type ApplyStats = {
  supplier: string | null;
  linesUpdated: number;
  dishesRecosted: number;
  marginShiftPts: number | null;
};

function toReviewLine(draft: DraftLine): ReviewLine {
  const packSize = draft.match ? draft.packSize ?? draft.match.oldPackSize : draft.packSize;
  const packCostCents = draft.packCostCents;
  return {
    draft,
    action: "apply",
    nameInput: draft.match?.name ?? draft.name,
    unitInput: draft.match?.unit ?? draft.unit ?? "each",
    packSizeInput: packSize != null ? String(packSize) : "",
    packCostInput: packCostCents != null ? formatCents(packCostCents) : "",
  };
}

/** Parse a pack-size input to a positive number, or null. */
function parsePackSize(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return n > 0 ? n : null;
}

export function ScanClient({ recentScans }: { recentScans: RecentScan[] }) {
  const router = useRouter();

  const [files, setFiles] = useState<File[]>([]);
  const [lines, setLines] = useState<ReviewLine[] | null>(null);
  const [meta, setMeta] = useState<{ supplier: string; invoiceDate: string } | null>(
    null,
  );
  const [done, setDone] = useState<ApplyStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [extracting, startExtract] = useTransition();
  const [applying, startApply] = useTransition();

  const tooMany = files.length > MAX_IMAGES;
  const tooBig = files.some((file) => file.size > MAX_IMAGE_BYTES);
  const canExtract = files.length > 0 && !tooMany && !tooBig && !extracting;

  function handleFiles(list: FileList | null) {
    setError(null);
    setFiles(list ? Array.from(list) : []);
  }

  function reset() {
    setFiles([]);
    setLines(null);
    setMeta(null);
    setDone(null);
    setError(null);
  }

  function handleExtract() {
    setError(null);
    startExtract(async () => {
      const formData = new FormData();
      for (const file of files) formData.append("images", file);
      const result: ExtractResult = await extractInvoice(formData);
      if (result.ok) {
        setMeta({
          supplier: result.draft.supplier,
          invoiceDate: result.draft.invoiceDate,
        });
        setLines(result.draft.lines.map(toReviewLine));
      } else {
        setError(result.error);
      }
    });
  }

  function updateLine(index: number, patch: Partial<ReviewLine>) {
    setLines((prev) =>
      prev!.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );
  }

  const applicable = (lines ?? []).filter((line) => line.action === "apply");
  const canApply =
    applicable.length > 0 &&
    applicable.every(
      (line) =>
        // A create needs a name; every applied line needs a readable pack cost.
        (line.draft.match || line.nameInput.trim().length > 0) &&
        dollarsToCents(line.packCostInput) !== null,
    );

  function handleApply() {
    if (!lines || !canApply) return;
    setError(null);
    const payload: ApplyInput = {
      supplier: meta?.supplier.trim() ? meta.supplier.trim() : null,
      lines: lines.map((line) => {
        if (line.action === "skip") return { action: "skip" as const };
        const packSize = parsePackSize(line.packSizeInput);
        const packCostCents = dollarsToCents(line.packCostInput);
        if (line.draft.match) {
          return {
            action: "update" as const,
            ingredientId: line.draft.match.ingredientId,
            packSize,
            packCostCents,
          };
        }
        return {
          action: "create" as const,
          name: line.nameInput.trim(),
          unit: line.unitInput,
          packSize,
          packCostCents,
          supplier: meta?.supplier.trim() ? meta.supplier.trim() : null,
        };
      }),
    };
    startApply(async () => {
      const result = await applyInvoice(payload);
      if (result.ok) {
        setDone({
          supplier: result.supplier,
          linesUpdated: result.linesUpdated,
          dishesRecosted: result.dishesRecosted,
          marginShiftPts: result.marginShiftPts,
        });
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  /* --------------------------------- success -------------------------------- */
  if (done) {
    return <SuccessPanel stats={done} onScanAnother={reset} />;
  }

  /* ------------------------------ review gate ------------------------------- */
  if (lines) {
    return (
      <ReviewGate
        lines={lines}
        meta={meta}
        error={error}
        applying={applying}
        canApply={canApply}
        applyCount={applicable.length}
        onUpdateLine={updateLine}
        onApply={handleApply}
        onStartOver={reset}
      />
    );
  }

  /* -------------------------------- extracting ------------------------------ */
  if (extracting) {
    return (
      <section className="py-8">
        <div className="overflow-hidden rounded-card border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/8 p-8 text-center">
          <div className="relative mx-auto h-24 w-40 overflow-hidden rounded-input border border-line bg-surface-elevated">
            {/* A quiet scan sweep over a stand-in "invoice". */}
            <div className="space-y-1.5 p-3">
              {[0.9, 0.7, 0.8, 0.6, 0.75].map((w, i) => (
                <div
                  key={i}
                  className="h-1.5 rounded-full bg-line"
                  style={{ width: `${w * 100}%` }}
                />
              ))}
            </div>
            <div className="p2e-scan pointer-events-none absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-[var(--color-accent)]/40 to-transparent" />
          </div>
          <div className="mt-5">
            <ThinkingDots label="Reading your invoice…" />
          </div>
          <p className="mt-2 text-xs text-muted">
            Matching lines to your ingredient library.
          </p>
        </div>
      </section>
    );
  }

  /* --------------------------------- upload --------------------------------- */
  return (
    <section className="space-y-5 py-8">
      <div className="rounded-card border border-line bg-surface-elevated p-5 shadow-card">
        <div className="flex items-center gap-2">
          <span className={aiBadgeClass}>✦ AI Vision</span>
          <h2 className="text-sm font-semibold text-ink">Scan a supplier invoice</h2>
        </div>
        <p className="mt-2 text-sm text-muted">
          Add up to {MAX_IMAGES} clear photos of a delivery invoice (JPEG, PNG,
          WebP, or GIF; max 5MB each). We read each line and match it to your
          ingredients, so you can update pack costs in one review.
        </p>

        <label className="mt-4 flex cursor-pointer items-center justify-center rounded-input bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-warm)] px-4 py-2.5 text-sm font-semibold text-forest transition hover:opacity-90">
          Choose file
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            onChange={(event) => handleFiles(event.target.files)}
            className="sr-only"
          />
        </label>

        {files.length > 0 ? (
          <p className="mt-2 text-xs text-muted">
            {files.length} photo{files.length === 1 ? "" : "s"} selected.
          </p>
        ) : null}
        {tooMany ? (
          <p className="mt-2 text-sm text-warm-deep" role="alert">
            Add at most {MAX_IMAGES} photos.
          </p>
        ) : null}
        {tooBig ? (
          <p className="mt-2 text-sm text-warm-deep" role="alert">
            Each photo must be 5MB or smaller.
          </p>
        ) : null}
        {error ? (
          <p className="mt-2 text-sm text-warm-deep" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          onClick={handleExtract}
          disabled={!canExtract}
          className={cx("mt-4", aiButtonClass)}
        >
          <ButtonLabel pending={extracting} pendingLabel="Reading invoice…">
            Read invoice
          </ButtonLabel>
        </button>

        <div className="mt-4 flex items-start gap-2 rounded-input bg-hover-secondary px-3 py-2.5">
          <span aria-hidden="true" className="text-sm text-muted">
            🔒
          </span>
          <p className="text-xs text-muted">
            <strong className="font-semibold text-ink">
              Nothing changes on upload.
            </strong>{" "}
            You review and confirm every line before any cost is updated. The
            photo is sent for reading only — it is not stored.
          </p>
        </div>
      </div>

      {recentScans.length > 0 ? (
        <div className="rounded-card border border-line bg-surface-elevated p-5 shadow-card">
          <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-label">
            Recent scans
          </p>
          <ul className="mt-3 space-y-2">
            {recentScans.map((scan) => (
              <li
                key={scan.id}
                className="flex items-center justify-between gap-3 border-b border-line pb-2 last:border-0 last:pb-0"
              >
                <span className="min-w-0 truncate text-sm font-medium text-ink">
                  {scan.supplier ?? "Invoice"}
                  <span className="ml-2 text-xs font-normal text-muted">
                    {scan.scannedLabel}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-[10px] text-muted">
                  {scan.updatedCount} updated
                  {scan.createdCount > 0 ? ` · ${scan.createdCount} new` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

/* ========================================================================== */
/* Review gate                                                                 */
/* ========================================================================== */

function ReviewGate({
  lines,
  meta,
  error,
  applying,
  canApply,
  applyCount,
  onUpdateLine,
  onApply,
  onStartOver,
}: {
  lines: ReviewLine[];
  meta: { supplier: string; invoiceDate: string } | null;
  error: string | null;
  applying: boolean;
  canApply: boolean;
  applyCount: number;
  onUpdateLine: (index: number, patch: Partial<ReviewLine>) => void;
  onApply: () => void;
  onStartOver: () => void;
}) {
  const supplierLabel = meta?.supplier.trim() || "Supplier";
  const dateLabel = meta?.invoiceDate.trim();

  return (
    <section className="py-8">
      <div className="rounded-card border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/8 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className={aiBadgeClass}>✦ AI Vision</span>
          <h2 className="text-sm font-semibold text-ink">
            Review invoice · {supplierLabel}
            {dateLabel ? ` · ${dateLabel}` : ""} · {lines.length}{" "}
            {lines.length === 1 ? "line" : "lines"}
          </h2>
        </div>
        <p className="mt-1.5 text-sm text-accent-deep">
          Every cost comes from an AI reading a photo and can be wrong — check
          each pack cost. Matched lines update an existing ingredient; new lines
          add one. Skip anything you don&apos;t want. Nothing is written until you
          confirm.
        </p>
      </div>

      {error ? (
        <p className="mt-4 text-sm text-warm-deep" role="alert">
          {error}
        </p>
      ) : null}

      <ul className="mt-5 space-y-2.5">
        {lines.map((line, index) => (
          <ReviewRow
            key={index}
            line={line}
            onChange={(patch) => onUpdateLine(index, patch)}
          />
        ))}
      </ul>

      <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-line pt-6">
        <button
          type="button"
          onClick={onApply}
          disabled={!canApply || applying}
          className={aiButtonClass}
        >
          <ButtonLabel pending={applying} pendingLabel="Updating costs…">
            {`Confirm & update costs (${applyCount}) →`}
          </ButtonLabel>
        </button>
        <Button type="button" variant="secondary" onClick={onStartOver}>
          Start over
        </Button>
      </div>
      {!canApply ? (
        <p className="mt-2 text-xs text-muted">
          Give every applied line a readable pack cost (and new ingredients a
          name), or skip it.
        </p>
      ) : null}
    </section>
  );
}

function ReviewRow({
  line,
  onChange,
}: {
  line: ReviewLine;
  onChange: (patch: Partial<ReviewLine>) => void;
}) {
  const matched = line.draft.match;
  const skipped = line.action === "skip";
  const packCostCents = dollarsToCents(line.packCostInput);
  const packSize = parsePackSize(line.packSizeInput);
  const newUnitCost =
    packCostCents !== null
      ? costPerUnitCents({
          packSize,
          packCostCents,
          yieldPct: matched?.yieldPct ?? 100,
        })
      : null;
  const priceMissing = !skipped && packCostCents === null;

  const inputClass =
    "w-full rounded-input border border-line bg-surface-elevated px-2.5 py-1.5 text-sm text-ink focus-visible:border-[var(--color-accent)] focus-visible:shadow-[var(--focus-ring-input)] focus-visible:outline-none";
  const microLabel =
    "mb-1 block font-mono text-[9px] font-bold uppercase tracking-wider text-label";

  return (
    <li
      className={cx(
        "rounded-card border border-line bg-surface-elevated p-3.5 shadow-sm transition",
        skipped && "opacity-55",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {matched ? (
              <span className="truncate text-sm font-semibold text-ink">
                {matched.name}
              </span>
            ) : (
              <input
                value={line.nameInput}
                maxLength={120}
                onChange={(event) => onChange({ nameInput: event.target.value })}
                placeholder="Ingredient name"
                className="min-w-0 flex-1 rounded-input border border-line bg-surface-elevated px-2.5 py-1 text-sm font-semibold text-ink focus-visible:border-[var(--color-accent)] focus-visible:shadow-[var(--focus-ring-input)] focus-visible:outline-none"
              />
            )}
            {matched ? (
              <span className="shrink-0 rounded-pill bg-[var(--color-success)]/12 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-success-deep">
                Matched
              </span>
            ) : (
              <span className="shrink-0 rounded-pill bg-[var(--color-accent)]/15 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-accent-deep">
                New
              </span>
            )}
          </div>
          {line.draft.packText ? (
            <p className="mt-0.5 font-mono text-[10px] text-muted">
              Invoice: {line.draft.packText}
            </p>
          ) : null}
        </div>

        {/* Apply / Skip toggle. */}
        <div className="inline-flex shrink-0 gap-1 rounded-[9px] bg-sand p-0.5">
          {(["apply", "skip"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => onChange({ action: mode })}
              className={cx(
                "rounded-[7px] px-2.5 py-1 text-[11px] font-bold capitalize transition",
                line.action === mode
                  ? "bg-surface-elevated text-ink shadow-sm"
                  : "text-label hover:text-ink",
              )}
            >
              {mode === "apply" ? (matched ? "Update" : "Add") : "Skip"}
            </button>
          ))}
        </div>
      </div>

      {!skipped ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
          {!matched ? (
            <label className="block">
              <span className={microLabel}>Unit</span>
              <select
                value={line.unitInput}
                onChange={(event) =>
                  onChange({
                    unitInput: event.target.value as "g" | "ml" | "each",
                  })
                }
                className={inputClass}
              >
                <option value="g">g</option>
                <option value="ml">ml</option>
                <option value="each">each</option>
              </select>
            </label>
          ) : (
            <label className="block">
              <span className={microLabel}>Pack size ({matched.unit})</span>
              <input
                value={line.packSizeInput}
                inputMode="decimal"
                onChange={(event) =>
                  onChange({ packSizeInput: event.target.value })
                }
                placeholder="12000"
                className={inputClass}
              />
            </label>
          )}

          {!matched ? (
            <label className="block">
              <span className={microLabel}>Pack size</span>
              <input
                value={line.packSizeInput}
                inputMode="decimal"
                onChange={(event) =>
                  onChange({ packSizeInput: event.target.value })
                }
                placeholder="12000"
                className={inputClass}
              />
            </label>
          ) : null}

          <label className="block">
            <span className={microLabel}>Pack cost ($)</span>
            <input
              value={line.packCostInput}
              inputMode="decimal"
              onChange={(event) => onChange({ packCostInput: event.target.value })}
              placeholder="28.80"
              className={cx(
                inputClass,
                priceMissing && "border-warm text-warm-deep",
              )}
            />
          </label>

          {/* was → now cost per unit. */}
          <div className="pb-1.5 text-right">
            <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-label">
              Cost / unit
            </p>
            <p className="mt-0.5 text-sm">
              {matched && matched.oldUnitCostCents !== null ? (
                <span className="text-muted line-through">
                  {formatUnitCost(matched.oldUnitCostCents)}
                </span>
              ) : null}
              {matched && matched.oldUnitCostCents !== null ? (
                <span className="mx-1 text-muted">→</span>
              ) : null}
              <span className="font-bold text-ink">
                {newUnitCost === null ? "—" : formatUnitCost(newUnitCost)}
              </span>
            </p>
          </div>
        </div>
      ) : null}

      {priceMissing ? (
        <p className="mt-1.5 text-xs font-medium text-warm-deep">
          Enter the pack cost, or skip this line.
        </p>
      ) : null}
    </li>
  );
}

/* ========================================================================== */
/* Success                                                                     */
/* ========================================================================== */

function SuccessPanel({
  stats,
  onScanAnother,
}: {
  stats: ApplyStats;
  onScanAnother: () => void;
}) {
  const shift =
    stats.marginShiftPts === null
      ? "—"
      : `${stats.marginShiftPts > 0 ? "+" : ""}${stats.marginShiftPts} pts`;
  const shiftTone =
    stats.marginShiftPts === null || stats.marginShiftPts === 0
      ? "text-ink"
      : stats.marginShiftPts > 0
        ? "text-success-deep"
        : "text-warm-deep";

  return (
    <section className="py-8">
      <div className="rounded-card border border-[var(--color-success)]/30 bg-[var(--color-success)]/8 p-6 text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-success)]/15 text-lg text-success-deep">
          ✓
        </div>
        <h2 className="mt-3 font-display text-lg font-extrabold text-ink">
          Costs updated{stats.supplier ? ` from ${stats.supplier}` : ""}
        </h2>
        <p className="mt-1 text-sm text-muted">
          Every dish that uses these ingredients has been re-costed.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Stat label="Lines updated" value={String(stats.linesUpdated)} />
          <Stat label="Dishes recosted" value={String(stats.dishesRecosted)} />
          <Stat label="Margin shift" value={shift} valueClass={shiftTone} />
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" onClick={onScanAnother}>
          Scan another
        </Button>
        <Link href="/dashboard/stock" className={buttonStyles("ghost", "md")}>
          Back to Stock
        </Link>
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-[14px] border border-line bg-surface-elevated p-4 shadow-card">
      <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-label">
        {label}
      </p>
      <p
        className={cx(
          "mt-1.5 font-display text-2xl font-extrabold",
          valueClass ?? "text-ink",
        )}
      >
        {value}
      </p>
    </div>
  );
}
