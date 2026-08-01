import { existsSync } from "node:fs";

import { defineConfig, devices } from "@playwright/test";

/**
 * Two suites live here:
 *
 *  - e2e/smoke.spec.ts — the ANONYMOUS marketing / SEO surface (landing,
 *    sign-in, /learn, robots). These routes render without a database —
 *    auth() and getCurrentVenue() short-circuit to null for an anonymous
 *    request before any query — so the suite runs with only a dummy
 *    AUTH_SECRET and no DATABASE_URL. This is what CI runs.
 *  - e2e/checkout.spec.ts — the full cart → checkout → webhook → confirmed
 *    path (M3 / audit F8). It needs a seeded database and Stripe test
 *    credentials, so it SKIPS ITSELF unless those env vars are present; CI
 *    has neither and stays green. See docs/ops/Testing.md.
 *
 * PLAYWRIGHT_BASE_URL points the run at an already-running deployment (e.g.
 * staging, for the checkout spec) instead of building and starting locally.
 *
 * Chromium: pre-installed in this environment at /opt/pw-browsers/chromium; in
 * CI Playwright installs its own, so pin the path only when it exists.
 */
const PORT = 3210;
const EXTERNAL_BASE_URL = process.env.PLAYWRIGHT_BASE_URL;
const PREINSTALLED_CHROMIUM = "/opt/pw-browsers/chromium";
const executablePath = existsSync(PREINSTALLED_CHROMIUM)
  ? PREINSTALLED_CHROMIUM
  : undefined;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: EXTERNAL_BASE_URL ?? `http://localhost:${PORT}`,
    trace: "on-first-retry",
    launchOptions: { executablePath },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  // Targeting an external deployment means there is nothing to boot locally.
  webServer: EXTERNAL_BASE_URL
    ? undefined
    : {
        command: "npm run build && npm run start",
        url: `http://localhost:${PORT}`,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        env: {
          PORT: String(PORT),
          // A dummy secret satisfies NextAuth's presence check; no real auth
          // happens (the smoke suite never sends a session cookie).
          AUTH_SECRET: process.env.AUTH_SECRET ?? "e2e-smoke-secret-not-real",
        },
      },
});
