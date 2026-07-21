import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * Vitest config for the pure domain-logic unit tests (lib/**). Node environment;
 * no DOM, no DB connection (the Neon client is lazy — see lib/db/index.ts). Two
 * aliases mirror the app's resolution so the modules import unchanged:
 *  - `@/*` → project root (matches tsconfig paths).
 *  - `server-only` → an empty stub, so "server-only" modules whose exported math
 *    is pure can be tested in isolation.
 */
export default defineConfig({
  resolve: {
    alias: {
      "server-only": fileURLToPath(
        new URL("./test/server-only-stub.ts", import.meta.url),
      ),
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});
