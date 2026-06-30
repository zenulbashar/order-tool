"use client";

import { Button } from "@/app/_components/button";

/**
 * Up/down reorder control shared by every level of the menu editor (categories,
 * items, sizes, modifier groups, options). Each arrow is its own tiny form that
 * posts the existing venue-scoped move* server action — passed in as `action` —
 * so reordering keeps working exactly as before. Presentational only; it holds
 * no state of its own.
 */
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
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          disabled={isFirst}
          aria-label={`Move ${label} up`}
        >
          ↑
        </Button>
      </form>
      <form action={action}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="direction" value="down" />
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          disabled={isLast}
          aria-label={`Move ${label} down`}
        >
          ↓
        </Button>
      </form>
    </div>
  );
}
