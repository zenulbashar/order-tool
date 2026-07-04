"use client";

import { useState } from "react";

import { Button } from "@/app/_components/button";
import { formatCents } from "@/lib/validation";

import { upsertProduct } from "./actions";

import type { MarketplaceProduct } from "@/lib/db/schema";

const CATEGORIES = ["signage", "tablet", "stand", "consumable", "banner", "other"];

const control =
  "w-full rounded-input border border-line bg-surface-elevated px-2.5 py-2 text-sm text-ink shadow-sm focus-visible:border-[var(--color-accent)] focus-visible:shadow-[var(--focus-ring-input)] focus-visible:outline-none";
const microLabel =
  "mb-1 block font-mono text-[9px] font-bold uppercase tracking-wider text-label";

/**
 * Admin catalog product form (Track F). Reused for create (no product) and edit
 * (with product). Collapsed to a button until opened, so the admin page stays a
 * compact list.
 */
export function ProductForm({ product }: { product?: MarketplaceProduct }) {
  const [open, setOpen] = useState(false);
  const editing = Boolean(product);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          editing
            ? "rounded-control px-2 py-1 text-xs font-bold text-ink hover:bg-sand"
            : "w-full rounded-input border border-dashed border-line-strong px-4 py-2.5 text-center text-xs font-bold text-ink transition hover:bg-hover-secondary"
        }
      >
        {editing ? "Edit" : "＋ Add product"}
      </button>
    );
  }

  return (
    <form
      action={upsertProduct}
      onSubmit={() => setOpen(false)}
      className="space-y-3 rounded-card border border-line bg-surface-elevated p-4 shadow-sm"
    >
      {product ? <input type="hidden" name="id" value={product.id} /> : null}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="col-span-2 block">
          <span className={microLabel}>Name</span>
          <input name="name" required defaultValue={product?.name ?? ""} className={control} />
        </label>
        <label className="block">
          <span className={microLabel}>Category</span>
          <select name="category" defaultValue={product?.category ?? "other"} className={control}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={microLabel}>Price ($)</span>
          <input
            name="price"
            inputMode="decimal"
            required
            defaultValue={product ? formatCents(product.priceCents) : ""}
            placeholder="199.00"
            className={control}
          />
        </label>
        <label className="block">
          <span className={microLabel}>Unit label</span>
          <input name="unitLabel" defaultValue={product?.unitLabel ?? ""} placeholder="per 100" className={control} />
        </label>
        <label className="block">
          <span className={microLabel}>Supplier</span>
          <input name="supplier" defaultValue={product?.supplier ?? ""} className={control} />
        </label>
        <label className="col-span-2 block">
          <span className={microLabel}>Image URL</span>
          <input name="imageUrl" defaultValue={product?.imageUrl ?? ""} placeholder="https://…" className={control} />
        </label>
        <label className="col-span-2 block sm:col-span-4">
          <span className={microLabel}>Description</span>
          <textarea
            name="description"
            rows={2}
            defaultValue={product?.description ?? ""}
            className={`${control} resize-none`}
          />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={product ? product.isActive : true}
          className="accent-[var(--color-forest)]"
        />
        Visible in the shop
      </label>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" size="sm">
          {editing ? "Save" : "Add product"}
        </Button>
      </div>
    </form>
  );
}
