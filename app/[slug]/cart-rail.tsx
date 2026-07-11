"use client";

import Link from "next/link";

import { formatCents } from "@/lib/validation";

import { useCart } from "./cart-provider";

/**
 * Persistent desktop order rail (Direction A). Lives in the storefront's `lg`
 * body grid as a sticky right column, so building an order never hides the menu
 * and the running total is always in view. Below `lg` it isn't rendered — the
 * mobile CartBar + slide-in CartReview drawer take over (see storefront.tsx),
 * so the two never show at once.
 *
 * Reads the same cart state as the drawer (useCart); line totals are provisional
 * and the server recomputes at order time, exactly as in CartReview. The primary
 * "Checkout" CTA is deliberately INK (not the venue --brand): it stays identical
 * and trustworthy at every venue and can't be broken by a bad brand colour.
 */
export function CartRail({
  slug,
  tableLabel,
  conciergeEnabled,
  onAskConcierge,
}: {
  slug: string;
  tableLabel: string;
  conciergeEnabled: boolean;
  onAskConcierge: () => void;
}) {
  const { displayLines, subtotalCents, count } = useCart();

  const table = tableLabel.trim();
  const checkoutHref = `/${slug}/checkout${
    table ? `?type=dinein&table=${encodeURIComponent(table)}` : ""
  }`;

  return (
    <aside
      aria-label="Your order"
      className="hidden lg:block"
    >
      <div className="sticky top-[76px] max-h-[calc(100dvh-96px)] space-y-3 overflow-y-auto pb-2">
        <div className="rounded-card border border-sand bg-surface-elevated shadow-card">
          <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-4">
            <h2 className="font-display text-lg font-semibold tracking-tight text-ink">
              Your order
            </h2>
            {table ? (
              <span className="rounded-pill bg-[var(--color-success)]/12 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-success-deep">
                Table {table}
              </span>
            ) : null}
          </div>

          {count === 0 ? (
            <p className="px-5 pb-5 pt-1 text-sm text-muted">
              Your order&rsquo;s empty — add a dish to get started.
            </p>
          ) : (
            <>
              <ul className="border-t border-sand px-5 py-1">
                {displayLines.map((line) => {
                  const sub = [
                    line.variantName,
                    ...line.options.map((o) => o.name),
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <li
                      key={line.lineId}
                      className="flex items-start gap-3 border-b border-sand/70 py-2.5 last:border-b-0"
                    >
                      <span className="mt-0.5 flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-pill bg-[color-mix(in_srgb,var(--brand)_16%,transparent)] font-display text-xs font-bold text-[var(--action)]">
                        {line.quantity}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-semibold text-ink">
                          {line.itemName}
                        </p>
                        {sub ? (
                          <p className="mt-0.5 truncate text-[11px] text-label">
                            {sub}
                          </p>
                        ) : null}
                      </div>
                      <span className="shrink-0 text-sm text-ink">
                        ${formatCents(line.lineCents)}
                      </span>
                    </li>
                  );
                })}
              </ul>

              <div className="space-y-2 border-t border-sand px-5 py-4">
                <div className="flex items-center justify-between text-sm text-muted">
                  <span>Subtotal</span>
                  <span>${formatCents(subtotalCents)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-display text-[17px] font-semibold text-ink">
                    Total
                  </span>
                  <span className="font-display text-[17px] font-semibold text-ink">
                    ${formatCents(subtotalCents)}
                  </span>
                </div>
                <Link
                  href={checkoutHref}
                  className="mt-1 flex w-full items-center justify-center gap-2 rounded-[14px] bg-[var(--color-forest)] px-4 py-3.5 text-sm font-semibold text-surface transition hover:-translate-y-px hover:shadow-lift"
                >
                  <span>Checkout</span>
                  <span className="font-display text-accent">
                    ${formatCents(subtotalCents)}
                  </span>
                </Link>
                <p className="text-center text-[11px] text-label">
                  Estimated — prices are confirmed at checkout. Secured by Stripe.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Concierge nudge — opens the floating concierge. Only shown when the
            concierge is available for this venue. */}
        {conciergeEnabled ? (
          <button
            type="button"
            onClick={onAskConcierge}
            className="block w-full rounded-card border border-[#eccbb8] bg-[#f7e7de] px-4 py-3 text-left text-xs text-[var(--color-accent-deep)] transition hover:brightness-[0.98]"
          >
            <span className="mr-1 text-accent">✦</span>
            Not sure what to eat? Let Prompt2Eat build an order from a craving.
          </button>
        ) : null}
      </div>
    </aside>
  );
}
