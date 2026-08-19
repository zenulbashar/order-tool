import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { permissionsFor, type Permission } from "@/lib/authz";

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
 * Helpers that RESOLVE a venue. A file calling any of these touches tenant
 * state and therefore owes a permission gate.
 *
 * getCurrentVenue and requireOnboardedVenue are listed because they were an
 * open escape hatch: the check used to look for `requireVenue(` alone, so a new
 * action written against `getCurrentVenue()` would mutate tenant data and be
 * skipped as "touches no venue state" — while the docblock above promised new
 * files are covered automatically. A resolver added to lib/tenant.ts and not
 * added here silently widens that hole, so the test below pins this list
 * against tenant.ts's actual exports.
 */
const VENUE_RESOLVERS = [
  "requireVenue(",
  "getCurrentVenue(",
  "getImpersonatedVenue(",
  "requireOnboardedVenue(",
];

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
      // Membership is decided on the RAW source, deliberately. stripComments is
      // a regex, not a lexer: it mis-parses regex literals ending in \/\/ and
      // eats across a stray "/*" inside a line comment. If that ever removed a
      // "use server" directive, the file would drop out of the scan silently and
      // an ungated mutating action would be invisible — the exact failure this
      // harness exists to prevent. Deciding membership on raw text makes the
      // regex's failure direction fail-CLOSED: at worst a file that merely
      // mentions the directive in prose is scanned, which costs nothing because
      // it will not resolve a venue either. Comments are stripped only for the
      // gate checks below, where over-deletion turns a test RED, not green.
      if (readFileSync(full, "utf8").includes('"use server"')) out.push(full);
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
      const resolvesVenue =
        VENUE_RESOLVERS.some((r) => source.includes(r)) || isGated(source);
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

  /**
   * The onboarding STEP pages. The scan above only walks `.ts` files carrying
   * a "use server" directive, so these `.tsx` pages are invisible to it — and
   * S5 was a page-level hole as much as an action-level one. Reverting any of
   * them to a bare `requireVenue()` re-opens read access to wizard state for a
   * kitchen login, and nothing else in the suite would notice.
   */
  const WIZARD_PAGES = [
    "app/onboarding/service/page.tsx",
    "app/onboarding/menu/page.tsx",
    "app/onboarding/stations/page.tsx",
    "app/onboarding/plan/page.tsx",
    "app/onboarding/live/page.tsx",
  ];

  it("gates every onboarding step page on the wizard guard", () => {
    for (const page of WIZARD_PAGES) {
      const source = code(join(process.cwd(), page));
      expect(source, `${page} must call requireWizardVenue()`).toContain(
        "requireWizardVenue(",
      );
      expect(/\brequireVenue\(\)/.test(source), page).toBe(false);
    }
    // /onboarding/details must NOT be guarded — it creates the venue, and the
    // sidebar's "Add location" points at it while the current venue is complete.
    const details = code(join(process.cwd(), "app/onboarding/details/page.tsx"));
    expect(details).not.toContain("requireWizardVenue(");
  });

  it("knows about every venue resolver lib/tenant.ts exports", () => {
    // VENUE_RESOLVERS decides which files owe a gate. A resolver added to
    // tenant.ts but not listed there would let a new action mutate tenant data
    // and be skipped as "touches no venue state" — so derive the truth from
    // tenant.ts rather than trusting the constant.
    const tenant = stripComments(
      readFileSync(join(process.cwd(), "lib", "tenant.ts"), "utf8"),
    );
    const known = [...VENUE_RESOLVERS, ...GATES];
    const missing: string[] = [];
    for (const match of tenant.matchAll(/export async function (\w+)/g)) {
      const name = match[1];
      // Look at the signature only, up to the opening brace of the body.
      const sig = tenant.slice(match.index, tenant.indexOf("{", match.index));
      const returnsOneVenue =
        /Promise<Venue\s*(\|\s*null\s*)?>/.test(sig) && !sig.includes("Venue[]");
      if (returnsOneVenue && !known.includes(`${name}(`)) missing.push(name);
    }
    expect(
      missing,
      `lib/tenant.ts exports venue resolver(s) the coverage scan does not know ` +
        `about — add them to VENUE_RESOLVERS or GATES:\n` +
        missing.map((m) => `  ${m}`).join("\n"),
    ).toEqual([]);
  });

  /** Every dashboard page.tsx that gates on a permission, as href -> permission. */
  function gatedPages(): Map<string, string> {
    const out = new Map<string, string>();
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
        } else if (entry === "page.tsx") {
          const match = /requireVenuePermission\(\s*"([^"]+)"/.exec(code(full));
          if (!match) continue;
          const href = full
            .replace(process.cwd() + "/app", "")
            .replace(/\/page\.tsx$/, "");
          out.set(href, match[1]);
        }
      }
    };
    walk(join(process.cwd(), "app", "dashboard"));
    return out;
  }

  it("hides sidebar links whose page the viewer cannot open", () => {
    // Presentation, not access control — but drift here is still a bug in both
    // directions: an unannotated link sends a kitchen login to
    // /dashboard?denied=1, and an entry annotated with the WRONG permission
    // hides a page from someone entitled to it. Derived from the pages, so a
    // newly gated page with a stale nav entry fails without anyone remembering
    // to update a list.
    const sidebar = code(join(process.cwd(), "app/dashboard/sidebar.tsx"));
    const nav = new Map<string, string | null>();
    // Nav leaves are flat object literals, so a brace-free match is exact.
    for (const m of sidebar.matchAll(/\{[^{}]*?href:\s*"([^"]+)"[^{}]*?\}/g)) {
      const perm = /permission:\s*"([^"]+)"/.exec(m[0]);
      nav.set(m[1], perm ? perm[1] : null);
    }

    const mismatches: string[] = [];
    for (const [href, permission] of gatedPages()) {
      if (!nav.has(href)) continue; // simply not linked from the sidebar
      if (nav.get(href) !== permission) {
        mismatches.push(
          `${href}: page requires "${permission}", sidebar entry says ` +
            `${nav.get(href) ? `"${nav.get(href)}"` : "no permission"}`,
        );
      }
    }
    expect(mismatches, mismatches.join("\n")).toEqual([]);
  });

  it("gates the money and PII read surfaces", () => {
    // The last piece of S6's root cause: the permission model was enforced on
    // writes and not on reads, so a kitchen login could read revenue, the diner
    // directory, payout state and promo codes. reports:view and orders:view
    // were declared in lib/authz.ts and enforced nowhere.
    const expected: Record<string, string> = {
      "/dashboard/reports": "reports:view",
      "/dashboard/customers": "reports:view",
      "/dashboard/billing": "billing:manage",
      "/dashboard/payments": "billing:manage",
      "/dashboard/discounts": "promotions:manage",
      "/dashboard/gift-cards": "giftcards:manage",
    };
    const actual = gatedPages();
    for (const [href, permission] of Object.entries(expected)) {
      expect(actual.get(href), `${href} must gate on ${permission}`).toBe(
        permission,
      );
    }
  });

  it("leaves the orders board readable by kitchen staff", () => {
    // The counterweight. Staff hold only orders:view/orders:manage, and the
    // whole point of the role is to run the pass — so gating the board itself
    // on anything they lack would lock them out of their own job. Pinned so a
    // future tightening pass has to make that decision deliberately.
    const board = code(join(process.cwd(), "app/dashboard/orders/page.tsx"));
    const gate = /requireVenuePermission\(\s*"([^"]+)"/.exec(board)?.[1];
    if (gate) {
      expect(permissionsFor(["staff"]).has(gate as Permission), gate).toBe(true);
    }
  });

  /**
   * The gap that let P9 through.
   *
   * Everything above scans `"use server"` files or checks pages that ALREADY
   * gate. A read-only Server Component that gates on nothing was out of scope
   * by construction — so `/dashboard` shipped rendering the venue's revenue,
   * average order value, 7-day trend and 30-day order mix on bare membership,
   * while `/dashboard/reports` gated the same figures on `reports:view`. The
   * audit found one instance; the class turned out to be 22 of 38 dashboard
   * pages, including every settings screen, all four stock screens (ingredient
   * COSTS) and the menu editor.
   *
   * A gate on the write without the same gate on the read is decorative — the
   * SECRET_PAGES docblock above says exactly that, one describe block earlier,
   * about one page. This generalises it: a dashboard page that resolves a
   * venue is gated, or it is listed here with the reason it is not.
   */
  const UNGATED_PAGES: { file: string; reason: string }[] = [
    {
      file: "app/dashboard/page.tsx",
      reason:
        "The denial destination. requireVenuePermission redirects to /dashboard, so gating /dashboard itself would bounce a denied viewer into a redirect loop. It stays open to every member and gates its privileged tiles inline on reports:view instead — asserted separately below.",
    },
  ];

  function dashboardPages(): string[] {
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (entry === "page.tsx") out.push(full);
      }
    };
    walk(join(process.cwd(), "app", "dashboard"));
    return out;
  }

  it("finds the dashboard pages it claims to", () => {
    // Guards the scan, exactly as the server-action scan above guards its own.
    const pages = dashboardPages();
    expect(pages.length).toBeGreaterThan(30);
    expect(pages.some((f) => f.endsWith("dashboard/page.tsx"))).toBe(true);
    expect(pages.some((f) => f.endsWith("settings/tax/page.tsx"))).toBe(true);
  });

  it("gates every venue-resolving dashboard page on a permission", () => {
    const exempt = new Set(UNGATED_PAGES.map((p) => p.file));
    const ungated: string[] = [];
    for (const file of dashboardPages()) {
      const rel = file.replace(process.cwd() + "/", "");
      if (exempt.has(rel)) continue;
      const source = code(file);
      const resolvesVenue = VENUE_RESOLVERS.some((r) => source.includes(r));
      if (!resolvesVenue && !isGated(source)) continue; // no venue state read
      if (!isGated(source)) ungated.push(rel);
    }

    expect(
      ungated,
      `Dashboard pages that read venue state behind NO permission. Every ` +
        `member, kitchen staff included, can open these by typing the URL:\n` +
        ungated.map((f) => `  ${f}`).join("\n"),
    ).toEqual([]);
  });

  it("leaves no bare requireVenue() in a gated dashboard page", () => {
    // Same rule the action files carry: requireVenuePermission resolves the
    // venue itself, so a leftover requireVenue() means a path skipped the gate.
    const exempt = new Set(UNGATED_PAGES.map((p) => p.file));
    const leftovers: string[] = [];
    for (const file of dashboardPages()) {
      const rel = file.replace(process.cwd() + "/", "");
      if (exempt.has(rel)) continue;
      if (/\brequireVenue\(\)/.test(code(file))) leftovers.push(rel);
    }
    expect(leftovers).toEqual([]);
  });

  it("gates the dashboard home's trading tiles on reports:view", () => {
    // The one exempt page owes an inline gate instead. Assert BOTH halves: the
    // permission is read, and the 30-day revenue query is conditional on it —
    // hiding the tiles while still running the query would leave the figures a
    // render away, and the fix is that they are never fetched.
    const home = code(join(process.cwd(), "app/dashboard/page.tsx"));
    expect(home).toContain('hasVenuePermission(venue.id, "reports:view")');
    expect(home).toContain("canViewReports");
    // The query sits on the true branch of the gate, not in an unconditional
    // Promise.all entry.
    expect(home).toMatch(/canViewReports\s*\n?\s*\?\s*db/);
  });

  it("leaves kitchen staff a usable dashboard", () => {
    // The counterweight to the sweep above. Gating 22 pages at once could
    // easily leave a staff login staring at an empty sidebar; the orders board
    // and bookings must survive, because running the pass IS the staff role.
    const held = permissionsFor(["staff"]);
    const reachable = [...gatedPages()].filter(([, permission]) =>
      held.has(permission as Permission),
    );
    expect(reachable.length).toBeGreaterThan(0);
    const hrefs = reachable.map(([href]) => href);
    expect(hrefs).toContain("/dashboard/orders");
    expect(hrefs).toContain("/dashboard/bookings");
  });

  it("requires every exemption to carry a reason", () => {
    for (const exemption of EXEMPTIONS) {
      expect(exemption.reason.length, exemption.file).toBeGreaterThan(30);
    }
  });
});
