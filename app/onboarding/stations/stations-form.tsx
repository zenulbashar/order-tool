"use client";

import { useActionState, useState } from "react";

import { Button } from "@/app/_components/button";
import { Input } from "@/app/_components/input";

import { saveStations } from "./actions";
import { MAX_STATIONS, type StationsState } from "./constants";

const initialState: StationsState = {};

type Row = { name: string; code: string; codeTouched: boolean };

type Defaults = {
  stations: { name: string; code: string }[];
  stickyPrint: boolean;
};

/** First alphanumeric of the name, uppercased — the auto-suggested code. */
function deriveCode(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 1);
}

const microLabel =
  "mb-1 block font-mono text-[9px] font-bold uppercase tracking-wider text-label";

/**
 * The onboarding "Stations" step, presented one question at a time:
 *   0. How many prep stations (apart from the front counter)?
 *   1..N. Name each station + confirm its code (auto-suggested from the name).
 *   N+1. Print a separate sticky label per station?
 *
 * All answers live in React state and are mirrored into hidden inputs so the
 * whole thing posts once, on the final screen, to saveStations. Choosing 0
 * stations short-circuits to a single submit (keeps today's one-ticket setup).
 */
export function StationsForm({ defaults }: { defaults: Defaults }) {
  const [state, formAction, pending] = useActionState(
    saveStations,
    initialState,
  );

  const [count, setCount] = useState(defaults.stations.length);
  const [rows, setRows] = useState<Row[]>(
    defaults.stations.map((s) => ({
      name: s.name,
      code: s.code,
      codeTouched: true,
    })),
  );
  const [stickyPrint, setStickyPrint] = useState(defaults.stickyPrint);

  // 0 = count · 1..count = name station (step-1) · count+1 = sticky question.
  const [step, setStep] = useState(0);

  // Grow/shrink the rows array to match a newly chosen count, preserving any
  // names/codes already entered and seeding blank rows for the rest.
  function applyCount(next: number) {
    const clamped = Math.max(0, Math.min(MAX_STATIONS, next));
    setCount(clamped);
    setRows((current) => {
      const grown = [...current];
      while (grown.length < clamped) {
        grown.push({ name: "", code: "", codeTouched: false });
      }
      grown.length = clamped;
      return grown;
    });
  }

  function editRow(index: number, patch: Partial<Row>) {
    setRows((current) =>
      current.map((row, i) => {
        if (i !== index) return row;
        const merged = { ...row, ...patch };
        // Keep the code tracking the name until the owner edits the code itself.
        if (patch.name !== undefined && !merged.codeTouched) {
          merged.code = deriveCode(patch.name);
        }
        return merged;
      }),
    );
  }

  const onCountScreen = step === 0;
  const onStickyScreen = count > 0 && step === count + 1;
  const nameIndex = step - 1; // valid when 1..count
  const onNameScreen = count > 0 && step >= 1 && step <= count;

  // The count screen submits directly when there are no stations to configure.
  const isTerminal = (onCountScreen && count === 0) || onStickyScreen;

  const currentNameValid =
    !onNameScreen || rows[nameIndex]?.name.trim().length > 0;

  return (
    <form action={formAction} className="space-y-6">
      {/* Hidden mirror of all answers — this is what actually posts. */}
      <input type="hidden" name="stationCount" value={count} />
      {rows.map((row, i) => (
        <div key={i} hidden>
          <input type="hidden" name={`name_${i}`} value={row.name} />
          <input type="hidden" name={`code_${i}`} value={row.code} />
        </div>
      ))}
      {stickyPrint ? (
        <input type="hidden" name="stickyPrint" value="on" />
      ) : null}

      {onCountScreen ? (
        <fieldset className="space-y-4">
          <legend className="space-y-1">
            <h2 className="font-display text-xl font-semibold tracking-tight text-ink">
              How many prep stations do you have?
            </h2>
            <p className="text-sm text-muted">
              Apart from the front counter — for example a kebab, grill, or fryer
              station that plates its own items. Choose 0 if everything comes from
              one place.
            </p>
          </legend>
          <div className="flex items-center justify-center gap-4 py-2">
            <button
              type="button"
              onClick={() => applyCount(count - 1)}
              disabled={count <= 0}
              aria-label="Fewer stations"
              className="flex h-11 w-11 items-center justify-center rounded-pill border border-line-strong text-xl font-bold text-ink transition hover:bg-hover-secondary disabled:opacity-40"
            >
              −
            </button>
            <span
              aria-live="polite"
              className="min-w-[3ch] text-center font-display text-5xl font-extrabold tabular-nums text-ink"
            >
              {count}
            </span>
            <button
              type="button"
              onClick={() => applyCount(count + 1)}
              disabled={count >= MAX_STATIONS}
              aria-label="More stations"
              className="flex h-11 w-11 items-center justify-center rounded-pill border border-line-strong text-xl font-bold text-ink transition hover:bg-hover-secondary disabled:opacity-40"
            >
              +
            </button>
          </div>
        </fieldset>
      ) : null}

      {onNameScreen && rows[nameIndex] ? (
        <fieldset className="space-y-4">
          <legend className="space-y-1">
            <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-label">
              Station {nameIndex + 1} of {count}
            </p>
            <h2 className="font-display text-xl font-semibold tracking-tight text-ink">
              What&rsquo;s this station called?
            </h2>
            <p className="text-sm text-muted">
              Its label is headed by the order number and this station&rsquo;s
              code, e.g. order 42 at Kebab prints “42-K”.
            </p>
          </legend>
          <label className="block">
            <span className={microLabel}>Station name</span>
            <Input
              autoFocus
              value={rows[nameIndex].name}
              onChange={(e) => editRow(nameIndex, { name: e.target.value })}
              placeholder="Kebab"
              maxLength={40}
            />
          </label>
          <label className="block max-w-[8rem]">
            <span className={microLabel}>Code</span>
            <Input
              value={rows[nameIndex].code}
              onChange={(e) =>
                editRow(nameIndex, {
                  code: e.target.value
                    .replace(/[^a-zA-Z0-9]/g, "")
                    .toUpperCase()
                    .slice(0, 3),
                  codeTouched: true,
                })
              }
              placeholder="K"
              maxLength={3}
            />
          </label>
        </fieldset>
      ) : null}

      {onStickyScreen ? (
        <fieldset className="space-y-4">
          <legend className="space-y-1">
            <h2 className="font-display text-xl font-semibold tracking-tight text-ink">
              Print a sticky label for each station?
            </h2>
            <p className="text-sm text-muted">
              Each station gets its own small label showing only its items (no
              prices), so it can go straight onto the plate or bag. You&rsquo;ll
              always still get the customer receipt and the packaging docket.
            </p>
          </legend>
          <div className="space-y-3">
            {[
              {
                value: true,
                title: "Yes, print station labels",
                description:
                  "One sticky label per station, headed by the order number + code.",
              },
              {
                value: false,
                title: "No, just the packaging docket",
                description:
                  "One docket lists every item so the counter assembles the order.",
              },
            ].map((option) => (
              <button
                key={String(option.value)}
                type="button"
                onClick={() => setStickyPrint(option.value)}
                aria-pressed={stickyPrint === option.value}
                className={`flex w-full items-start gap-3 rounded-card border p-4 text-left transition hover:bg-hover-secondary ${
                  stickyPrint === option.value
                    ? "border-[var(--color-accent)] bg-[var(--color-accent)]/8"
                    : "border-line bg-surface-elevated"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                    stickyPrint === option.value
                      ? "border-[var(--color-accent)]"
                      : "border-line-strong"
                  }`}
                >
                  {stickyPrint === option.value ? (
                    <span className="h-2 w-2 rounded-full bg-[var(--color-accent)]" />
                  ) : null}
                </span>
                <span className="space-y-0.5">
                  <span className="block text-sm font-medium text-ink">
                    {option.title}
                  </span>
                  <span className="block text-sm text-muted">
                    {option.description}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}

      {state.error ? (
        <p className="text-sm text-error" role="alert">
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        {step > 0 ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => setStep((s) => s - 1)}
          >
            ← Back
          </Button>
        ) : null}
        <div className="flex-1" />
        {isTerminal ? (
          <Button type="submit" variant="primary" loading={pending}>
            {count === 0 ? "Continue" : "Finish setup"}
          </Button>
        ) : (
          <Button
            type="button"
            variant="primary"
            disabled={onNameScreen && !currentNameValid}
            onClick={() => setStep((s) => s + 1)}
          >
            Next
          </Button>
        )}
      </div>
    </form>
  );
}
