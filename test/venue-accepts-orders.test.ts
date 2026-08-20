import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * "Live" and "can be paid" are different facts (audit P14).
 *
 * `finishOnboarding` stamps `onboarding_completed_at` unconditionally under the
 * heading "You are ready to go live", and `isLive` derives purely from that
 * timestamp. But NO wizard step creates or connects a Stripe account —
 * `stripe.accounts.create` appears exactly once in the repo, on the Payments
 * page, which the wizard never visits.
 *
 * So an owner finished setup, printed the table QR codes off the final step,
 * and opened. Every diner browsed, built a cart, typed name, email and phone,
 * tapped "Continue to payment · $24.50" and got "This venue isn't accepting
 * online payments yet." The dashboard showed zero orders and no explanation,
 * because `needsOnboarding` goes false the moment the wizard ends.
 *
 * Nothing here was ever a money defect — the placeOrder reject fails closed
 * before any item fetch, price recompute, transaction or PaymentIntent. It was
 * a dead end plus a false heading, which is a different thing and still worth
 * fixing properly.
 */
describe("acceptsOrders vs isLive", () => {
  const source = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

  it("derives acceptsOrders from BOTH onboarding and charges_enabled", () => {
    const acceptsLine = source("app/[slug]/queries.ts")
      .split("\n")
      .find((l) => l.includes("acceptsOrders: sql"));
    expect(acceptsLine, "acceptsOrders must be derived in SQL").toBeTruthy();
    // Asserted on the ONE line, not across the file — a file-wide match would
    // pass by finding the two halves on separate rows.
    expect(acceptsLine).toContain("onboardingCompletedAt");
    expect(acceptsLine).toContain("stripeChargesEnabled");
  });

  it("keeps isLive meaning ONLY that the owner finished setup", () => {
    // Folding payments into isLive would have fixed every diner gate in one
    // line, and made the name lie: app/admin reports on "live" meaning setup
    // finished, and the two questions have to stay separable.
    const queries = source("app/[slug]/queries.ts");
    const isLiveLine = queries
      .split("\n")
      .find((l) => l.includes("isLive: sql"));
    expect(isLiveLine).toBeTruthy();
    expect(isLiveLine).not.toContain("stripeChargesEnabled");
  });

  it("gates every diner-facing surface on acceptsOrders, not isLive", () => {
    // These three decide whether a diner is told before filling the form or
    // after. A surface left on isLive is one that still walks them into the
    // dead end.
    const DINER_SURFACES = [
      "app/[slug]/page.tsx",
      "app/[slug]/menu/page.tsx",
      "app/[slug]/checkout/page.tsx",
    ];
    for (const file of DINER_SURFACES) {
      const src = source(file);
      expect(src, `${file} must gate on acceptsOrders`).toContain(
        "venue.acceptsOrders",
      );
      expect(src, `${file} must not still branch on isLive`).not.toContain(
        "!venue.isLive",
      );
    }
  });

  it("keeps placeOrder's reject as the authoritative block", () => {
    // The counterweight. The page gates are a courtesy; this one is the
    // control, and it must not be "deduped" away now that the UI checks too.
    const actions = source("app/[slug]/checkout/actions.ts");
    expect(actions).toContain("!venue.stripeChargesEnabled");
    expect(actions).toContain("isn't accepting online payments yet");
  });

  it("stops the wizard promising a venue is ready when it cannot charge", () => {
    const live = source("app/onboarding/live/page.tsx");
    expect(live).toContain("stripeChargesEnabled");
    // The heading is conditional, not unconditional prose.
    expect(live).toContain("canTakePayments");
    expect(live).toContain("One step left: connect payments");
  });

  it("surfaces the live-but-unpayable state on the dashboard", () => {
    // Previously silent in every direction: no banner, no nudge, no sidebar
    // marker — just an empty orders board.
    const home = source("app/dashboard/page.tsx");
    expect(home).toContain("!needsOnboarding && !venue.stripeChargesEnabled");
    expect(home).toContain("/dashboard/payments");
  });
});
