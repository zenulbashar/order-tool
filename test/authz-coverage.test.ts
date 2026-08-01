import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Permission-gate coverage (F4 / M5).
 *
 * M5 gated "all 22 dashboard action files" — but that list came from a glob
 * over `actions.ts`, which silently MISSED `recipe-actions.ts` and
 * `tag-actions.ts`. Two mutating surfaces shipped ungated: a staff-role
 * member could edit recipes and dietary tags. Adversarial verification of the
 * merged code found it; a filename pattern is not a security boundary.
 *
 * So the rule is enforced by behaviour, not by naming: ANY "use server" file
 * under a scanned root that resolves a venue must gate on a permission. New
 * files are covered automatically, whatever they are called.
 *
 * The security review then found the SAME class of miss one directory over: the
 * scan root was `app/dashboard` alone, so all five `app/onboarding` actions were
 * invisible to it and gated on bare membership — a staff login could re-run
 * setup on a live venue and null every item's station routing. A scan ROOT is
 * not a security boundary either. Both roots are scanned now.
 */

const SCAN_ROOTS = [
  join(process.cwd(), "app", "dashboard"),
  join(process.cwd(), "app", "onboarding"),
];

/**
 * Helpers that ARE a permission gate.
 *
 * `requireWizardVenue` wraps `requireVenuePermission("settings:manage")` and
 * adds the "wizard unfinished" rule. Recognising a wrapper here could become a
 * way to launder an ungated action, so a test below asserts the wrapper is
 * itself gated — if someone loosens it, that test fails rather than this one
 * quietly passing.
 */
const GATES = ["requireVenuePermission(", "requireWizardVenue("];

/**
 * Files that resolve a venue WITHOUT a permission gate, each with the reason
 * that is legitimate. As with the tenant-scoping harness, an exemption must
 * carry a justification — otherwise it is just a hole with a comment.
 */
const EXEMPTIONS: { file: string; reason: string }[] = [
  {
    file: "app/dashboard/actions.ts",
    reason:
      "Venue SWITCHING and sign-out. setCurrentVenue validates membership via isVenueMember (which venue you are viewing is not a venue capability), and signing out needs no permission at all.",
  },
];

/**
 * Strip comments before scanning — the same lesson the tenant-scoping harness
 * learned. Mutation-testing this file caught it live: the docblock explaining
 * the gate contained the literal `requireVenuePermission(`, so a file whose
 * actual gate had been removed still read as gated. Prose must never be able to
 * satisfy a security assertion.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

function serverActionFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...serverActionFiles(full));
    else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      const source = stripComments(readFileSync(full, "utf8"));
      if (source.includes('"use server"')) out.push(full);
    }
  }
  return out;
}

/** Source with comments removed — every scan below must use this, not the raw file. */
function code(file: string): string {
  return stripComments(readFileSync(file, "utf8"));
}

function isExempt(file: string): boolean {
  const normalised = file.replace(/\\/g, "/");
  return EXEMPTIONS.some((exemption) => normalised.includes(exemption.file));
}

function isGated(source: string): boolean {
  return GATES.some((gate) => source.includes(gate));
}

describe("permission gates on dashboard server actions", () => {
  const files = SCAN_ROOTS.flatMap(serverActionFiles);

  it("finds the server-action files it claims to", () => {
    // Guards the scan itself — otherwise the assertion below passes vacuously.
    expect(files.length).toBeGreaterThan(15);
    expect(files.some((f) => f.endsWith("recipe-actions.ts"))).toBe(true);
    expect(files.some((f) => f.endsWith("tag-actions.ts"))).toBe(true);
    // The roots, not just the files: an onboarding regression must be visible.
    const onboarding = files.filter((f) =>
      f.replace(/\\/g, "/").includes("app/onboarding/"),
    );
    expect(onboarding.length).toBeGreaterThanOrEqual(5);
  });

  it("gates every venue-resolving server action on a permission", () => {
    const ungated: string[] = [];
    for (const file of files) {
      if (isExempt(file)) continue;
      const source = code(file);
      const resolvesVenue = source.includes("requireVenue(") || isGated(source);
      if (!resolvesVenue) continue; // touches no venue state
      if (!isGated(source)) {
        ungated.push(file.replace(process.cwd() + "/", ""));
      }
    }

    expect(
      ungated,
      `Server actions that resolve a venue but gate on NO permission — any ` +
        `member, including kitchen staff, can call these by direct POST:\n` +
        ungated.map((f) => `  ${f}`).join("\n"),
    ).toEqual([]);
  });

  it("leaves no bare requireVenue() in a gated action file", () => {
    // requireVenuePermission() resolves the venue itself; a leftover bare
    // requireVenue() alongside it usually means one code path skipped the gate.
    const leftovers: string[] = [];
    for (const file of files) {
      if (isExempt(file)) continue;
      const source = code(file);
      if (/\brequireVenue\(\)/.test(source)) {
        leftovers.push(file.replace(process.cwd() + "/", ""));
      }
    }
    expect(leftovers).toEqual([]);
  });

  it("keeps requireWizardVenue itself gated on a permission", () => {
    // GATES trusts this wrapper. If it ever stops calling
    // requireVenuePermission, every onboarding action silently loses its gate
    // while still looking gated to the scan above — so pin it here.
    const tenant = stripComments(
      readFileSync(join(process.cwd(), "lib", "tenant.ts"), "utf8"),
    );
    const start = tenant.indexOf("export async function requireWizardVenue");
    expect(start, "requireWizardVenue not found in lib/tenant.ts").toBeGreaterThan(
      -1,
    );
    const body = tenant.slice(start, start + 400);
    expect(body).toContain('requireVenuePermission("settings:manage")');
    expect(body).toContain("isOnboardingComplete(venue)");
  });

  /**
   * Read surfaces that hand out a SECRET, not just a view of venue state.
   *
   * The security review found /dashboard/gift-cards gated on bare membership
   * while all three mutating actions beside it required giftcards:manage. The
   * page prints full gift-card codes, and redemption authorises on the code
   * alone (venue + code + active — no purchaser, no PIN), so the read was worth
   * more than the writes it sat next to. A gate on the write without the same
   * gate on the read is decorative.
   *
   * This list is deliberately short: it is not "every page needs a permission"
   * (kitchen staff legitimately read the menu and the orders board), it is
   * "a page whose output is a bearer instrument is gated like one".
   */
  const SECRET_PAGES: { file: string; permission: string; reason: string }[] = [
    {
      file: "app/dashboard/gift-cards/page.tsx",
      permission: "giftcards:manage",
      reason:
        "Renders full gift-card codes and balances. A code is a bearer instrument — anyone holding it can redeem the venue's stored value as an ordinary diner at checkout.",
    },
  ];

  it("gates pages that print bearer secrets on the matching permission", () => {
    for (const page of SECRET_PAGES) {
      const source = code(join(process.cwd(), page.file));
      expect(
        source,
        `${page.file} must gate on ${page.permission}: ${page.reason}`,
      ).toContain(`requireVenuePermission("${page.permission}")`);
      expect(/\brequireVenue\(\)/.test(source), page.file).toBe(false);
      expect(page.reason.length, page.file).toBeGreaterThan(30);
    }
  });

  it("requires every exemption to carry a reason", () => {
    for (const exemption of EXEMPTIONS) {
      expect(exemption.reason.length, exemption.file).toBeGreaterThan(30);
    }
  });
});
