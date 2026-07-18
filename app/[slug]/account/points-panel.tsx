import { formatCents } from "@/lib/validation";

import type { PointsActivity } from "@/lib/loyalty/balance";

const REASON_LABEL: Record<PointsActivity["reason"], string> = {
  earn: "Earned",
  redeem: "Redeemed",
  adjust: "Adjustment",
};

const dateFmt = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
});

/**
 * The signed-in customer's loyalty balance + recent activity, shown at the top
 * of their account when the venue has loyalty enabled. Read-only — the balance
 * is derived from the append-only ledger (getPointsBalance), never a stored
 * counter. Redemption at checkout ships in a later build.
 */
export function PointsPanel({
  balance,
  available,
  redeemValueCents,
  activity,
}: {
  balance: number;
  // Points spendable right now = balance minus any reserved on pending orders.
  available: number;
  redeemValueCents: number;
  activity: PointsActivity[];
}) {
  const onHold = Math.max(0, balance - available);

  return (
    <section className="px-5 pb-1 pt-2">
      <div className="rounded-card border border-line bg-surface-elevated p-4 shadow-card">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-label">
              Your points
            </p>
            <p className="p2e-count mt-1 font-display text-3xl font-extrabold leading-none text-ink">
              {balance.toLocaleString("en-AU")}
            </p>
          </div>
          {balance > 0 ? (
            <p className="shrink-0 text-right text-xs font-semibold text-muted">
              {onHold > 0
                ? `$${formatCents(available * redeemValueCents)} to spend`
                : `worth $${formatCents(available * redeemValueCents)}`}
              {onHold > 0 ? (
                <span className="mt-0.5 block text-[11px] font-normal text-muted">
                  {onHold.toLocaleString("en-AU")} on hold in a pending order
                </span>
              ) : null}
            </p>
          ) : null}
        </div>

        {activity.length > 0 ? (
          <ul className="mt-3 divide-y divide-line border-t border-line">
            {activity.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-3 py-1.5 text-sm"
              >
                <span className="text-muted">
                  {REASON_LABEL[row.reason]} · {dateFmt.format(row.createdAt)}
                </span>
                <span
                  className={`font-mono font-semibold ${
                    row.deltaPoints >= 0 ? "text-success-deep" : "text-ink"
                  }`}
                >
                  {row.deltaPoints >= 0 ? "+" : ""}
                  {row.deltaPoints.toLocaleString("en-AU")}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-muted">
            Order to start earning points.
          </p>
        )}
      </div>
    </section>
  );
}
