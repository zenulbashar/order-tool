import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { platformSettings } from "@/lib/db/schema";

/**
 * Typed accessors over the platform_settings key-value table (Track E). Each
 * setting owns its key, parsing, and default here, so an absent row always
 * reads as the default and callers never touch raw strings.
 */

/**
 * D1 — who wears Square's 1% non-Square-tender Orders-API fee. `absorbed` =
 * the platform absorbs it (venue copy says mirroring is included); `passed_
 * through` = venues are informed the fee applies to them. A COPY/COMMERCIAL
 * switch only — neither mode adds any customer-facing per-order fee (RBA-safe),
 * and nothing on the money path reads it.
 */
export type SquareFeeMode = "absorbed" | "passed_through";
const SQUARE_FEE_MODE_KEY = "square_fee_mode";
const SQUARE_FEE_MODE_DEFAULT: SquareFeeMode = "absorbed";

export async function getSquareFeeMode(): Promise<SquareFeeMode> {
  const [row] = await db
    .select({ value: platformSettings.value })
    .from(platformSettings)
    .where(eq(platformSettings.key, SQUARE_FEE_MODE_KEY))
    .limit(1);
  return row?.value === "passed_through" ? "passed_through" : SQUARE_FEE_MODE_DEFAULT;
}

export async function setSquareFeeMode(mode: SquareFeeMode): Promise<void> {
  await db
    .insert(platformSettings)
    .values({ key: SQUARE_FEE_MODE_KEY, value: mode })
    .onConflictDoUpdate({
      target: platformSettings.key,
      set: { value: mode, updatedAt: new Date() },
    });
}
