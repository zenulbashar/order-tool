/**
 * One-off audit: report any existing venue whose slug is reserved (and would
 * therefore shadow an app route). Reserved slugs are blocked at creation and
 * treated as not-found by the public resolver, but rows that predate this guard
 * must be renamed MANUALLY — this script only reports, it never modifies data.
 *
 * Run against a database (uses the same DATABASE_URL as the app):
 *
 *   DATABASE_URL="postgres://…" npx tsx scripts/check-reserved-slugs.ts
 *
 * Exit code is 1 when any reserved slug is found, 0 otherwise.
 *
 * Relative imports (not the "@/" alias) so it runs under a plain `tsx`.
 */
import { inArray } from "drizzle-orm";

import { db } from "../lib/db";
import { venues } from "../lib/db/schema";
import { RESERVED_SLUGS } from "../lib/validation";

async function main() {
  const reserved = [...RESERVED_SLUGS];
  const rows = await db
    .select({ id: venues.id, slug: venues.slug, name: venues.name })
    .from(venues)
    .where(inArray(venues.slug, reserved));

  if (rows.length === 0) {
    console.log("OK: no existing venue holds a reserved slug.");
    return;
  }

  console.log(
    `WARNING: ${rows.length} venue(s) hold a reserved slug — rename manually:`,
  );
  for (const row of rows) {
    console.log(`  - "${row.slug}"  (venue "${row.name}", id ${row.id})`);
  }
  process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
