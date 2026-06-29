/**
 * Presentational "Step N of 5" indicator for the onboarding wizard (Phase 3a).
 * The five steps are fixed by the design; only steps 1-2 are built this phase,
 * but the full set is shown so the owner sees the whole journey. Pure — the
 * caller passes the current step number.
 */
const STEP_TITLES = [
  "Venue details",
  "Service style",
  "Import menu",
  "Choose a plan",
  "Go live",
] as const;

const TOTAL_STEPS = STEP_TITLES.length;

export function WizardProgress({ current }: { current: number }) {
  const title = STEP_TITLES[current - 1] ?? "";

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <p className="font-mono text-xs uppercase tracking-wide text-muted">
          Step {current} of {TOTAL_STEPS}
        </p>
        <p className="font-mono text-xs text-muted">{title}</p>
      </div>
      <ol className="flex gap-1.5" aria-hidden="true">
        {Array.from({ length: TOTAL_STEPS }, (_, index) => {
          const stepNumber = index + 1;
          const done = stepNumber <= current;
          return (
            <li
              key={stepNumber}
              className={`h-1.5 flex-1 rounded-full ${
                done ? "bg-forest" : "bg-sand"
              }`}
            />
          );
        })}
      </ol>
    </div>
  );
}
