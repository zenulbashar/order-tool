import Link from "next/link";

import { cardStyles } from "@/app/_components/card";
import { cx } from "@/app/_components/cx";
import type { GmbChecklistItem } from "@/lib/gmb-checklist";

import { toggleGmbChecklistItem } from "../actions";

/**
 * Google Business Profile checklist card (SEO & AEO studio v2, item 4 — the
 * in-dash version of docs/seo/GMB_PLAYBOOK.md). Storefront-derived rows show a
 * fix link when missing; manual rows are a native form toggle that posts the
 * server action, so the card needs no client island.
 */
export function GmbChecklist({
  items,
  done,
  total,
  storefrontUrl,
}: {
  items: GmbChecklistItem[];
  done: number;
  total: number;
  storefrontUrl: string;
}) {
  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-base font-semibold text-ink">
            Google Business Profile
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            The map listing is the other half of local search. Keep it complete
            and identical to your storefront:{" "}
            <span className="font-mono text-ink">{storefrontUrl}</span>
          </p>
        </div>
        <p className="font-mono text-micro font-bold uppercase tracking-wider text-label">
          {done} of {total} done
        </p>
      </div>
      <div className={cardStyles({ className: "mt-3 p-0" })}>
        <ul className="divide-y divide-line/60">
          {items.map((item) => (
            <li key={item.key} className="flex items-start gap-3 px-4 py-3">
              {item.source === "manual" ? (
                <form action={toggleGmbChecklistItem} className="mt-0.5 shrink-0">
                  <input type="hidden" name="key" value={item.key} />
                  <button
                    type="submit"
                    role="checkbox"
                    aria-checked={item.done}
                    aria-label={item.title}
                    className={cx(
                      "flex h-5 w-5 items-center justify-center rounded-sm border text-xs font-bold transition-colors",
                      item.done
                        ? "border-forest bg-forest text-white"
                        : "border-line bg-surface-elevated text-transparent hover:border-ink",
                    )}
                  >
                    ✓
                  </button>
                </form>
              ) : (
                <span
                  aria-hidden
                  className={cx(
                    "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border text-xs font-bold",
                    item.done
                      ? "border-forest bg-forest text-white"
                      : "border-line bg-surface-elevated text-transparent",
                  )}
                >
                  ✓
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p
                  className={cx(
                    "text-sm font-medium",
                    item.done ? "text-muted line-through" : "text-ink",
                  )}
                >
                  {item.title}
                </p>
                <p className="mt-0.5 text-xs text-muted">{item.detail}</p>
              </div>
              {item.source === "storefront" ? (
                item.done ? (
                  <span className="shrink-0 font-mono text-2xs font-bold uppercase tracking-wider text-label">
                    From storefront
                  </span>
                ) : (
                  <Link
                    href={item.href ?? "/dashboard/settings"}
                    className="shrink-0 text-xs font-semibold text-accent-deep underline-offset-2 hover:underline"
                  >
                    Add it
                  </Link>
                )
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
