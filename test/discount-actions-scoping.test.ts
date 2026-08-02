import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Ownership controls on the owner-discount actions (audit R3).
 *
 * `promotions` is a cross-tenant, value-bearing table: it holds every venue's
 * codes AND the platform's campaigns, including the co-funding percentages the
 * platform settles against. Two controls keep an owner inside their own row set,
 * and NEITHER is enforced by the type system:
 *
 *  - update must carry the session's venue in its WHERE. Deleting
 *    `eq(promotions.ownerVenueId, venue.id)` leaves a clean tsc and a green
 *    suite, because drizzle will happily update by id alone.
 *  - create must FORCE fundingSource/platformFundedPercent/scope/ownerVenueId
 *    rather than accept them. Checked directly: adding an unknown field to the
 *    object spread into `.values()` produces NO type error — the same gap as
 *    `.set()` being all-optional, which is exactly what let S4's bug survive a
 *    green suite.
 *
 * So both are asserted here, driving the REAL actions with only auth, tenant and
 * db mocked. A comment claiming "IDOR-safe" is not a control.
 */

const state = vi.hoisted(() => ({
  /** The venue the SESSION resolves to — never what the form claims. */
  sessionVenueId: "venue-1",
  /** Every update the action issued: its SET payload and WHERE conditions. */
  updates: [] as { set: Record<string, unknown>; where: unknown }[],
  /** Every row handed to an insert, in call order. */
  inserts: [] as { values: Record<string, unknown> }[],
  /** Rows .returning() resolves to; [] models "no row matched the WHERE". */
  returning: [{ id: "promo-1" }] as { id: string }[],
  /** Make the write throw, to exercise the duplicate-code path. */
  throws: false,
  revalidated: [] as string[],
}));

vi.mock("@/lib/auth", () => ({
  auth: async () => ({ user: { id: "user-1" } }),
}));

vi.mock("@/lib/tenant", () => ({
  requireVenuePermission: async () => ({ id: state.sessionVenueId }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => {
    state.revalidated.push(path);
  },
}));

vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("redirected");
  },
}));

/**
 * Inserts are recorded in CALL ORDER — the promotion first, then its
 * promotion_venues row — rather than by table name. drizzle keeps the SQL name
 * behind a symbol whose shape is an internal detail, and a label that silently
 * degrades to "unknown" reads like information while carrying none.
 */
const tx = {
  insert: () => ({
    values: (values: Record<string, unknown>) => {
      state.inserts.push({ values });
      if (state.throws) throw new Error("unique violation");
      return {
        returning: async () => state.returning,
        then: (resolve: (v: unknown) => unknown) => resolve(undefined),
      };
    },
  }),
};

vi.mock("@/lib/db", () => ({
  db: {
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: (where: unknown) => ({
          returning: async () => {
            state.updates.push({ set: values, where });
            if (state.throws) throw new Error("unique violation");
            return state.returning;
          },
        }),
      }),
    }),
    transaction: async (fn: (t: typeof tx) => Promise<void>) => fn(tx),
  },
}));

// Imported after the mocks so the actions bind to them.
const { createOwnerDiscount, updateOwnerDiscount } = await import(
  "@/app/dashboard/discounts/actions"
);

/**
 * The venue ids named anywhere in a drizzle WHERE tree. Walks the SQL chunks
 * rather than matching a rendered string, so it sees the bound PARAMETERS —
 * which is where an unscoped update betrays itself.
 */
function idsIn(
  node: unknown,
  found: string[] = [],
  // drizzle's tree is cyclic (a column points back at its table), so the walk
  // needs a visited set or it never terminates.
  seen: WeakSet<object> = new WeakSet(),
): string[] {
  if (node === null || typeof node !== "object") {
    if (typeof node === "string") found.push(node);
    return found;
  }
  if (seen.has(node)) return found;
  seen.add(node);
  for (const value of Object.values(node as Record<string, unknown>)) {
    idsIn(value, found, seen);
  }
  return found;
}

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const VALID = {
  id: "promo-1",
  name: "Launch week",
  code: "LAUNCH10",
  type: "percent",
  value: "15",
};

