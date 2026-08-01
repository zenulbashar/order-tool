import { describe, expect, it } from "vitest";

import {
  venueMenuTag,
  venueProfileTag,
  venueSlugTag,
  venueStorefrontTags,
} from "@/lib/cache-tags";

/**
 * Cache-tag contract (M6 / audit F6). F6's stated dependency is that every
 * mutation path must invalidate, "or stale menus will ship". These pin the
 * properties that make that survivable: tags are per-venue, they never
 * collide, and the invalidation helper covers every tag a storefront read
 * can be cached under.
 */

const VENUE = { id: "venue-1", slug: "corner-cafe" };

describe("tags are scoped to one venue", () => {
  it("never collides across venues", () => {
    // A collision would let one venue's edit clear (or fail to clear)
    // another's menu.
    expect(venueMenuTag("venue-1")).not.toBe(venueMenuTag("venue-2"));
    expect(venueProfileTag("venue-1")).not.toBe(venueProfileTag("venue-2"));
    expect(venueSlugTag("a-cafe")).not.toBe(venueSlugTag("b-cafe"));
  });

  it("keeps the menu and profile tags distinct for the same venue", () => {
    expect(venueMenuTag(VENUE.id)).not.toBe(venueProfileTag(VENUE.id));
  });

  it("is deterministic, so producer and invalidator always agree", () => {
    expect(venueMenuTag(VENUE.id)).toBe(venueMenuTag(VENUE.id));
    expect(venueSlugTag(VENUE.slug)).toBe(venueSlugTag(VENUE.slug));
  });

  it("stays within Next's 256-character tag limit", () => {
    const longId = "v".repeat(200);
    for (const tag of [venueMenuTag(longId), venueProfileTag(longId)]) {
      expect(tag.length).toBeLessThanOrEqual(256);
    }
  });
});

describe("slug tags normalise like the lookup does", () => {
  it("matches however the URL was cased or padded", () => {
    // getPublicVenueBySlug lowercases and trims before querying, so the tag
    // must too — otherwise an invalidation would miss the cached entry.
    expect(venueSlugTag("  Corner-Cafe  ")).toBe(venueSlugTag("corner-cafe"));
    expect(venueSlugTag("CORNER-CAFE")).toBe(venueSlugTag("corner-cafe"));
  });
});

describe("venueStorefrontTags covers every cached storefront read", () => {
  it("includes the menu, profile and slug tags", () => {
    const tags = venueStorefrontTags(VENUE);
    // These are exactly the three tags used by getPublicMenu, getPublicFaqs
    // and getPublicVenueBySlug. A read cached under a tag NOT in this list
    // would never be invalidated by a menu edit.
    expect(tags).toContain(venueMenuTag(VENUE.id));
    expect(tags).toContain(venueProfileTag(VENUE.id));
    expect(tags).toContain(venueSlugTag(VENUE.slug));
    expect(tags).toHaveLength(3);
  });

  it("returns no duplicates", () => {
    const tags = venueStorefrontTags(VENUE);
    expect(new Set(tags).size).toBe(tags.length);
  });
});
