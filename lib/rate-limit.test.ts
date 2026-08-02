import { describe, expect, it } from "vitest";

import { clientIpFromHeaders } from "@/lib/rate-limit";

/**
 * Client-IP resolution (audit S3).
 *
 * This one function is the key for EVERY per-IP limit in the app — checkout
 * floods, concierge and support (real model spend), and both magic-link gates.
 * If a caller can choose their own IP, rotating it defeats all of them at once.
 *
 * The ordering is the security property, so it is tested directly: the
 * platform-set headers must win over the one a client can influence.
 */

/** Minimal Headers-like stand-in — the function only calls .get(). */
function headers(map: Record<string, string>) {
  const lower = Object.fromEntries(
    Object.entries(map).map(([k, v]) => [k.toLowerCase(), v]),
  );
  return { get: (name: string) => lower[name.toLowerCase()] ?? null };
}

const REAL = "203.0.113.7";
const SPOOFED = "1.2.3.4";

describe("clientIpFromHeaders", () => {
  it("prefers the platform header over a client-influenced XFF", () => {
    // The finding: XFF is a chain proxies APPEND to, so a request that arrives
    // carrying its own value leaves an attacker-chosen entry left-most.
    expect(
      clientIpFromHeaders(
        headers({
          "x-forwarded-for": `${SPOOFED}, ${REAL}`,
          "x-vercel-forwarded-for": REAL,
        }),
      ),
    ).toBe(REAL);
  });

  it("prefers x-real-ip over XFF when the Vercel header is absent", () => {
    expect(
      clientIpFromHeaders(
        headers({ "x-forwarded-for": `${SPOOFED}, ${REAL}`, "x-real-ip": REAL }),
      ),
    ).toBe(REAL);
  });

  it("still falls back to XFF off-platform, so local dev is unchanged", () => {
    // Neither Vercel header exists outside Vercel, so behaviour there is exactly
    // what it was before the reorder.
    expect(
      clientIpFromHeaders(headers({ "x-forwarded-for": `${REAL}, 10.0.0.1` })),
    ).toBe(REAL);
  });

  it("takes the left-most hop of a chained XFF", () => {
    expect(
      clientIpFromHeaders(headers({ "x-forwarded-for": ` ${REAL} , 10.0.0.1 ` })),
    ).toBe(REAL);
  });

  it("treats a blank header as absent rather than a bucket key", () => {
    // A present-but-empty header would otherwise short-circuit the ladder and
    // collapse every caller into one shared limit bucket.
    expect(
      clientIpFromHeaders(
        headers({ "x-vercel-forwarded-for": "   ", "x-real-ip": REAL }),
      ),
    ).toBe(REAL);
    expect(
      clientIpFromHeaders(
        headers({ "x-forwarded-for": " , 10.0.0.1", "cf-connecting-ip": REAL }),
      ),
    ).toBe(REAL);
  });

  it("falls back to cf-connecting-ip only when nothing else is present", () => {
    expect(clientIpFromHeaders(headers({ "cf-connecting-ip": REAL }))).toBe(REAL);
  });

  it("never throws — unknown collapses into one bucket", () => {
    // Limiting is fail-open by design, but the KEY must still exist.
    expect(clientIpFromHeaders(headers({}))).toBe("unknown");
  });
});
