import { describe, expect, it, vi } from "vitest";

const inserted = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[] }));

const db = vi.hoisted(() => ({
  insert: vi.fn(() => ({
    values: vi.fn(async (row: Record<string, unknown>) => {
      if (row.__fail) throw new Error("audit table unreachable");
      inserted.rows.push(row);
    }),
  })),
}));
vi.mock("@/lib/db", () => ({ db }));

const { AUDIT_ACTION_LABEL, recordVenueAudit } = await import("@/lib/audit");

/**
 * Merchant audit log (M8 / audit F9). The properties that decide whether this
 * is trustworthy: it records the acting member, it never leaks anything
 * secret-shaped, and — critically — it never takes down the action it is
 * describing.
 */

describe("recordVenueAudit", () => {
  it("records the venue, action, detail and actor", async () => {
    inserted.rows.length = 0;
    await recordVenueAudit({
      venueId: "venue-1",
      action: "menu_item_updated",
      detail: "Flat White: $5.00",
      actor: { id: "user-1", email: "owner@example.com" },
    });

    expect(inserted.rows).toHaveLength(1);
    expect(inserted.rows[0]).toMatchObject({
      venueId: "venue-1",
      actorUserId: "user-1",
      actorEmail: "owner@example.com",
      action: "menu_item_updated",
      detail: "Flat White: $5.00",
    });
  });

  it("still records an entry when the actor's email is unknown", async () => {
    inserted.rows.length = 0;
    await recordVenueAudit({
      venueId: "venue-1",
      action: "order_status_changed",
      actor: {},
    });
    // actor_email is NOT NULL and predates user ids — a stable marker beats
    // inventing an address or dropping the entry.
    expect(inserted.rows[0].actorEmail).toBe("unknown");
    expect(inserted.rows[0].actorUserId).toBeNull();
  });

  it("scrubs long opaque strings out of the detail", async () => {
    inserted.rows.length = 0;
    const tokenish = "sk_live_" + "a".repeat(48);
    await recordVenueAudit({
      venueId: "venue-1",
      action: "integration_connected",
      detail: `connected with ${tokenish}`,
      actor: { email: "owner@example.com" },
    });
    expect(inserted.rows[0].detail).not.toContain(tokenish);
    expect(inserted.rows[0].detail).toContain("…");
  });

  it("truncates a runaway detail rather than storing a payload", async () => {
    inserted.rows.length = 0;
    await recordVenueAudit({
      venueId: "venue-1",
      action: "menu_item_updated",
      detail: "x".repeat(5000),
      actor: { email: "owner@example.com" },
    });
    expect(String(inserted.rows[0].detail).length).toBeLessThanOrEqual(500);
  });

  it("NEVER throws when the audit write fails", async () => {
    // The load-bearing property: a merchant's price change must not be
    // refused because the audit insert failed.
    db.insert.mockImplementationOnce(() => ({
      values: vi.fn(async () => {
        throw new Error("audit table unreachable");
      }),
    }));
    await expect(
      recordVenueAudit({
        venueId: "venue-1",
        action: "menu_item_updated",
        actor: { email: "owner@example.com" },
      }),
    ).resolves.toBeUndefined();
  });
});

describe("AUDIT_ACTION_LABEL", () => {
  it("labels every action in the vocabulary", () => {
    // A missing label renders a raw enum string in the merchant's feed.
    for (const [action, label] of Object.entries(AUDIT_ACTION_LABEL)) {
      expect(label, action).toBeTruthy();
      expect(label).not.toBe(action);
    }
  });
});
