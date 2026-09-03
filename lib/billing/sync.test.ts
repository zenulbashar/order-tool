import { describe, expect, it } from "vitest";

import { shouldApplySubscriptionSync } from "./sync";

/**
 * Billing webhook events resolve to a venue by metadata/customer, not by the
 * subscription the venue stores, so a venue can receive events about a
 * subscription that is no longer its current one. These pin the rule that a
 * superseded subscription's lifecycle never rewrites the venue's plan state.
 */
const live = (id: string, created: number) =>
  ({ id, status: "active", created }) as const;
const dead = (id: string, created: number) =>
  ({ id, status: "canceled", created }) as const;

describe("shouldApplySubscriptionSync", () => {
  it("applies when the venue has no subscription yet", () => {
    expect(
      shouldApplySubscriptionSync({
        storedSubscriptionId: null,
        stored: null,
        incoming: live("sub_1", 100),
      }),
    ).toBe(true);
  });

  it("applies every event about the venue's own subscription, including its cancellation", () => {
    expect(
      shouldApplySubscriptionSync({
        storedSubscriptionId: "sub_1",
        stored: null,
        incoming: dead("sub_1", 100),
      }),
    ).toBe(true);
  });

  it("ignores a superseded subscription lapsing (late cancel-at-period-end deletion)", () => {
    // sub_1 was set to cancel at period end; the owner re-subscribed as sub_2;
    // sub_1's `deleted` arrives weeks later. The venue is on sub_2 and paying.
    expect(
      shouldApplySubscriptionSync({
        storedSubscriptionId: "sub_2",
        stored: live("sub_2", 200),
        incoming: dead("sub_1", 100),
      }),
    ).toBe(false);
  });

  it("adopts a newer live subscription over the stored one", () => {
    expect(
      shouldApplySubscriptionSync({
        storedSubscriptionId: "sub_1",
        stored: live("sub_1", 100),
        incoming: live("sub_2", 200),
      }),
    ).toBe(true);
  });

  it("ignores a stale live update about an older subscription", () => {
    expect(
      shouldApplySubscriptionSync({
        storedSubscriptionId: "sub_2",
        stored: live("sub_2", 200),
        incoming: live("sub_1", 100),
      }),
    ).toBe(false);
  });

  it("adopts a live subscription when the stored one has lapsed, whatever its age", () => {
    expect(
      shouldApplySubscriptionSync({
        storedSubscriptionId: "sub_2",
        stored: dead("sub_2", 200),
        incoming: live("sub_1", 100),
      }),
    ).toBe(true);
  });

  it("adopts a live subscription when the stored one is unknown to Stripe", () => {
    expect(
      shouldApplySubscriptionSync({
        storedSubscriptionId: "sub_gone",
        stored: null,
        incoming: live("sub_1", 100),
      }),
    ).toBe(true);
  });
});
