"use client";

import { useActionState, useState, useTransition } from "react";

import { Button } from "@/app/_components/button";
import { ConfirmSubmit } from "@/app/_components/confirm-submit";
import { cx } from "@/app/_components/cx";
import { Input } from "@/app/_components/input";
import { normaliseStationCode } from "@/lib/orders/station";

import {
  createStation,
  deleteStation,
  setStationLabel,
  setStationPrinting,
  type StationsSettingsState,
  updateStation,
} from "./actions";

const initialState: StationsSettingsState = {};

const microLabel =
  "mb-1 block font-mono text-[9px] font-bold uppercase tracking-wider text-label";

type StationRow = {
  id: string;
  name: string;
  code: string;
  labelPrintEnabled: boolean;
};

/**
 * Manage the venue's prep stations after onboarding: the master print switch, a
 * per-station "print label" toggle, rename/re-code, delete, and add. Every write
 * goes through a scoped server action; the list re-renders from the server via
 * revalidatePath, so this component holds only per-row edit/UI state.
 */
export function StationsEditor({
  stations,
  printingEnabled,
}: {
  stations: StationRow[];
  printingEnabled: boolean;
}) {
  const [adding, setAdding] = useState(stations.length === 0);

  return (
    <div className="space-y-6">
      <MasterToggle enabled={printingEnabled} />

      <div className="space-y-3">
        {stations.length === 0 ? (
          <p className="rounded-card border border-dashed border-line p-6 text-center text-sm text-muted">
            No stations yet. Add the counters that plate their own items (kebab,
            grill, fryer…) to print a separate label for each.
          </p>
        ) : (
          stations.map((station) => (
            // Key includes the saved name/code so a successful rename remounts
            // the card, which resets its local `editing` state → the edit form
            // closes on save with no effect/success-flag plumbing.
            <StationCard
              key={`${station.id}:${station.name}:${station.code}`}
              station={station}
            />
          ))
        )}
      </div>

      {adding ? (
        <div className="rounded-card border border-line bg-surface-elevated p-4">
          <p className="mb-3 font-display text-sm font-semibold text-ink">
            Add a station
          </p>
          {/* Keyed on the list length: a successful add grows the list and
              remounts this form, clearing it for the next entry. */}
          <StationForm key={stations.length} onDone={() => setAdding(false)} />
        </div>
      ) : (
        <Button
          type="button"
          variant="secondary"
          onClick={() => setAdding(true)}
        >
          ＋ Add station
        </Button>
      )}
    </div>
  );
}

/** Master on/off for the whole feature — native form-submit toggle. */
function MasterToggle({ enabled }: { enabled: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-start justify-between gap-4 rounded-card border border-line bg-surface-elevated p-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">Station label printing</p>
        <p className="mt-0.5 text-sm text-muted">
          When on, the orders desk can print a packaging docket (all items) and a
          separate sticky label for each station, alongside the customer receipt.
        </p>
      </div>
      <form
        action={(formData) =>
          startTransition(async () => {
            await setStationPrinting(formData);
          })
        }
      >
        <input type="hidden" name="enable" value={enabled ? "off" : "on"} />
        <button
          type="submit"
          role="switch"
          aria-checked={enabled}
          aria-label="Station label printing"
          disabled={pending}
          className="flex items-center gap-2.5 text-sm font-semibold text-ink disabled:opacity-60"
        >
          <span
            className={cx(
              "relative h-6 w-10 shrink-0 rounded-pill transition-colors",
              enabled ? "bg-forest" : "bg-line",
            )}
          >
            <span
              className={cx(
                "absolute top-0.5 h-5 w-5 rounded-full bg-surface-elevated shadow-sm transition-all",
                enabled ? "right-0.5" : "left-0.5",
              )}
            />
          </span>
          {enabled ? "On" : "Off"}
        </button>
      </form>
    </div>
  );
}

