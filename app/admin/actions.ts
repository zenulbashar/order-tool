"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { platformAuditLog } from "@/lib/db/schema";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import {
  getSquareFeeMode,
  setSquareFeeMode,
  type SquareFeeMode,
} from "@/lib/platform-settings";

const ADMIN_PATH = "/admin";

/**
 * Flip the D1 Square fee-cost mode (Track E). Admin-gated, audited: every
 * change appends a platform_audit_log row with who flipped it and from→to.
 */
export async function updateSquareFeeMode(formData: FormData): Promise<void> {
  const admin = await requirePlatformAdmin();

  const raw = formData.get("mode");
  const mode: SquareFeeMode =
    raw === "passed_through" ? "passed_through" : "absorbed";

  const previous = await getSquareFeeMode();
  if (previous !== mode) {
    await setSquareFeeMode(mode);
    await db.insert(platformAuditLog).values({
      actorEmail: admin.email,
      action: "square_fee_mode",
      detail: `${previous} → ${mode}`,
    });
  }

  revalidatePath(ADMIN_PATH);
}
