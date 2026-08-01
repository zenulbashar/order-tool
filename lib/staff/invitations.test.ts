import { describe, expect, it } from "vitest";

import {
  generateInviteToken,
  hashInviteToken,
  normalizeEmail,
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
