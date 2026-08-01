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
 * under app/dashboard that resolves a venue must gate on a permission. New
 * files are covered automatically, whatever they are called.
 */

const DASHBOARD = join(process.cwd(), "app", "dashboard");

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

function serverActionFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...serverActionFiles(full));
    else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      const source = readFileSync(full, "utf8");
      if (source.includes('"use server"')) out.push(full);
    }
  }
  return out;
}

function isExempt(file: string): boolean {
  const normalised = file.replace(/\\/g, "/");
  return EXEMPTIONS.some((exemption) => normalised.includes(exemption.file));
}

describe("permission gates on dashboard server actions", () => {
  const files = serverActionFiles(DASHBOARD);

  it("finds the server-action files it claims to", () => {
    // Guards the scan itself — otherwise the assertion below passes vacuously.
    expect(files.length).toBeGreaterThan(15);
    expect(files.some((f) => f.endsWith("recipe-actions.ts"))).toBe(true);
    expect(files.some((f) => f.endsWith("tag-actions.ts"))).toBe(true);
  });

  it("gates every venue-resolving server action on a permission", () => {
    const ungated: string[] = [];
    for (const file of files) {
      if (isExempt(file)) continue;
      const source = readFileSync(file, "utf8");
      const resolvesVenue =
        source.includes("requireVenue(") ||
        source.includes("requireVenuePermission(");
      if (!resolvesVenue) continue; // touches no venue state
      if (!source.includes("requireVenuePermission(")) {
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
      const source = readFileSync(file, "utf8");
      if (/\brequireVenue\(\)/.test(source)) {
        leftovers.push(file.replace(process.cwd() + "/", ""));
      }
    }
    expect(leftovers).toEqual([]);
  });

  it("requires every exemption to carry a reason", () => {
    for (const exemption of EXEMPTIONS) {
      expect(exemption.reason.length, exemption.file).toBeGreaterThan(30);
    }
  });
});
