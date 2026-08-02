import { describe, expect, it } from "vitest";

import { resolveBaseUrl } from "@/lib/url";

/**
 * The ordering here IS the security property, so it is tested directly rather
 * than through `getBaseUrl` (which would need a request).
 *
 * `getBaseUrl` builds the diner magic-link and the staff invite link, and the
 * token in each is a bearer credential. An origin taken from a request header is
 * an origin an attacker may be able to choose — poison `X-Forwarded-Host`,
 * submit a victim's address, and the victim is mailed a working token pointing
 * at your domain. Every rung above the last is an ENVIRONMENT value, so the
 * header is only ever reached where no deployment env exists at all.
 */

const POISONED = { host: "attacker.example", proto: "https" };

describe("resolveBaseUrl", () => {
  it("prefers AUTH_URL over everything, including a poisoned host", () => {
    expect(
      resolveBaseUrl(
        {
          authUrl: "https://app.prompt2eat.com",
          vercelEnv: "production",
          vercelProjectProductionUrl: "prod.vercel.app",
          vercelUrl: "deployment.vercel.app",
        },
        POISONED,
      ),
    ).toBe("https://app.prompt2eat.com");
  });

  it("strips trailing slashes so callers can append a path", () => {
    expect(
      resolveBaseUrl({ authUrl: "https://app.prompt2eat.com///" }, POISONED),
    ).toBe("https://app.prompt2eat.com");
  });

  it("IGNORES the request host in production when AUTH_URL is unset", () => {
    // The finding: AUTH_URL is documented as optional and commented out in
    // .env.example, so this is a real production configuration.
    expect(
      resolveBaseUrl(
        {
          vercelEnv: "production",
          vercelProjectProductionUrl: "app.prompt2eat.com",
          vercelUrl: "p2e-abc123.vercel.app",
        },
        POISONED,
      ),
    ).toBe("https://app.prompt2eat.com");
  });

  it("prefers the project's production domain over the deployment URL", () => {
    // VERCEL_URL is per-deployment, so using it would mail customers an
    // unstable "…-abc123.vercel.app" link.
    const url = resolveBaseUrl(
      {
        vercelEnv: "production",
        vercelProjectProductionUrl: "app.prompt2eat.com",
        vercelUrl: "p2e-abc123.vercel.app",
      },
      { host: null, proto: "https" },
    );
    expect(url).toBe("https://app.prompt2eat.com");
    expect(url).not.toContain("abc123");
  });

  it("uses the deployment URL on a preview, not the request host", () => {
    expect(
      resolveBaseUrl(
        { vercelEnv: "preview", vercelUrl: "p2e-pr-42.vercel.app" },
        POISONED,
      ),
    ).toBe("https://p2e-pr-42.vercel.app");
  });

  it("does not use a production domain that is not there", () => {
    // Production with the project URL missing must still not fall to the header
    // while any env-provided value remains.
    expect(
      resolveBaseUrl(
        { vercelEnv: "production", vercelUrl: "p2e-abc123.vercel.app" },
        POISONED,
      ),
    ).toBe("https://p2e-abc123.vercel.app");
  });

  it("falls back to the request host ONLY with no deployment env at all", () => {
    // Local development, where there is no attacker between a developer and
    // their own machine — and where a LAN IP is the point (mobile testing).
    expect(
      resolveBaseUrl({}, { host: "192.168.1.20:3000", proto: "http" }),
    ).toBe("http://192.168.1.20:3000");
  });

  it("throws rather than guessing when nothing identifies the origin", () => {
    expect(() => resolveBaseUrl({}, { host: null, proto: "https" })).toThrow(
      /Cannot determine base URL/,
    );
  });

  it("treats empty strings as unset at every rung", () => {
    // An env var present but blank is a configuration mistake, not an origin.
    expect(
      resolveBaseUrl(
        {
          authUrl: "",
          vercelEnv: "production",
          vercelProjectProductionUrl: "",
          vercelUrl: "",
        },
        { host: "localhost:3000", proto: "http" },
      ),
    ).toBe("http://localhost:3000");
  });
});