describe("updateOwnerDiscount", () => {
  beforeEach(() => {
    state.sessionVenueId = "venue-1";
    state.updates = [];
    state.inserts = [];
    state.returning = [{ id: "promo-1" }];
    state.throws = false;
    state.revalidated = [];
  });

  it("scopes the update to the SESSION's venue", async () => {
    const result = await updateOwnerDiscount({}, form(VALID));

    expect(result).toEqual({ success: true });
    expect(state.updates).toHaveLength(1);

    const bound = idsIn(state.updates[0].where);
    expect(bound).toContain("venue-1");
    expect(bound).toContain("promo-1");
  });

  it("does not take the venue from the form", async () => {
    // A crafted POST naming another tenant must not reach the WHERE — every
    // server action is a public endpoint, so this is the actual attack shape.
    await updateOwnerDiscount(
      {},
      form({ ...VALID, venueId: "venue-2", ownerVenueId: "venue-2" }),
    );

    const bound = idsIn(state.updates[0].where);
    expect(bound).toContain("venue-1");
    expect(bound).not.toContain("venue-2");
  });

  it("reports not-found when the id isn't this venue's, instead of success", async () => {
    // Zero rows is what an id belonging to another tenant produces. Returning
    // success there would tell an owner their edit saved when nothing changed.
    state.returning = [];

    const result = await updateOwnerDiscount({}, form(VALID));

    expect(result).toEqual({ error: "That code no longer exists." });
    expect(state.revalidated).toEqual([]);
  });

  it("never writes ownership or active state", async () => {
    // isActive belongs to pause/resume: folding it in here would let a save
    // silently un-pause a code. ownerVenueId must not be re-settable at all.
    await updateOwnerDiscount({}, form({ ...VALID, isActive: "true" }));

    const written = state.updates[0].set;
    expect(written).not.toHaveProperty("isActive");
    expect(written).not.toHaveProperty("ownerVenueId");
    expect(written).not.toHaveProperty("fundingSource");
    expect(written).not.toHaveProperty("scope");
  });

  it("writes the parsed money values, not the raw strings", async () => {
    await updateOwnerDiscount(
      {},
      form({ ...VALID, type: "amount", value: "7.50", minBasket: "20" }),
    );

    expect(state.updates[0].set).toMatchObject({
      type: "amount",
      value: 750,
      minBasketCents: 2000,
      code: "LAUNCH10",
    });
  });

  it("rejects an invalid form before touching the database", async () => {
    const result = await updateOwnerDiscount({}, form({ ...VALID, value: "200" }));

    expect(result).toEqual({ error: "A percentage can’t be over 100." });
    expect(state.updates).toEqual([]);
  });

  it("requires an id", async () => {
    const noId = { ...VALID };
    delete (noId as Partial<typeof VALID>).id;
    const result = await updateOwnerDiscount({}, form(noId));

    expect(result).toEqual({ error: "Missing discount id." });
    expect(state.updates).toEqual([]);
  });

  it("maps a unique-index violation to the duplicate-code message", async () => {
    state.throws = true;

    const result = await updateOwnerDiscount({}, form(VALID));

    expect(result).toEqual({ error: "That code is already in use. Try another." });
  });

  it("revalidates the discounts page on success", async () => {
    await updateOwnerDiscount({}, form(VALID));
    expect(state.revalidated).toEqual(["/dashboard/discounts"]);
  });
});

describe("createOwnerDiscount", () => {
  beforeEach(() => {
    state.sessionVenueId = "venue-1";
    state.updates = [];
    state.inserts = [];
    state.returning = [{ id: "promo-1" }];
    state.throws = false;
    state.revalidated = [];
  });

  it("forces merchant funding, single-venue scope and session ownership", async () => {
    // The four values that keep an owner-created promo out of the platform's
    // co-funding accounting and off other venues. None is type-enforced: an
    // extra key spread into .values() raises no tsc error, so if a future
    // refactor lets the form supply these, only this assertion notices.
    const result = await createOwnerDiscount({}, form(VALID));
    expect(result).toEqual({ success: true });

    const promo = state.inserts[0].values;
    expect(promo).toMatchObject({
      fundingSource: "merchant",
      platformFundedPercent: 0,
      scope: "selected",
      ownerVenueId: "venue-1",
      isActive: true,
    });
  });

  it("ignores funding and ownership fields supplied by the form", async () => {
    // Every server action is a public POST endpoint, so this is the shape an
    // attacker would actually send: claim platform funding, bill the platform.
    await createOwnerDiscount(
      {},
      form({
        ...VALID,
        fundingSource: "platform",
        platformFundedPercent: "100",
        scope: "all",
        ownerVenueId: "venue-2",
      }),
    );

    expect(state.inserts[0].values).toMatchObject({
      fundingSource: "merchant",
      platformFundedPercent: 0,
      scope: "selected",
      ownerVenueId: "venue-1",
    });
  });

  it("targets the new promo at the session's venue only", async () => {
    await createOwnerDiscount({}, form({ ...VALID, venues: "venue-2" }));

    // Two inserts: the promotion, then its single promotion_venues row.
    expect(state.inserts).toHaveLength(2);
    expect(state.inserts[1].values).toEqual({
      promotionId: "promo-1",
      venueId: "venue-1",
    });
  });

  it("writes the parsed money values, not the raw strings", async () => {
    await createOwnerDiscount(
      {},
      form({ ...VALID, type: "amount", value: "7.50", minBasket: "20" }),
    );

    expect(state.inserts[0].values).toMatchObject({
      type: "amount",
      value: 750,
      minBasketCents: 2000,
      code: "LAUNCH10",
    });
  });

  it("rejects an invalid form before touching the database", async () => {
    const result = await createOwnerDiscount({}, form({ ...VALID, value: "200" }));

    expect(result).toEqual({ error: "A percentage can’t be over 100." });
    expect(state.inserts).toEqual([]);
  });

  it("maps a unique-index violation to the duplicate-code message", async () => {
    state.throws = true;

    const result = await createOwnerDiscount({}, form(VALID));

    expect(result).toEqual({ error: "That code is already in use. Try another." });
  });
});
