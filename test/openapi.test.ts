import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Keeps docs/api/openapi.yaml honest (F11).
 *
 * A specification that silently drifts from the code is worse than none — it
 * gives an integrator false confidence. So rather than trusting anyone to
 * remember, this walks app/api for `route.ts` files and asserts a
 * one-to-one correspondence with the documented paths. Adding a route
 * without documenting it fails CI.
 *
 * Deliberately hand-parsed: pulling in a YAML parser and an OpenAPI validator
 * for one spec file is a dependency bill this repo doesn't need. The
 * assertions below are about coverage, which is the property that actually
 * rots.
 */

const API_DIR = join(process.cwd(), "app", "api");
const SPEC_PATH = join(process.cwd(), "docs", "api", "openapi.yaml");

/** Every route.ts under app/api, as its URL path. */
function discoverRoutes(dir: string, prefix = "/api"): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...discoverRoutes(full, `${prefix}/${entry}`));
    } else if (entry === "route.ts") {
      found.push(prefix);
    }
  }
  return found;
}

/**
 * Next's catch-all/dynamic segments (`[...nextauth]`, `[id]`) become OpenAPI
 * template params (`{nextauth}`, `{id}`).
 */
function toSpecPath(routePath: string): string {
  return routePath.replace(/\[\.{3}([^\]]+)\]/g, "{$1}").replace(/\[([^\]]+)\]/g, "{$1}");
}

const spec = readFileSync(SPEC_PATH, "utf8");
const routes = discoverRoutes(API_DIR).map(toSpecPath).sort();

/** Top-level entries under `paths:` — two-space indented keys starting with /. */
function documentedPaths(source: string): string[] {
  const body = source.slice(source.indexOf("\npaths:"));
  return [...body.matchAll(/^ {2}(\/[^\s:]*):/gm)].map((match) => match[1]).sort();
}

describe("openapi.yaml", () => {
  it("documents every route under app/api", () => {
    const documented = documentedPaths(spec);
    const missing = routes.filter((route) => !documented.includes(route));
    expect(
      missing,
      `Undocumented API routes — add them to docs/api/openapi.yaml:\n${missing.join("\n")}`,
    ).toEqual([]);
  });

  it("documents no path that does not exist", () => {
    const documented = documentedPaths(spec);
    const stale = documented.filter((path) => !routes.includes(path));
    expect(
      stale,
      `Documented paths with no route.ts — remove them:\n${stale.join("\n")}`,
    ).toEqual([]);
  });

  it("finds the routes it claims to (guards the discovery itself)", () => {
    // If the walker broke, both assertions above would pass vacuously.
    expect(routes.length).toBeGreaterThanOrEqual(10);
    expect(routes).toContain("/api/stripe/webhook");
    expect(routes).toContain("/api/jobs/integrations");
  });

  it("declares a security scheme for every non-public surface", () => {
    for (const scheme of [
      "stripeSignature",
      "stripeBillingSignature",
      "squareSignature",
      "supportSignature",
      "cronBearer",
      "session",
    ]) {
      expect(spec, `missing securityScheme: ${scheme}`).toContain(`${scheme}:`);
    }
  });

  it("states plainly that this is not a public API", () => {
    // The most important claim in the document: F11's gap is a PUBLIC API,
    // and this spec must not be mistaken for one. Comment reflow inserts
    // "\n# ", so normalise whitespace before matching.
    const flattened = spec.replace(/\n#?\s*/g, " ");
    expect(flattened).toMatch(/there is NO public, third-party-facing API yet/i);
    expect(flattened).toMatch(/Not a public API/i);
  });
});
