import { describe, expect, it } from "vitest";

import {
  generateInviteToken,
  hashInviteToken,
  normalizeEmail,
  rolesToGrantOnAccept,
} from "@/lib/staff/invitations";

/**
 * Invitation token handling (M5 / audit F4). The DB-touching paths are
 * covered by the actions; these pin the properties that make a leaked
 * database row useless and a forwarded link harmless.
 */

describe("invite tokens", () => {
  it("are high-entropy and unique per call", () => {
    const tokens = new Set(
      Array.from({ length: 200 }, () => generateInviteToken()),
    );
    expect(tokens.size).toBe(200);
    // 32 random bytes → 43 base64url chars, no padding, URL-safe.
    for (const token of tokens) {
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    }
  });

  it("are stored only as a hash — the raw token is not recoverable", () => {
    const token = generateInviteToken();
    const hash = hashInviteToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
    // A database read yields the hash; it cannot be replayed as the link.
    expect(hash).not.toBe(token);
  });

  it("hash deterministically, so lookup by hash works", () => {
    const token = generateInviteToken();
    expect(hashInviteToken(token)).toBe(hashInviteToken(token));
  });

  it("give different tokens different hashes", () => {
    expect(hashInviteToken(generateInviteToken())).not.toBe(
      hashInviteToken(generateInviteToken()),
    );
  });
});

describe("email normalisation", () => {
  it("matches addresses case- and whitespace-insensitively", () => {
    // The acceptance check compares the session email to the invited one, so
    // a capitalisation difference must not lock a legitimate invitee out.
    expect(normalizeEmail("  Chef@Example.COM ")).toBe("chef@example.com");
    expect(normalizeEmail("chef@example.com")).toBe("chef@example.com");
  });

  it("keeps distinct addresses distinct", () => {
    expect(normalizeEmail("chef@example.com")).not.toBe(
      normalizeEmail("chef@example.co"),
    );
  });
});

describe("roles granted on acceptance", () => {
  it("grants exactly the invited role to a brand-new member", () => {
    expect(
      rolesToGrantOnAccept({
        invitedRole: "staff",
        legacyRole: null,
        explicitRoles: [],
      }),
    ).toEqual(["staff"]);
  });

  it("never demotes a legacy-only owner who accepts a lower invite", () => {
    // The founding owner has only venue_members.role = 'owner' (no role rows).
    // A manager invites them as staff. Role rows override the legacy column,
    // so the invited role alone would REPLACE owner with staff and lock the
    // sole owner out of their venue.
    const roles = rolesToGrantOnAccept({
      invitedRole: "staff",
      legacyRole: "owner",
      explicitRoles: [],
    });
    expect(roles).toContain("owner");
    expect(roles).toContain("staff");
  });

  it("carries a legacy staff member's role across alongside a promotion", () => {
    expect(
      rolesToGrantOnAccept({
        invitedRole: "manager",
        legacyRole: "staff",
        explicitRoles: [],
      }).sort(),
    ).toEqual(["manager", "staff"]);
  });

  it("adds only the invited role when explicit role rows already govern", () => {
    // Existing rows stay in place (the insert is add-only), so nothing needs
    // carrying: the union in the table already preserves current access.
    expect(
      rolesToGrantOnAccept({
        invitedRole: "staff",
        legacyRole: "owner",
        explicitRoles: ["owner"],
      }),
    ).toEqual(["staff"]);
  });

  it("does not duplicate a role that matches the legacy value", () => {
    expect(
      rolesToGrantOnAccept({
        invitedRole: "owner",
        legacyRole: "owner",
        explicitRoles: [],
      }),
    ).toEqual(["owner"]);
  });
});
