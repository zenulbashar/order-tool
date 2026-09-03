/**
 * Owner-discount form parsing + validation, shared by the create and update
 * actions (audit R3).
 *
 * Extracted rather than copied. The create action had this inline, and adding an
 * edit path meant a second copy of every money rule — percent ≤ 100, value > 0
 * AFTER cents rounding, non-negative minimum spend. That is the exact shape this
 * audit keeps finding (S5, S6, D2): a control that is correct in one place and
 * absent in the neighbouring place reaching the same state. One copy, one test.
 *
 * Pure — no db, no auth, no "use server" — so it can be driven directly.
 */

import { dayBoundsInTimeZone } from "@/lib/time";

export type DiscountInput = {
  name: string;
  code: string;
  type: "percent" | "amount";
  /** Percent as a whole number, or a dollar amount already in CENTS. */
  value: number;
  minBasketCents: number;
  audience: "all" | "new";
  endsAt: Date | null;
};

export type ParseResult =
  | { ok: true; value: DiscountInput }
  | { ok: false; error: string };

/** Codes are stored uppercased; letters + digits only, no spaces. */
export const CODE_RE = /^[A-Z0-9]{3,24}$/;

export function parseDiscountForm(
  formData: FormData,
  /** The venue's IANA zone — the "Ends" date is a day on ITS calendar. */
  timeZone: string,
): ParseResult {
  const name = String(formData.get("name") ?? "").trim();
  const code = String(formData.get("code") ?? "")
    .trim()
    .toUpperCase();
  const type = formData.get("type") === "amount" ? "amount" : "percent";
  const rawValue = Number(String(formData.get("value") ?? "").trim());
  const minBasketRaw = String(formData.get("minBasket") ?? "").trim();
  const minBasketDollars = minBasketRaw === "" ? 0 : Number(minBasketRaw);
  const audience = formData.get("audience") === "new" ? "new" : "all";
  const endsAtRaw = String(formData.get("endsAt") ?? "").trim();

  if (name.length === 0 || name.length > 80) {
    return { ok: false, error: "Enter a name (up to 80 characters)." };
  }
  if (!CODE_RE.test(code)) {
    return { ok: false, error: "Code must be 3–24 letters or numbers, no spaces." };
  }
  if (!Number.isFinite(rawValue) || rawValue <= 0) {
    return { ok: false, error: "Enter a discount value above 0." };
  }
  if (type === "percent" && rawValue > 100) {
    return { ok: false, error: "A percentage can’t be over 100." };
  }
  const value =
    type === "percent" ? Math.round(rawValue) : Math.round(rawValue * 100);
  if (value <= 0) {
    // e.g. $0.004 → 0 cents; catch it here rather than tripping the DB
    // value>0 check (which the generic catch would mislabel as a dup code).
    return { ok: false, error: "Enter a discount value above 0." };
  }
  if (!Number.isFinite(minBasketDollars) || minBasketDollars < 0) {
    return { ok: false, error: "Minimum spend can’t be negative." };
  }
  const minBasketCents = Math.round(minBasketDollars * 100);

  let endsAt: Date | null = null;
  if (endsAtRaw) {
    // The last day the code works, INCLUSIVE, in the venue's zone. Parsed with
    // new Date() this was UTC midnight — mid-morning locally — so the code
    // stopped hours before the day the owner advertised had ended.
    const bounds = dayBoundsInTimeZone(endsAtRaw, timeZone);
    if (!bounds) {
      return { ok: false, error: "Enter a valid end date." };
    }
    endsAt = bounds.end;
  }

  return {
    ok: true,
    value: { name, code, type, value, minBasketCents, audience, endsAt },
  };
}