/** One station in the list: name + code, its label toggle, edit + delete. */
function StationCard({ station }: { station: StationRow }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div className="rounded-card border border-line bg-surface-elevated p-4">
        <StationForm station={station} onDone={() => setEditing(false)} />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface-elevated p-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-9 min-w-9 items-center justify-center rounded-control bg-ink px-2 font-mono text-sm font-bold text-surface">
          {station.code}
        </span>
        <span className="truncate font-display text-base font-semibold text-ink">
          {station.name}
        </span>
      </div>
      <div className="flex items-center gap-4">
        <LabelToggle station={station} />
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs font-semibold text-[var(--action)] hover:underline"
        >
          Edit
        </button>
        <form action={deleteStation}>
          <input type="hidden" name="id" value={station.id} />
          <ConfirmSubmit
            message={`Delete the "${station.name}" station? This can't be undone.`}
          >
            Delete
          </ConfirmSubmit>
        </form>
      </div>
    </div>
  );
}

/** Per-station "print sticky label" switch — native form-submit toggle. */
function LabelToggle({ station }: { station: StationRow }) {
  const [pending, startTransition] = useTransition();
  const enabled = station.labelPrintEnabled;

  return (
    <form
      action={(formData) =>
        startTransition(async () => {
          await setStationLabel(formData);
        })
      }
    >
      <input type="hidden" name="id" value={station.id} />
      <input type="hidden" name="enable" value={enabled ? "off" : "on"} />
      <button
        type="submit"
        role="switch"
        aria-checked={enabled}
        aria-label={`Print label for ${station.name}`}
        disabled={pending}
        className="flex items-center gap-2 text-xs font-semibold text-muted disabled:opacity-60"
      >
        <span
          className={cx(
            "relative h-5 w-9 shrink-0 rounded-pill transition-colors",
            enabled ? "bg-forest" : "bg-line",
          )}
        >
          <span
            className={cx(
              "absolute top-0.5 h-4 w-4 rounded-full bg-surface-elevated shadow-sm transition-all",
              enabled ? "right-0.5" : "left-0.5",
            )}
          />
        </span>
        Label
      </button>
    </form>
  );
}

/** Add (no `station`) or rename/re-code (with `station`) a station. */
function StationForm({
  station,
  onDone,
}: {
  station?: StationRow;
  onDone?: () => void;
}) {
  const isEdit = Boolean(station);
  const [state, formAction, pending] = useActionState(
    isEdit ? updateStation : createStation,
    initialState,
  );

  const [name, setName] = useState(station?.name ?? "");
  const [code, setCode] = useState(station?.code ?? "");
  // Track whether the owner has hand-edited the code, so it stops auto-tracking
  // the name once they take control of it (existing stations start "touched").
  const [codeTouched, setCodeTouched] = useState(Boolean(station));

  // No success effect: on a successful write the server re-renders and the
  // parent's `key` (list length / saved name+code) remounts this form, which
  // clears the add form or closes an edited card.

  return (
    <form action={formAction} className="space-y-3">
      {station ? <input type="hidden" name="id" value={station.id} /> : null}
      <div className="flex flex-wrap items-end gap-3">
        <label className="block min-w-0 flex-1">
          <span className={microLabel}>Station name</span>
          <Input
            name="name"
            type="text"
            required
            maxLength={40}
            value={name}
            onChange={(e) => {
              const next = e.target.value;
              setName(next);
              if (!codeTouched) setCode(normaliseStationCode("", next));
            }}
            placeholder="Kebab"
          />
        </label>
        <label className="block w-24">
          <span className={microLabel}>Code</span>
          <Input
            name="code"
            type="text"
            maxLength={3}
            value={code}
            onChange={(e) => {
              setCode(
                e.target.value
                  .replace(/[^a-zA-Z0-9]/g, "")
                  .toUpperCase()
                  .slice(0, 3),
              );
              setCodeTouched(true);
            }}
            placeholder="K"
            aria-label="Station code"
          />
        </label>
      </div>

      {state.error ? (
        <p className="text-sm text-[var(--color-warm)]" role="alert">
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <Button
          type="submit"
          variant="primary"
          loading={pending}
          loadingLabel="Saving…"
        >
          {isEdit ? "Save" : "Add station"}
        </Button>
        {onDone ? (
          <Button type="button" variant="ghost" onClick={onDone}>
            {isEdit ? "Cancel" : "Done"}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
