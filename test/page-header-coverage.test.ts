import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Owner-surface page headers (audit D4).
 *
 * `<PageHeader>` exists so every owner page gets the same title / description /
 * action row. 35 of the 36 pages used it; the tables board hand-rolled its own,
 * which is how a shared component quietly stops being shared.
 *
 * Pinned as a DERIVED rule rather than a file list, for the reason the authz and
 * dialog harnesses each learned: an enumeration goes stale the moment someone
 * adds page 37, and page 37 is exactly the one nobody remembers to check. The
 * rule "no owner page writes its own <h1>" needs no maintenance and fails a new
 * hand-rolled header on the way in.
 *
 * Scope note: app/dashboard only, deliberately. `app/admin` is the internal
 * platform console with its own layout, and `app/[slug]` is the diner storefront
 * whose <h1> is the venue name in a hero — neither is this shape.
 */

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...tsxFiles(full));
    else if (entry.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const rel = (file: string) => file.replace(process.cwd() + "/", "");

const DASHBOARD = tsxFiles(join(process.cwd(), "app", "dashboard"));

describe("owner pages use the shared PageHeader", () => {
  it("finds the dashboard tree it claims to", () => {
    // Guards the derivation — without this every assertion below passes
    // vacuously if the tree moves or the walk breaks.
    expect(DASHBOARD.length).toBeGreaterThan(30);
  });

  it("no owner page renders its own <h1>", () => {
    const offenders = DASHBOARD.filter((file) =>
      /<h1[\s>]/.test(readFileSync(file, "utf8")),
    ).map(rel);

    expect(
      offenders,
      "these render a bare <h1>; the page title belongs to <PageHeader> " +
        "(app/_components/page-header.tsx) so every owner page keeps the same " +
        "title / description / action row",
    ).toEqual([]);
  });

  it("PageHeader is what supplies that heading", () => {
    // The rule above is only meaningful while PageHeader actually emits the
    // heading — otherwise "no <h1> anywhere" is satisfied by having no page
    // heading at all, which is worse than the drift it replaced.
    const header = readFileSync(
      join(process.cwd(), "app/_components/page-header.tsx"),
      "utf8",
    );
    expect(header).toMatch(/<h1[\s>]/);

    const users = DASHBOARD.filter((file) =>
      /\bPageHeader\b/.test(readFileSync(file, "utf8")),
    ).length;
    expect(users).toBeGreaterThan(30);
  });
});
