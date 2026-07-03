"use client";

import { useState } from "react";

import { Button } from "@/app/_components/button";

import { createIngredient } from "./actions";
import { IngredientFields } from "./ingredient-fields";

/**
 * "+ Add ingredient" — a dashed prompt that expands into the shared field set.
 * The design's promise: "a name, pack size and pack cost is all it needs"
 * (pack fields are optional, so name-only is valid — cost it later).
 */
export function AddIngredient() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-input border border-dashed border-line-strong px-4 py-3 text-center text-xs font-bold text-ink transition hover:bg-hover-secondary"
      >
        ＋ Add ingredient — a name, pack size and pack cost is all it needs
      </button>
    );
  }

  return (
    <div className="rounded-card border border-line bg-surface-elevated p-4 shadow-card">
      <form action={createIngredient} className="space-y-3">
        <IngredientFields />
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm">
            Add ingredient
          </Button>
        </div>
      </form>
    </div>
  );
}
