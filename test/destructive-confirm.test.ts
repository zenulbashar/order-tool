import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Confirmation on row-destroying actions (audit R1/R2, extended under R3).
 *
 * R1 found four destructive actions with no confirmation and fixed those four.
 * R3 then asked whether the app has a consistent removal policy at all. Reading
 * what each action DOES rather than what it is called, it turns out it does:
 *
 *   - value-bearing or audit-relevant things are soft-marked — a discount pauses
 *     (`isActive`), a gift card voids (`status`), an invitation revokes
 *     (`revokedAt`). Nothing that a diner or an auditor might later ask about is
 *     erased.
 *   - configuration rows are hard-deleted — tables, stations, ingredients, menu
 *     rows, library images.
 *
 * That is a coherent policy, not the inconsistency the finding read off the
 * button labels. The one genuine breach was `removeMemberAction`: it DELETES the
 * membership row, revoking someone's access, and it rendered as a plain
 * secondary pill with no confirmation.
 *
 * The rule is derived from the IMPLEMENTATION, which is what makes it hold up: a
 * name-based rule would have demanded a confirm on `removeVenueLogo` (which
 * nulls a column and is undone by re-uploading) while missing
 * `removeMemberAction` if it were ever renamed. Issuing a `db.delete` is the
 * thing that cannot be undone.
 */

const ROOT = process.cwd();

/** Actions that delete-then-reinsert as a save strategy, not a user removal. */
const REPLACE_NOT_REMOVE = new Set([
  "saveVenueFaqs", // replaces the FAQ list wholesale
  "saveStations", // onboarding step re-saves its set
  "setShopProductOverride", // clears an override row to restore the default
  "setMemberRoleAction", // swaps role rows; the member stays
]);

function walk(dir: string, suffix: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full, suffix));
    else if (entry.endsWith(suffix)) out.push(full);
  }
  return out;
}

const rel = (file: string) => file.replace(ROOT + "/", "");

/** Exported server actions that issue a db/tx `.delete(`, minus the replacers. */
function rowDestroyingActions(): { file: string; name: string }[] {
  const found: { file: string; name: string }[] = [];
  for (const file of walk(join(ROOT, "app"), "actions.ts")) {
    const src = readFileSync(file, "utf8");
    for (const chunk of src.split(/(?=^export async function )/m)) {
      const name = /^export async function (\w+)/.exec(chunk)?.[1];
      if (!name || REPLACE_NOT_REMOVE.has(name)) continue;
      if (/\b(?:db|tx)\s*\.\s*delete\s*\(/.test(chunk)) found.push({ file, name });
    }
  }
  return found;
}

/** Every .tsx in the action's own directory tree that imports it. */
function callSites(actionFile: string, name: string): string[] {
  const dir = dirname(actionFile);
  // Actions are imported by siblings via "./actions" or by the page above it.
  const scope = walk(dirname(dir), ".tsx");
  return scope.filter((file) => {
    const src = readFileSync(file, "utf8");
    return new RegExp(`\\b${name}\\b`).test(src) && /from "\.[./]*actions"/.test(src);
  });
}

/**
 * Whether this file confirms, OR delegates its submit button to a local
 * component that does. media/page.tsx renders <DeleteImageButton/>, which is
 * the ConfirmSubmit wrapper — a check that only read the file itself would call
 * that unconfirmed and be wrong.
 *
 * One level deep is enough here and is deliberate: an unbounded import walk
 * eventually reaches something containing the word "confirm" and starts passing
 * everything.
 */
function confirmsSomewhere(file: string): boolean {
  // Both spellings: ingredient-row.tsx calls bare confirm(...) while
  // delete-image-button.tsx calls window.confirm(...). Matching only one of
  // them reported the other as a gap — which it did, in both directions,
  // before this settled on \bconfirm\s*\( .
  const hasConfirm = (src: string) =>
    /\bConfirmSubmit\b/.test(src) || /\bconfirm\s*\(/.test(src);

  const src = readFileSync(file, "utf8");
  if (hasConfirm(src)) return true;

  for (const [, spec] of src.matchAll(/from "(\.[^"]*)"/g)) {
    for (const ext of [".tsx", ".ts"]) {
      const target = resolve(dirname(file), spec + ext);
      try {
        if (hasConfirm(readFileSync(target, "utf8"))) return true;
      } catch {
        // Not a local file we can read — nothing to follow.
      }
    }
  }
  return false;
}

describe("row-destroying actions are confirmed", () => {
  const actions = rowDestroyingActions();

  it("finds the destructive actions it claims to", () => {
    // Guards the derivation. If the split or the db.delete regex stops matching,
    // the rule below passes while checking nothing.
    expect(actions.length).toBeGreaterThan(5);
    expect(actions.map((a) => a.name)).toContain("deleteTable");
    expect(actions.map((a) => a.name)).toContain("removeMemberAction");
  });

  it("every UI that triggers one asks for confirmation first", () => {
    const unconfirmed: string[] = [];

    for (const { file, name } of actions) {
      for (const site of callSites(file, name)) {
        if (!confirmsSomewhere(site)) {
          unconfirmed.push(`${rel(site)} triggers ${name}`);
        }
      }
    }

    expect(
      [...new Set(unconfirmed)].sort(),
      "these submit an action that DELETES rows without confirming first — " +
        "use <ConfirmSubmit>, which also renders the destructive Button variant " +
        "so the intent reads the same everywhere (audit R1/R2)",
    ).toEqual([]);
  });

  it("soft-removal paths are left alone", () => {
    // The other half of the policy, asserted so a future "make everything
    // confirm" sweep has to notice these are deliberately different. A voided
    // gift card and a revoked invitation stay on the row: one is a bearer
    // instrument an auditor may ask about, the other is undone by re-inviting.
    const giftCards = readFileSync(join(ROOT, "lib/giftcards/manage.ts"), "utf8");
    expect(giftCards).toMatch(/status:\s*"void/);
    expect(giftCards).not.toMatch(/\bdb\s*\.\s*delete\s*\(/);

    const invitations = readFileSync(
      join(ROOT, "lib/staff/invitations.ts"),
      "utf8",
    );
    expect(invitations).toMatch(/revokedAt:/);
  });

  it("scans real files (not an empty directory walk)", () => {
    expect(walk(join(ROOT, "app"), "actions.ts").length).toBeGreaterThan(10);
  });
});
