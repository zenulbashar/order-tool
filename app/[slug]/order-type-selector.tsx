"use client";

import type { OrderType } from "./types";

const fieldClass =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900";

/**
 * Pickup vs Dine-in. Dine-in shows a free-text table label, seeded from the
 * ?table= query param (a future QR deep-link). This is UI state only in 2a;
 * nothing is persisted.
 */
export function OrderTypeSelector({
  orderType,
  onOrderType,
  tableLabel,
  onTableLabel,
}: {
  orderType: OrderType;
  onOrderType: (next: OrderType) => void;
  tableLabel: string;
  onTableLabel: (next: string) => void;
}) {
  const options: { value: OrderType; label: string }[] = [
    { value: "pickup", label: "Pickup" },
    { value: "dinein", label: "Dine-in" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
        {options.map((option) => {
          const isActive = option.value === orderType;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onOrderType(option.value)}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                isActive ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
              }`}
              style={isActive ? { color: "var(--brand)" } : undefined}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {orderType === "dinein" ? (
        <label className="block text-sm font-medium text-gray-900">
          Table number
          <input
            type="text"
            inputMode="text"
            maxLength={40}
            value={tableLabel}
            onChange={(event) => onTableLabel(event.target.value)}
            placeholder="e.g. 12"
            className={`mt-1 ${fieldClass}`}
          />
        </label>
      ) : null}
    </div>
  );
}
