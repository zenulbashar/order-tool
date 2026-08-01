import { describe, expect, it } from "vitest";

import {
  ALL_PERMISSIONS,
  assignableRoles,
  can,
  parseRoleKey,
  permissionsFor,
  ROLE_KEYS,
  ROLE_PERMISSIONS,
  roleFromLegacyMemberRole,
  type Permission,
} from "@/lib/authz";

/**
 * The access model (M5 / audit F4). F4's core complaint was that `role` was
 * never read for an authorization decision, so any member row granted full
 * owner powers. These are the rules that replace that.
 */

describe("permission union across roles", () => {
  it("grants the union when a member holds several roles", () => {
    // §8.3's surviving evidence: multiple roles, CUMULATIVE permissions.
    const granted = permissionsFor(["staff", "manager"]);
    expect(granted.has("orders:manage")).toBe(true); // from staff
    expect(granted.has("menu:manage")).toBe(true); // from manager
    expect(granted.size).toBe(ROLE_PERMISSIONS.manager.length);
  });

  it("grants nothing for an empty role set", () => {
    expect(permissionsFor([]).size).toBe(0);
    for (const permission of ALL_PERMISSIONS) {
      expect(can([], permission)).toBe(false);
    }
  });

  it("gives the owner every permission, by construction", () => {
    for (const permission of ALL_PERMISSIONS) {
      expect(can(["owner"], permission)).toBe(true);
    }
  });
});

describe("role boundaries", () => {
  it("keeps kitchen staff on the orders board and nothing else", () => {
    expect(can(["staff"], "orders:view")).toBe(true);
    expect(can(["staff"], "orders:manage")).toBe(true);
    // Money, config and ownership are all closed to staff.
    for (const permission of [
      "refunds:issue",
      "menu:manage",
      "stock:manage",
      "settings:manage",
      "billing:manage",
      "staff:manage",
      "reports:view",
      "giftcards:manage",
      "integrations:manage",
      "promotions:manage",
    ] satisfies Permission[]) {
      expect(can(["staff"], permission), permission).toBe(false);
    }
  });

  it("withholds billing and staff management from a manager", () => {
    expect(can(["manager"], "refunds:issue")).toBe(true);
    expect(can(["manager"], "menu:manage")).toBe(true);
    expect(can(["manager"], "billing:manage")).toBe(false);
    expect(can(["manager"], "staff:manage")).toBe(false);
  });

  it("declares a stance for every role on every permission", () => {
    // Guards against a new permission silently defaulting to "denied for all".
    for (const role of ROLE_KEYS) {
      for (const permission of ROLE_PERMISSIONS[role]) {
        expect(ALL_PERMISSIONS).toContain(permission);
      }
    }
    expect(new Set(ROLE_PERMISSIONS.owner)).toEqual(new Set(ALL_PERMISSIONS));
  });
});

describe("assignableRoles — privilege escalation", () => {
  it("lets an owner grant any role", () => {
    expect(assignableRoles(["owner"])).toEqual([...ROLE_KEYS]);
  });

  it("never lets a manager mint an owner", () => {
    // The escalation that would make roles worse than useless: a manager
    // granting themselves owner and reaching billing.
    const grantable = assignableRoles(["manager"]);
    expect(grantable).not.toContain("owner");
    expect(grantable).toContain("manager");
    expect(grantable).toContain("staff");
  });

  it("lets staff grant at most staff", () => {
    expect(assignableRoles(["staff"])).toEqual(["staff"]);
    expect(assignableRoles([])).toEqual([]);
  });

  it("holds the invariant for EVERY role: you cannot grant what you lack", () => {
    // The property, checked directly rather than via a hardcoded list — this
    // is what makes escalation impossible by construction.
    for (const actor of ROLE_KEYS) {
      const held = permissionsFor([actor]);
      for (const grantable of assignableRoles([actor])) {
        for (const permission of ROLE_PERMISSIONS[grantable]) {
          expect(
            held.has(permission),
            `${actor} must not be able to grant ${grantable} (needs ${permission})`,
          ).toBe(true);
        }
      }
    }
  });
});

describe("parseRoleKey", () => {
  it("accepts the vocabulary and rejects everything else", () => {
    expect(parseRoleKey("owner")).toBe("owner");
    expect(parseRoleKey("manager")).toBe("manager");
    expect(parseRoleKey("staff")).toBe("staff");
    expect(parseRoleKey("admin")).toBeNull();
    expect(parseRoleKey("")).toBeNull();
    expect(parseRoleKey(null)).toBeNull();
    expect(parseRoleKey({ role: "owner" })).toBeNull();
  });
});

describe("legacy fallback", () => {
  it("maps the pre-M5 column so existing members keep their access", () => {
    // Zero-migration compatibility: an existing owner stays an owner.
    expect(roleFromLegacyMemberRole("owner")).toBe("owner");
    expect(roleFromLegacyMemberRole("staff")).toBe("staff");
    // Anything unrecognised fails CLOSED to the least privilege.
    expect(roleFromLegacyMemberRole("whatever")).toBe("staff");
  });

  it("means a legacy owner still holds every permission", () => {
    const roles = [roleFromLegacyMemberRole("owner")];
    for (const permission of ALL_PERMISSIONS) {
      expect(can(roles, permission)).toBe(true);
    }
  });
});
