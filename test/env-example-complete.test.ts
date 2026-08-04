import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * `.env.example` documents every key the code actually reads.
 *
 * Found while auditing the repo docs: 24 keys were read by `process.env` and
 * absent from `.env.example`. Nothing failed loudly — every one of them
 * DEGRADES silently, which is exactly why the gap survived so long:
 *
 *   - `PLATFORM_ADMIN_EMAILS` unset ⇒ the allowlist is empty ⇒ `/admin` denies
 *     everyone, with no error and no log line;
 *   - `SENTRY_DSN` unset ⇒ every capture is a no-op, so the thing that would
 *     have reported the others is off too;
 *   - FCM / Square / Roster / deep-link keys ⇒ the feature just never works.
 *
 * A fresh deploy from this file therefore came up half-configured and looked
 * fine. The rule is derived from the source rather than from a list, so a new
 * `process.env.X` fails here rather than in production six weeks later.
 */

const ROOT = process.cwd();

/**
 * Injected by the platform, the CI runner, the mobile build or the test harness
 * — never part of a production deploy's configuration, so they are documented in
 * prose at the foot of `.env.example` rather than as keys.
 *
 * Keep this list justified, not convenient: anything a deploy must SET to work
 * belongs in `.env.example`, and the whole point of this test is that a silently
 * degrading key never reaches production undocumented. Every entry below is
 * either written by a platform we do not control, or read only by tooling that
 * never runs in production.
 */
const NOT_OURS_TO_SET = new Set([
  "NODE_ENV",
  "VERCEL_ENV",
  "VERCEL_URL",
  "VERCEL_PROJECT_PRODUCTION_URL",
  "VERCEL_GIT_COMMIT_SHA",
  // Set by Next itself to identify the running runtime ("nodejs" | "edge");
  // instrumentation.ts branches on it. Surfaced once the scan below started
  // reading root-level files, which is how it had gone undocumented.
  "NEXT_RUNTIME",
  // A build-time shell export for the Capacitor wrapper (mobile/README.md),
  // not a server runtime variable.
  "P2E_APP_URL",
  // Test harness only, read by playwright.config.ts and never by the app.
  // `CI` is set by the runner; PLAYWRIGHT_BASE_URL points the E2E suite at an
  // already-running server instead of letting it start one.
  "CI",
  "PLAYWRIGHT_BASE_URL",
]);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const EXAMPLE = readFileSync(join(ROOT, ".env.example"), "utf8");

/** Keys documented in .env.example, including commented-out optional ones. */
const documented = new Set(
  [...EXAMPLE.matchAll(/^#?\s*([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]),
);

/**
 * Root-level `.ts` files, non-recursively — `instrumentation.ts`,
 * `next.config.ts`, `drizzle.config.ts`. These were outside the scan, which is
 * how `NEXT_RUNTIME` came to be read in two places and documented in none while
 * CI stayed green. Config files are exactly where a new `process.env` read is
 * most likely to appear and least likely to be noticed.
 */
function rootSourceFiles(): string[] {
  return readdirSync(ROOT)
    .filter((entry) => /\.ts$/.test(entry))
    .map((entry) => join(ROOT, entry))
    .filter((full) => statSync(full).isFile());
}

/** Keys the code reads via process.env. */
const used = new Set<string>();
for (const dir of ["app", "lib", "mobile", "scripts"]) {
  let files: string[];
  try {
    files = sourceFiles(join(ROOT, dir));
  } catch {
    continue; // optional directory
  }
  for (const file of files) {
    for (const [, key] of readFileSync(file, "utf8").matchAll(
      /process\.env\.([A-Z][A-Z0-9_]*)/g,
    )) {
      used.add(key);
    }
  }
}
for (const file of rootSourceFiles()) {
  for (const [, key] of readFileSync(file, "utf8").matchAll(
    /process\.env\.([A-Z][A-Z0-9_]*)/g,
  )) {
    used.add(key);
  }
}

describe(".env.example completeness", () => {
  it("finds the source tree and the example file it claims to", () => {
    // Without this both assertions below pass vacuously on an empty scan.
    expect(used.size).toBeGreaterThan(30);
    expect(documented.size).toBeGreaterThan(30);
  });

  it("documents every env var the code reads", () => {
    const missing = [...used]
      .filter((key) => !documented.has(key) && !NOT_OURS_TO_SET.has(key))
      .sort();
    expect(
      missing,
      "add these to .env.example with what breaks without them. They all fail " +
        "SILENTLY — an undocumented key is a feature that is simply off on a " +
        "fresh deploy, with nothing in the logs to say so.",
    ).toEqual([]);
  });

  it("does not document keys nothing reads", () => {
    // AUTH_SECRET is the deliberate exception: NextAuth reads it from the
    // environment itself, so it never appears as a process.env reference. It is
    // required, and dropping it because a grep called it unused would break
    // every session.
    const IMPLICIT = new Set(["AUTH_SECRET"]);
    const orphaned = [...documented]
      .filter((key) => !used.has(key) && !IMPLICIT.has(key))
      .sort();
    expect(
      orphaned,
      "these are documented but nothing reads them — either the feature was " +
        "removed and the key should go, or it is read implicitly by a library " +
        "and belongs in IMPLICIT above with the reason.",
    ).toEqual([]);
  });
});
