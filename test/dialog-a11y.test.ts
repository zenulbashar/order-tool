import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The modal-dialog contract (audit A1 / A2).
 *
 * This app has no shared `<Dialog>` shell — each surface renders its own
 * `fixed inset-0` backdrop with a bespoke panel (bottom sheet, right drawer,
 * centred box). That is a deliberate design choice, but it means
 * `role="dialog" aria-modal="true"` is a PROMISE the markup cannot keep on its
 * own: focus trapping, Escape-to-close, initial focus and focus restoration all
 * come from `useDialog`.
 *
 * A1 found eight hand-rolled dialogs with none of it, and was fixed 7/8 — the
 * Square activity drawer closes by navigation rather than a callback, so it did
 * not fit the hook's original shape. It has since been given a router-based
 * close (`useDialog(() => router.push(closeHref))`) and is now covered too.
 *
 * The rule is enforced by DERIVATION rather than by a list of eight files, for
 * the reason the authz harness learned twice over: an enumeration goes stale the
 * moment someone adds a ninth dialog, and the ninth is exactly the one nobody
 * remembers to check.
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

const DIALOGS = tsxFiles(join(process.cwd(), "app")).filter((file) =>
  readFileSync(file, "utf8").includes('role="dialog"'),
);

const rel = (file: string) => file.replace(process.cwd() + "/", "");

describe("modal dialog contract", () => {
  it("finds the dialog surfaces it claims to", () => {
    // Guards the derivation — without this the assertions below pass vacuously
    // if the scan or the marker ever changes.
    expect(DIALOGS.length).toBeGreaterThanOrEqual(8);
    expect(
      DIALOGS.some((f) => f.endsWith("integrations/detail-drawer.tsx")),
      "the A1 remainder (Square activity drawer) must be in scope",
    ).toBe(true);
  });

  it("gives every dialog the keyboard contract via useDialog", () => {
    // Without the hook a keyboard user can Tab straight out of the panel into
    // the inert, scrim-obscured page behind it, and Escape does nothing.
    // Matches a CALL — `useDialog(` or `useDialog<T>(` — not the bare substring.
    // Mutation-testing caught that: renaming the hook to `useDialogXX` left
    // "useDialog" present as a prefix, so an `includes()` check stayed green
    // while the dialog had no keyboard contract at all.
    const CALLS_HOOK = /\buseDialog\s*(<[^>]*>)?\s*\(/;
    const missing = DIALOGS.filter(
      (file) => !CALLS_HOOK.test(readFileSync(file, "utf8")),
    ).map(rel);
    expect(
      missing,
      `role="dialog" without a useDialog(...) call — focus trap, Escape and ` +
        `focus restoration are all missing:\n` +
        missing.map((f) => `  ${f}`).join("\n"),
    ).toEqual([]);
  });

  it("declares aria-modal on every dialog", () => {
    // role="dialog" alone does not tell assistive tech the rest of the page is
    // inert; aria-modal is what does.
    const missing = DIALOGS.filter(
      (file) => !readFileSync(file, "utf8").includes("aria-modal"),
    ).map(rel);
    expect(missing, missing.join("\n")).toEqual([]);
  });

  it("gives every dialog an accessible name", () => {
    // An unnamed dialog is announced as just "dialog", which tells a screen
    // reader user nothing about what just opened.
    const missing = DIALOGS.filter((file) => {
      const source = readFileSync(file, "utf8");
      return !/aria-label|aria-labelledby/.test(source);
    }).map(rel);
    expect(missing, missing.join("\n")).toEqual([]);
  });
});
