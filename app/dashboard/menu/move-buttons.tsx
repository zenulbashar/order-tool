"use client";

/**
 * Up/down reorder control shared by every level of the menu editor (categories,
 * items, sizes, modifier groups, options). Each arrow is its own tiny form that
 * posts the existing venue-scoped move* server action — passed in as `action` —
 * so reordering keeps working exactly as before. Presentational only; it holds
 * no state of its own.
 */

const secondaryButton =
  "rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40";

export function MoveButtons({
  action,
  id,
  isFirst,
  isLast,
  label,
}: {
  action: (formData: FormData) => void;
  id: string;
  isFirst: boolean;
  isLast: boolean;
  label: string;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <form action={action}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="direction" value="up" />
        <button
          type="submit"
          className={secondaryButton}
          disabled={isFirst}
          aria-label={`Move ${label} up`}
        >
          ↑
        </button>
      </form>
      <form action={action}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="direction" value="down" />
        <button
          type="submit"
          className={secondaryButton}
          disabled={isLast}
          aria-label={`Move ${label} down`}
        >
          ↓
        </button>
      </form>
    </div>
  );
}
