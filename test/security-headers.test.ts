import { describe, expect, it } from "vitest";

import nextConfig from "../next.config";

/**
 * Security headers were set on `/:slug/checkout` and nowhere else, so the owner
 * dashboard, admin console, storefronts and API routes had none. These assert the
 * rule that replaced that, derived from the config rather than restated: whatever
 * the baseline rule carries must reach every route, and checkout must still end
 * up strictly tighter.
 *
 * The override direction is the fragile part. Next applies EVERY matching rule and
 * lets the LAST one win per key, so moving the checkout rule above the baseline
 * would silently downgrade checkout from DENY to SAMEORIGIN. That is invisible in
 * review and is exactly what the last test here catches.
 */
type HeaderRule = {
  source: string;
  headers: { key: string; value: string }[];
};

async function rules(): Promise<HeaderRule[]> {
  const headers = await nextConfig.headers!();
  return headers as unknown as HeaderRule[];
}

/** The value a browser ends up with: last matching rule wins, per the Next docs. */
function effective(
  matched: HeaderRule[],
  key: string,
): string | undefined {
  let value: string | undefined;
  for (const rule of matched) {
    for (const header of rule.headers) {
      if (header.key.toLowerCase() === key.toLowerCase()) value = header.value;
    }
  }
  return value;
}

describe("baseline security headers", () => {
  it("applies to every route, not just checkout", async () => {
    const all = await rules();
    const baseline = all.find((r) => r.source === "/:path*");
    expect(baseline, "a catch-all header rule must exist").toBeDefined();
  });

  it("sets HSTS, which was absent from the entire repo", async () => {
    const baseline = (await rules()).find((r) => r.source === "/:path*")!;
    const hsts = effective([baseline], "Strict-Transport-Security");
    expect(hsts).toMatch(/max-age=\d+/);
    expect(hsts).toContain("includeSubDomains");
  });

  it("does NOT send preload, which is an operator decision and hard to undo", async () => {
    const baseline = (await rules()).find((r) => r.source === "/:path*")!;
    expect(effective([baseline], "Strict-Transport-Security")).not.toContain(
      "preload",
    );
  });

  it("sends a Referrer-Policy, so the account verify token cannot leak via Referer", async () => {
    // /[slug]/account/verify?token=… carries a bearer credential in the URL.
    // With no policy, a cross-origin navigation from that page sends the full
    // URL — token and all — in the Referer header.
    const baseline = (await rules()).find((r) => r.source === "/:path*")!;
    expect(effective([baseline], "Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );
  });

  it("sends nosniff and a framing policy on the baseline", async () => {
    const baseline = (await rules()).find((r) => r.source === "/:path*")!;
    expect(effective([baseline], "X-Content-Type-Options")).toBe("nosniff");
    expect(effective([baseline], "X-Frame-Options")).toBeDefined();
  });
});

describe("checkout stays strictly tighter than the baseline", () => {
  it("keeps its CSP", async () => {
    const checkout = (await rules()).find(
      (r) => r.source === "/:slug/checkout",
    )!;
    const csp = effective([checkout], "Content-Security-Policy");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });

  it("resolves to DENY, not the baseline SAMEORIGIN — rule ORDER decides this", async () => {
    const all = await rules();
    // Both rules match /corner-cafe/checkout. Replay them in declaration order
    // exactly as Next does, so a future reordering fails here rather than in
    // production, where a weakened header on a card form is invisible.
    const matched = all.filter(
      (r) => r.source === "/:path*" || r.source === "/:slug/checkout",
    );
    expect(effective(matched, "X-Frame-Options")).toBe("DENY");
  });

  it("is declared after the baseline rule", async () => {
    const all = await rules();
    const baselineIndex = all.findIndex((r) => r.source === "/:path*");
    const checkoutIndex = all.findIndex((r) => r.source === "/:slug/checkout");
    expect(baselineIndex).toBeGreaterThanOrEqual(0);
    expect(checkoutIndex).toBeGreaterThan(baselineIndex);
  });
});
