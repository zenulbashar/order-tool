import { existsSync } from "node:fs";

import { defineConfig, devices } from "@playwright/test";

/**
 * E2E smoke tests for the ANONYMOUS marketing / SEO surface (landing, sign-in,
 * /learn, robots). These routes render without a database — auth() and
 * getCurrentVenue() short-circuit to null for an anonymous request before any
 * query — so the suite runs with only a dummy AUTH_SECRET and no DATABASE_URL.
 * Signed-in owner + diner flows need a seeded DB and are out of scope here (see
 * docs/audit/TechnicalDebt.md).
 *
 * Chromium: pre-installed in this environment at /opt/pw-browsers/chromium; in
 * CI Playwright installs its own, so pin the path only when it exists.
 */
const PORT = 3210;
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
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
    launchOptions: { executablePath },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run build && npm run start",
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      PORT: String(PORT),
      // A dummy secret satisfies NextAuth's presence check; no real auth happens
      // (the smoke suite never sends a session cookie).
      AUTH_SECRET: process.env.AUTH_SECRET ?? "e2e-smoke-secret-not-real",
    },
  },
});
