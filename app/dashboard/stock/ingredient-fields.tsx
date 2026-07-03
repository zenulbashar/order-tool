import { Checkbox } from "@/app/_components/selection-controls";
import { formatCents } from "@/lib/validation";

import type { Ingredient } from "@/lib/db/schema";

const label =
  "mb-1 block font-mono text-[9px] font-bold uppercase tracking-wider text-label";
const control =
  "w-full rounded-input border border-line bg-surface-elevated px-2.5 py-2 text-sm text-ink shadow-sm focus-visible:border-[var(--color-accent)] focus-visible:shadow-[var(--focus-ring-input)] focus-visible:outline-none";

/**
 * The ingredient field set (name, unit, pack size, pack cost, yield, supplier,
 * packaging) — shared by the add and inline-edit forms so the FormData contract
 * is identical in both. Pack fields are optional (an ingredient can be added
 * name-only and costed later). Server-safe (no hooks) — the form tag + action
 * live in the caller.
 */
export function IngredientFields({
  defaults,
}: {
  defaults?: Pick<
    Ingredient,
    | "name"
    | "unit"
    | "packSize"
    | "packCostCents"
    | "yieldPct"
    | "supplier"
    | "isPackaging"
    | "parLevel"
  >;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
      <label className="col-span-2 block">
        <span className={label}>Ingredient</span>
        <input
          name="name"
          required
          maxLength={120}
          defaultValue={defaults?.name ?? ""}
          placeholder="Oat milk"
          className={control}
        />
      </label>
      <label className="block">
        <span className={label}>Unit</span>
        <select name="unit" defaultValue={defaults?.unit ?? "g"} className={control}>
          <option value="g">g</option>
          <option value="ml">ml</option>
          <option value="each">each</option>
        </select>
      </label>
      <label className="block">
        <span className={label}>Pack size</span>
        <input
          name="packSize"
          inputMode="decimal"
          defaultValue={defaults?.packSize ?? ""}
          placeholder="12000"
          className={control}
        />
      </label>
      <label className="block">
        <span className={label}>Pack cost</span>
        <input
          name="packCost"
          inputMode="decimal"
          defaultValue={
            defaults?.packCostCents != null
              ? formatCents(defaults.packCostCents)
              : ""
          }
          placeholder="28.80"
          className={control}
        />
      </label>
      <label className="block">
        <span className={label}>Yield %</span>
        <input
          name="yieldPct"
          inputMode="numeric"
          defaultValue={defaults?.yieldPct ?? 100}
          placeholder="100"
          className={control}
        />
      </label>
      <label className="block">
        <span className={label}>Par (reorder at)</span>
        <input
          name="parLevel"
          inputMode="decimal"
          defaultValue={defaults?.parLevel ?? ""}
          placeholder="2000"
          className={control}
        />
      </label>
      <label className="col-span-2 block sm:col-span-3">
        <span className={label}>Supplier</span>
        <input
          name="supplier"
          maxLength={120}
          defaultValue={defaults?.supplier ?? ""}
          placeholder="Riverline Dairy"
          className={control}
        />
      </label>
      <label className="col-span-2 flex items-center gap-2 self-end pb-2 text-sm text-ink sm:col-span-3">
        <Checkbox name="isPackaging" defaultChecked={defaults?.isPackaging} />
        <span>This is packaging (cups, lids…), not food</span>
      </label>
    </div>
  );
}
