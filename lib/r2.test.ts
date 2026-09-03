import { describe, expect, it } from "vitest";

import { venueOwnedR2Key } from "@/lib/r2";

/**
 * R2 cleanup only ever deletes objects in the CALLING venue's own namespace.
 * The "paste a hosted URL" settings accept any URL — including another venue's
 * public R2 URL — so recovering a key from a stored URL without an ownership
 * check would let one venue delete another's logo or photos.
 */

const BASE = "https://cdn.example.com";

describe("venueOwnedR2Key", () => {
  it("recovers the key for the venue's own object", () => {
    expect(
      venueOwnedR2Key(`${BASE}/venues/v1/logo/a.png`, BASE, "v1"),
    ).toBe("venues/v1/logo/a.png");
  });

  it("tolerates a trailing slash on the configured public base", () => {
    expect(
      venueOwnedR2Key(`${BASE}/venues/v1/logo/a.png`, `${BASE}/`, "v1"),
    ).toBe("venues/v1/logo/a.png");
  });

  it("refuses another venue's object even on our own bucket", () => {
    // Venue v1 pasted v2's public logo URL, then hit "remove": the object is
    // v2's and must survive.
    expect(
      venueOwnedR2Key(`${BASE}/venues/v2/logo/a.png`, BASE, "v1"),
    ).toBeNull();
  });

  it("does not let a venue id prefix-match a longer id", () => {
    expect(
      venueOwnedR2Key(`${BASE}/venues/v12/logo/a.png`, BASE, "v1"),
    ).toBeNull();
  });

  it("refuses objects outside the venues namespace", () => {
    expect(venueOwnedR2Key(`${BASE}/system/a.png`, BASE, "v1")).toBeNull();
  });

  it("ignores URLs on other hosts and empty inputs", () => {
    expect(
      venueOwnedR2Key("https://other.example/venues/v1/logo/a.png", BASE, "v1"),
    ).toBeNull();
    expect(venueOwnedR2Key("", BASE, "v1")).toBeNull();
    expect(venueOwnedR2Key(`${BASE}/venues/v1/logo/a.png`, BASE, "")).toBeNull();
  });
});
