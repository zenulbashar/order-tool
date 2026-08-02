import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Dashboard navigation targets that are easy to get wrong because both routes
 * exist and neither 404s.
 *
 * `/onboarding` is the RESUME router (`app/onboarding/page.tsx`): it sends a
 * venue whose onboarding is COMPLETE straight to `/dashboard`. That makes it
 * correct for "finish setup" and wrong for "add a location" — an owner whose
 * current venue is live just bounces off it.
 *
 * That is not hypothetical. The venue switcher's "＋ Add another location"
 * pointed at `/onboarding`, and because that link only appears once an owner
 * already has a venue (normally a live one), an owner with two locations had no
 * working path to a third. The sidebar's single-venue "Add location" pointed at
 * `/onboarding/details` all along, so the two affordances disagreed.
 */

const CREATE_VENUE_ROUTE = "/onboarding/details";

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...tsxFiles(full));
    else if (entry.endsWith(".tsx")) out.push(full);
  }
  return out;
}

describe("dashboard navigation targets", () => {
  const files = tsxFiles(join(process.cwd(), "app", "dashboard"));

  it("finds the dashboard components it claims to", () => {
    // Guards the scan so the assertion below cannot pass vacuously.
    expect(files.length).toBeGreaterThan(10);
    expect(files.some((f) => f.endsWith("venue-switcher.tsx"))).toBe(true);
    expect(files.some((f) => f.endsWith("sidebar.tsx"))).toBe(true);
  });

  it("points every add-a-location link at the route that creates one", () => {
    const wrong: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      // Each <Link href="/onboarding"> … </Link> with its visible label.
      for (const match of source.matchAll(
        /<Link[^>]*href="\/onboarding"[^>]*>([\s\S]*?)<\/Link>/g,
      )) {
        const label = match[1];
        if (/\badd\b/i.test(label)) {
          wrong.push(
            `${file.replace(process.cwd() + "/", "")}: "${label.trim()}" links to ` +
              `/onboarding, which bounces a completed venue to /dashboard. ` +
              `Use ${CREATE_VENUE_ROUTE}.`,
          );
        }
      }
    }
    expect(wrong, wrong.join("\n")).toEqual([]);
  });

  it("keeps a working add-a-location affordance for owners who have one", () => {
    // The switcher is the only add-location entry point once an owner has two
    // or more venues — the sidebar's link is single-venue only
    // (`hasMultiple ? null : …`). If this regresses, multi-location owners are
    // silently capped again.
    const switcher = readFileSync(
      join(process.cwd(), "app/dashboard/venue-switcher.tsx"),
      "utf8",
    );
    expect(switcher).toContain(`href="${CREATE_VENUE_ROUTE}"`);
  });
});
