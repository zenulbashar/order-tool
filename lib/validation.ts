import { z } from "zod";

/**
 * Canonical email form used everywhere we read or write a user's email.
 *
 * Auth.js only lower-cases the domain by default, which let mixed-case local
 * parts create duplicate accounts on roster-tool. Fully lower-casing here, plus
 * the UNIQUE INDEX on lower(email), closes that gap. Wired into the Resend
 * provider via `normalizeIdentifier`.
 */
export function normalizeEmail(identifier: string): string {
  const email = identifier.trim().toLowerCase();
  if ((email.match(/@/g) ?? []).length !== 1 || email.startsWith("@") || email.endsWith("@")) {
    throw new Error("A single valid email address is required.");
  }
  return email;
}

export const venueNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a venue name.")
  .max(80, "Venue name is too long.");

/**
 * URL-safe venue slug: lowercase alphanumerics separated by single hyphens.
 * Input is trimmed and lower-cased before validation so casing never blocks a
 * sign-up. Uniqueness is enforced separately (pre-check + unique index).
 */
export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Address must be at least 3 characters.")
  .max(40, "Address must be at most 40 characters.")
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Use lowercase letters, numbers, and single hyphens.",
  );

/**
 * Derive a SUGGESTED storefront slug from a venue name (Phase 3a onboarding).
 *
 * This fixes the old onboarding's footgun where owners hand-typed the public
 * link field (and sometimes typed a street address into it). The wizard now
 * pre-fills the link from the name: lower-case, strip accents, replace any run
 * of non-alphanumerics with a single hyphen, and trim hyphens, capped at the
 * slug's 40-char max. It is only a SUGGESTION — the owner can edit it, and
 * slugSchema + isReservedSlug remain the authoritative validators at submit
 * time. May return "" for an all-symbol name; the form keeps the field editable
 * so the owner can supply one.
 */
export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

/**
 * Dine-in table label (Phase 10), e.g. "1" or "Patio 3". Required and trimmed.
 * Capped at 40 to MATCH the checkout tableLabel bound (see placeOrderSchema),
 * so a label baked into a QR deep-link can never exceed what checkout accepts
 * when the customer lands on {slug}?table=<label>.
 */
export const tableLabelSchema = z
  .string()
  .trim()
  .min(1, "Enter a table name.")
  .max(40, "Table name is too long.");

/* -------------------------------------------------------------------------- */
/* Menu catalog (Phase 1)                                                     */
/*                                                                            */
/* Notes on the menu schemas:                                                 */
/*  - venue_id is NEVER part of any payload; ownership is set/enforced        */
/*    server-side from requireVenue() and is immutable.                       */
/*  - Booleans (is_active / is_available) come from checkboxes and are read   */
/*    directly in the action (`value === "on"`), not through zod.             */
/*  - Parent ids (category/item/group) are validated as idSchema and their    */
/*    ownership is re-checked against the DB in the action.                   */
/* -------------------------------------------------------------------------- */

/** Format integer cents as a dollars string for display/edit fields. */
export function formatCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

export const idSchema = z.string().trim().min(1, "Missing identifier.");

export const menuNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a name.")
  .max(100, "Name is too long.");

/** Optional free text; empty input is stored as null. */
export const menuDescriptionSchema = z
  .string()
  .trim()
  .max(500, "Description is too long.")
  .transform((value) => (value.length > 0 ? value : null));

/**
 * Prices are entered in dollars and converted to INTEGER CENTS server-side.
 * Math.round absorbs binary-float error (e.g. 12.99 * 100 === 1298.999…).
 * Non-negative by construction; the DB CHECK constraints are the final backstop.
 */
export const priceDollarsToCentsSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, "Enter an amount like 12.50.")
  .transform((value) => Math.round(Number(value) * 100));

const wholeNumberSchema = (message: string) =>
  z
    .string()
    .trim()
    .regex(/^\d+$/, message)
    .transform((value) => Number(value));

export const minSelectSchema = wholeNumberSchema(
  "Min select must be a whole number (0 or more).",
);

export const maxSelectSchema = wholeNumberSchema(
  "Max select must be a whole number.",
).refine((value) => value >= 1, "Max select must be at least 1.");

/* Category */
export const categoryCreateSchema = z.object({
  name: menuNameSchema,
  description: menuDescriptionSchema,
});
export const categoryUpdateSchema = categoryCreateSchema;

/*
 * Item (price entered in dollars under the `priceCents` key → cents out).
 * NOTE: image_url is NOT part of this payload — a photo is set/replaced/removed
 * only via the dedicated upload actions (uploadItemPhoto/removeItemPhoto), so
 * editing an item's name/price never touches its photo.
 */
export const itemCreateSchema = z.object({
  name: menuNameSchema,
  description: menuDescriptionSchema,
  priceCents: priceDollarsToCentsSchema,
});
export const itemUpdateSchema = itemCreateSchema;

/* Modifier group (Required is derived: min_select >= 1). */
export const groupCreateSchema = z
  .object({
    name: menuNameSchema,
    minSelect: minSelectSchema,
    maxSelect: maxSelectSchema,
  })
  .refine((data) => data.minSelect <= data.maxSelect, {
    message: "Min select can't exceed max select.",
    path: ["minSelect"],
  });
export const groupUpdateSchema = groupCreateSchema;

/* Modifier option (delta entered in dollars under `priceDeltaCents`). */
export const optionCreateSchema = z.object({
  name: menuNameSchema,
  priceDeltaCents: priceDollarsToCentsSchema,
});
export const optionUpdateSchema = optionCreateSchema;

/*
 * Item size variant (Phase 5a). The variant's price is ABSOLUTE and required —
 * it IS the item's price when variants exist — so this reuses the same
 * dollars->cents handling as the item price (under `priceCents`), not the
 * modifier option's optional delta. Reorder is validated inline in the action
 * (id + direction), matching moveOption — no separate schema.
 */
export const variantCreateSchema = z.object({
  name: menuNameSchema,
  priceCents: priceDollarsToCentsSchema,
});
export const variantUpdateSchema = variantCreateSchema;

/* -------------------------------------------------------------------------- */
/* Dietary / allergen tags (Phase 7)                                          */
/*                                                                            */
/* Single source of truth for the controlled vocabulary: its members, their   */
/* customer-facing labels, the canonical display order, and the mandatory      */
/* life-safety disclaimer. Imported by the owner editor, the menu_item_tags    */
/* writes, the public payload (to sort tags), and every storefront surface, so */
/* none of them can drift. The values MUST stay in lockstep with the           */
/* dietary_tag pgEnum in lib/db/schema.ts.                                      */
/*                                                                            */
/* LIFE-SAFETY: these are venue-set SUGGESTIONS, never platform guarantees.    */
/* The label is "Gluten friendly" (never "gluten free") on purpose, and the    */
/* disclaimer is shown wherever tags/filters appear.                           */
/* -------------------------------------------------------------------------- */
export const DIETARY_TAGS = [
  { value: "vegan", label: "Vegan" },
  { value: "vegetarian", label: "Vegetarian" },
  { value: "gluten_friendly", label: "Gluten friendly" },
  { value: "dairy_free", label: "Dairy free" },
  { value: "halal", label: "Halal" },
  { value: "nut_free", label: "Nut free" },
  { value: "spicy", label: "Spicy" },
] as const;

export type DietaryTag = (typeof DIETARY_TAGS)[number]["value"];

/** Validates one tag against the vocab; off-list values are rejected. */
export const dietaryTagSchema = z.enum(
  DIETARY_TAGS.map((t) => t.value) as [DietaryTag, ...DietaryTag[]],
);

/** Canonical display order of a tag, for stable sorting of an item's tag set. */
const DIETARY_TAG_ORDER = new Map<DietaryTag, number>(
  DIETARY_TAGS.map((t, index) => [t.value, index]),
);

/** Human label for a tag (e.g. "Gluten friendly"), or the raw value if unknown. */
export function dietaryTagLabel(tag: DietaryTag): string {
  return DIETARY_TAGS.find((t) => t.value === tag)?.label ?? tag;
}

/**
 * Validate, de-duplicate, and canonically order a list of candidate tag strings
 * (from a form's checkboxes or a stored row set). Anything not in the vocab is
 * silently dropped — a forged or stale value can never be written or rendered.
 */
export function normalizeDietaryTags(values: readonly string[]): DietaryTag[] {
  const seen = new Set<DietaryTag>();
  for (const value of values) {
    const parsed = dietaryTagSchema.safeParse(value);
    if (parsed.success) seen.add(parsed.data);
  }
  return [...seen].sort(
    (a, b) => (DIETARY_TAG_ORDER.get(a) ?? 0) - (DIETARY_TAG_ORDER.get(b) ?? 0),
  );
}

/**
 * MANDATORY life-safety disclaimer shown wherever tags/filters appear. Tags are
 * the venue's own labels, not platform guarantees, so a customer with an
 * allergy must confirm directly with the venue before ordering.
 */
export const DIETARY_DISCLAIMER =
  "Please confirm any allergies directly with the venue.";

/* -------------------------------------------------------------------------- */
/* AI menu import (photo → human-reviewed draft → existing menu)              */
/*                                                                            */
/* Two shapes, BOTH validated server-side; the client draft is never trusted: */
/*  - extraction: what the vision model returns. priceCents may be NULL when   */
/*    the model can't read a price confidently — those are surfaced for the    */
/*    owner to set in review, NEVER guessed; priceText carries the raw printed  */
/*    text (e.g. "from $7.90") in that case. An item priced by SIZE comes back  */
/*    with priceCents null and a `sizes` list (each name + nullable price); a    */
/*    flat item has an empty `sizes`. Size prices are as tolerant as the item    */
/*    price (null = unread, fixed in review), never invented.                    */
/*  - publish: the reviewed draft the client sends back. Prices are now         */
/*    resolved to non-negative INTEGER cents — null is rejected. A SIZED item    */
/*    carries >= 1 size, each a non-negative integer-cents price; the publish    */
/*    action derives the item's base price from them. Re-validated in the        */
/*    publish action with the SAME bounds as the manual menu CRUD — the size     */
/*    price bound is shared with variantCreateSchema (via the resolved-cents     */
/*    schema below) so the importer can never write a weaker size than the CRUD. */
/* These are JSON payloads (not form strings), so names/descriptions use plain  */
/* length-bounded string schemas rather than the form transformers above.       */
/* -------------------------------------------------------------------------- */

/**
 * Max size variants proposed/published for one imported item. A generous cap
 * (most items have 2–4 sizes) that bounds a pathological extraction/payload.
 * Enforced in zod (the structured-output schema can't carry length bounds), and
 * mirrored client-side for fast feedback.
 */
export const MAX_SIZES_PER_ITEM = 20;

/**
 * The resolved-cents money bound for the import PUBLISH payload: a non-negative
 * integer number of cents. This is the same effective bound the manual menu
 * CRUD lands on after priceDollarsToCentsSchema runs (the item price AND
 * variantCreateSchema's size price both resolve to "non-negative integer
 * cents"). Factored out so the imported item price and its size prices validate
 * IDENTICALLY — the importer can never become a weaker back-door than the
 * variant CRUD for writing a size price.
 */
const resolvedPriceCentsSchema = z
  .number()
  .int("Enter a valid price.")
  .min(0, "Price can't be negative.");

/**
 * Client review-screen money helper: a dollars string → integer cents, or null
 * when blank/invalid. Mirrors priceDollarsToCentsSchema's rounding so the two
 * never disagree; Math.round absorbs binary-float error (12.99 * 100). The
 * publish action re-derives and re-checks cents server-side regardless.
 */
export function dollarsToCents(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  return Math.round(Number(trimmed) * 100);
}

const importNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a name.")
  .max(100, "Name is too long.");

const importDescriptionSchema = z
  .string()
  .trim()
  .max(500, "Description is too long.");

/* Extraction (vision model → server). Tolerant: prices may be null. */

/**
 * One proposed size for a size-priced item. Tolerant exactly like the item
 * price: the name is bounded like any menu name, and the price may be NULL when
 * the model can't read it confidently — surfaced in review for the owner to set,
 * NEVER guessed. default() so a malformed/absent price still parses to null.
 */
const extractedSizeSchema = z.object({
  name: importNameSchema,
  priceCents: z.number().int().min(0).nullable().default(null),
});
const extractedItemSchema = z.object({
  name: importNameSchema,
  // null = model couldn't read a confident price; the owner sets it in review.
  // Also null for a size-priced item — its prices live in `sizes` below.
  priceCents: z.number().int().min(0).nullable(),
  // Raw printed price text for an ambiguous/missing price; "" otherwise.
  priceText: z.string().trim().max(120).default(""),
  description: importDescriptionSchema.default(""),
  // Proposed size variants when the menu prices this item by size (e.g.
  // S $4 / L $5); EMPTY for a flat item. default([]) so a response that omits
  // sizes still parses (degrades to flat). Bounded here, not in the structured
  // schema (which rejects length constraints).
  sizes: z.array(extractedSizeSchema).max(MAX_SIZES_PER_ITEM).default([]),
});
const extractedCategorySchema = z.object({
  name: importNameSchema,
  items: z.array(extractedItemSchema).max(200),
});
export const extractionSchema = z.object({
  categories: z.array(extractedCategorySchema).max(60),
});
export type ExtractedMenu = z.infer<typeof extractionSchema>;

/* Publish (reviewed client draft → server). Strict: every price resolved. */

/**
 * One published size variant. Name + REQUIRED non-negative integer-cents price —
 * the exact bounds variantCreateSchema enforces (name via menuNameSchema/
 * importNameSchema, price via the shared resolvedPriceCentsSchema). A null /
 * missing / negative size price is rejected HERE, before any write, so a
 * half-built size can never reach menu_item_variants through the importer.
 */
const publishSizeSchema = z.object({
  name: importNameSchema,
  priceCents: resolvedPriceCentsSchema,
});
const publishItemSchema = z
  .object({
    name: importNameSchema,
    // Flat price: resolved non-negative integer cents. NULLABLE now because a
    // SIZED item carries no single price (its prices live in `sizes`); the
    // refine below requires one or the other. Empty/omitted -> null.
    priceCents: resolvedPriceCentsSchema.nullable().default(null),
    // Empty stored as null, matching the manual item CRUD.
    description: importDescriptionSchema.transform((v) =>
      v.length > 0 ? v : null,
    ),
    // A sized item has >= 1 size here; a flat item has none. The publish action
    // derives the item's base price_cents from these (min) and writes each as a
    // menu_item_variants row. EMPTY (default) => flat item, priced by priceCents.
    sizes: z.array(publishSizeSchema).max(MAX_SIZES_PER_ITEM).default([]),
  })
  // No half-built items: an item must be EITHER flat (a price) OR sized (>= 1
  // size). Reject "neither" — a sized item whose sizes were all removed, or a
  // flat item with no price. ("Both" is harmless: sizes win, priceCents ignored.)
  .refine((item) => item.sizes.length > 0 || item.priceCents !== null, {
    message: "Set a price, or add at least one size.",
    path: ["priceCents"],
  });
const publishCategorySchema = z.object({
  name: importNameSchema,
  items: z.array(publishItemSchema).max(200),
});
export const publishDraftSchema = z.object({
  categories: z
    .array(publishCategorySchema)
    .min(1, "Add at least one category.")
    .max(60),
});
/** What the client sends to publishMenu (input side, before transforms). */
export type PublishDraftInput = z.input<typeof publishDraftSchema>;

/* -------------------------------------------------------------------------- */
/* AI item descriptions (suggest a draft → owner review → existing column)    */
/*                                                                            */
/* Drafting reuses the import review-gate idea: the model proposes copy, the   */
/* owner edits/accepts, and only an explicit save writes. There is NO new      */
/* table or column — generated copy lands in the EXISTING menu_items.description*/
/* (nullable text). saveDescriptionsSchema is the bulk "fill empty             */
/* descriptions" commit payload; the action re-checks every id against a live, */
/* venue-scoped row before writing, so this only enforces shape + bounds.      */
/* Descriptions follow the same contract as the manual CRUD: trimmed, max 500, */
/* empty stored as null. The single-item "Suggest description" needs no save    */
/* schema — its accept path is the existing item update (Save changes).        */
/* -------------------------------------------------------------------------- */

/**
 * Max items drafted/saved in one bulk run. Bounds the single batched API call's
 * cost and response size; the draft action surfaces a `capped` flag and the
 * owner re-runs for the remainder. Imported by the action as the generation cap
 * so the two never disagree.
 */
export const MAX_DESCRIPTION_DRAFTS = 40;

/** Empty stored as null, max 500 — identical to menuDescriptionSchema. */
const savedDescriptionSchema = z
  .string()
  .trim()
  .max(500, "Description is too long.")
  .transform((value) => (value.length > 0 ? value : null));

export const saveDescriptionsSchema = z.object({
  items: z
    .array(
      z.object({
        id: idSchema,
        description: savedDescriptionSchema,
      }),
    )
    .min(1, "Nothing to save.")
    .max(MAX_DESCRIPTION_DRAFTS),
});

/** What the client sends to saveItemDescriptions (input side, before transforms). */
export type SaveDescriptionsInput = z.input<typeof saveDescriptionsSchema>;

/* -------------------------------------------------------------------------- */
/* Storefront theming (Phase 2a)                                              */
/* -------------------------------------------------------------------------- */

/** Hex colour (#rgb or #rrggbb), normalized to lowercase. */
export const brandColorSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^#([0-9a-f]{3}|[0-9a-f]{6})$/,
    "Enter a hex colour like #1d4ed8.",
  );

/** Field only this phase (no upload). Empty stored as null; else http(s) URL. */
export const logoUrlSchema = z
  .string()
  .trim()
  .max(2048, "Logo URL is too long.")
  .refine(
    (value) => value === "" || /^https?:\/\/.+/i.test(value),
    "Enter a valid URL starting with http:// or https://.",
  )
  .transform((value) => (value.length > 0 ? value : null));

/**
 * Any owner-pasted hosted image URL (storefront cover / gutter background). Same
 * rule as logoUrlSchema — empty → null, else an http(s) URL — reused so the
 * brand-imagery paste paths validate identically to the logo.
 */
export const hostedImageUrlSchema = logoUrlSchema;

/** Optional public blurb shown under the venue name on the storefront. */
export const storefrontDescriptionSchema = z
  .string()
  .trim()
  .max(500, "Description is too long.")
  .transform((value) => (value.length > 0 ? value : null));

export const venueSettingsSchema = z.object({
  brandColor: brandColorSchema,
  logoUrl: logoUrlSchema,
  storefrontDescription: storefrontDescriptionSchema,
});

/* -------------------------------------------------------------------------- */
/* Venue business details — structured data / SEO (Phase 6)                   */
/*                                                                            */
/* All fields are OPTIONAL: a venue fills in whatever it has, and the public   */
/* storefront emits schema.org JSON-LD using ONLY the parts that are set (see  */
/* app/[slug]/json-ld.tsx). Empty inputs become NULL — never empty strings or  */
/* placeholders — so nothing fabricated reaches the markup. These feed         */
/* updateVenueDetails, which (exactly like updateVenueSettings) re-checks auth  */
/* + venue scope and writes WHERE id = venue.id; no value here is ever an       */
/* authorization input. country has no default — the form pre-fills "AU".      */
/* -------------------------------------------------------------------------- */

/** Optional bounded free text; empty/whitespace stored as null. */
const optionalDetailSchema = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} is too long.`)
    .transform((value) => (value.length > 0 ? value : null));

/** Loose, international-friendly phone check; empty stored as null. */
export const venuePhoneSchema = z
  .string()
  .trim()
  .max(32, "Phone number is too long.")
  .refine(
    (value) => value === "" || /^[+()\-\s\d]{5,32}$/.test(value),
    "Enter a valid phone number (digits, spaces, +, -, ( ) only).",
  )
  .transform((value) => (value.length > 0 ? value : null));

/**
 * A single geographic coordinate from a text input. Empty -> null; otherwise a
 * decimal within [min, max]. Latitude and longitude are validated as a PAIR
 * (both-or-neither) in venueDetailsSchema, so a half-set geo never emits.
 */
const coordinateSchema = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .refine(
      (value) => value === "" || /^-?\d{1,3}(\.\d{1,8})?$/.test(value),
      `Enter a valid ${label}.`,
    )
    .transform((value) => (value === "" ? null : Number(value)))
    .refine(
      (value) => value === null || (value >= min && value <= max),
      `${label} must be between ${min} and ${max}.`,
    );

/** 24h "HH:MM" exactly as an <input type="time"> produces. */
const TIME_24H = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * One opening-hours range. `opens` must be strictly before `closes` (same-day);
 * overnight ranges that cross midnight are out of scope for this pass. `day` is
 * 0=Monday … 6=Sunday, matching OPENING_DAYS and OpeningHoursEntry.
 */
const openingHoursEntrySchema = z
  .object({
    day: z.number().int().min(0).max(6),
    opens: z.string().regex(TIME_24H, "Enter a valid opening time."),
    closes: z.string().regex(TIME_24H, "Enter a valid closing time."),
  })
  .refine((entry) => entry.opens < entry.closes, {
    message: "Closing time must be after opening time.",
    path: ["closes"],
  });

/** Array of ranges; empty -> null so the JSON-LD omits opening hours entirely. */
export const openingHoursSchema = z
  .array(openingHoursEntrySchema)
  .max(21, "Too many opening-hours ranges.")
  .transform((ranges) => (ranges.length > 0 ? ranges : null));

/**
 * The seven day rows the owner form renders and the update action reads. `day`
 * is the stored index (0=Monday) and `label` doubles as the schema.org
 * DayOfWeek name emitted in the JSON-LD, so form, storage, and markup stay in
 * lockstep.
 */
export const OPENING_DAYS = [
  { key: "mon", label: "Monday", day: 0 },
  { key: "tue", label: "Tuesday", day: 1 },
  { key: "wed", label: "Wednesday", day: 2 },
  { key: "thu", label: "Thursday", day: 3 },
  { key: "fri", label: "Friday", day: 4 },
  { key: "sat", label: "Saturday", day: 5 },
  { key: "sun", label: "Sunday", day: 6 },
] as const;

/**
 * Owner-editable scheduled-pickup window (Phase 8 refinement). Reuses the
 * non-negative whole-number contract; the DB also has `>= 0` checks. The server
 * gate enforces whatever is stored — the client never supplies the lead/max.
 */
const schedulingLeadMinutesSchema = wholeNumberSchema(
  "Lead time must be a whole number of minutes.",
).refine(
  (value) => value <= 1440,
  "Lead time must be 24 hours (1440 minutes) or less.",
);

const schedulingMaxDaysAheadSchema = wholeNumberSchema(
  "Days ahead must be a whole number.",
).refine(
  (value) => value >= 1 && value <= 30,
  "Days ahead must be between 1 and 30.",
);

export const venueDetailsSchema = z
  .object({
    streetAddress: optionalDetailSchema(120, "Street address"),
    suburb: optionalDetailSchema(80, "Suburb"),
    state: optionalDetailSchema(60, "State"),
    postcode: optionalDetailSchema(16, "Postcode"),
    country: optionalDetailSchema(56, "Country"),
    phone: venuePhoneSchema,
    latitude: coordinateSchema(-90, 90, "Latitude"),
    longitude: coordinateSchema(-180, 180, "Longitude"),
    openingHours: openingHoursSchema,
    schedulingLeadMinutes: schedulingLeadMinutesSchema,
    schedulingMaxDaysAhead: schedulingMaxDaysAheadSchema,
  })
  .refine((data) => (data.latitude === null) === (data.longitude === null), {
    message: "Enter both latitude and longitude, or leave both blank.",
    path: ["latitude"],
  });

/* -------------------------------------------------------------------------- */
/* Reserved slugs (Phase 2a)                                                  */
/*                                                                            */
/* A venue slug is served at the top-level path /{slug}, so it must never     */
/* collide with a real app route. This is enforced in two places: blocked at  */
/* venue creation (app/onboarding/actions.ts) AND treated as not-found by the */
/* public resolver (app/[slug]/page.tsx) regardless of any DB row.            */
/* -------------------------------------------------------------------------- */
export const RESERVED_SLUGS = new Set<string>([
  // Real top-level routes today.
  "api",
  "dashboard",
  "onboarding",
  "signin",
  // Reserved for near-future routes and common conventions.
  "account",
  "admin",
  "assets",
  "cart",
  "checkout",
  "login",
  "logout",
  "menu",
  "order",
  "orders",
  "public",
  "settings",
  "shop",
  "signup",
  "static",
  "_next",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
  "well-known",
]);

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.trim().toLowerCase());
}

/* -------------------------------------------------------------------------- */
/* Checkout / orders (Phase 2b)                                               */
/*                                                                            */
/* The placement action treats all of this as hostile input and re-validates  */
/* every id against live, venue-scoped DB rows; these schemas only enforce     */
/* shape + sane bounds. NO prices are ever accepted from the client.          */
/* -------------------------------------------------------------------------- */

/**
 * The human-facing order reference: the first 8 chars of the opaque
 * public_token, upper-cased. Shown on BOTH the customer confirmation page and
 * the owner kitchen view, so this is the single source that keeps the two
 * identical — never re-derive it inline.
 */
export function orderReference(publicToken: string): string {
  return publicToken.slice(0, 8).toUpperCase();
}

/**
 * Kitchen fulfillment status (Phase 3) — the four values of the
 * order_fulfillment_status DB enum. The status-advance action validates the
 * client-supplied target against this before writing; it is SEPARATE from the
 * payment-lifecycle order status.
 */
export const fulfillmentStatusSchema = z.enum([
  "new",
  "preparing",
  "ready",
  "completed",
]);

export const ORDER_TYPES = ["pickup", "dine_in"] as const;
export type OrderTypeValue = (typeof ORDER_TYPES)[number];

/** The 2a storefront uses "dinein"; normalize to the DB value at the boundary. */
export function normalizeOrderType(value: unknown): OrderTypeValue {
  return value === "dine_in" || value === "dinein" ? "dine_in" : "pickup";
}

export const customerNameSchema = z
  .string()
  .trim()
  .min(1, "Enter your name.")
  .max(80, "Name is too long.");

/**
 * OPTIONAL free-text order note / special request (e.g. "no onion", "extra
 * napkins"). Trimmed; empty -> null (same nullish->null contract as
 * customerPhone / tableLabel). Capped at 280 chars: a special request is short,
 * it prints cleanly on an 80mm thermal ticket, and the bound limits abuse. This
 * is CAPTURED TEXT ONLY — it is never a pricing input. It is rendered as a plain
 * (React-escaped) text node on the kitchen card / receipt / confirmation /
 * history, never as raw HTML.
 */
export const orderNotesSchema = z
  .string()
  .trim()
  .max(280, "Order notes are too long (280 characters max).")
  .nullish()
  .transform((value) => (value && value.length > 0 ? value : null));

/**
 * Optional scheduled pickup time (Phase 8): a NAIVE venue-local wall-clock
 * string "YYYY-MM-DDTHH:MM" (never a browser-converted instant — the venue
 * timezone is applied server-side; see lib/schedule.ts). SHAPE ONLY — the
 * placeOrder server gate re-validates it against the venue's open hours +
 * lead/max in the venue timezone and is authoritative. Blank/absent -> null
 * (ASAP), the same nullish->null contract as notes/tableLabel.
 */
export const scheduledForSchema = z
  .string()
  .trim()
  .nullish()
  .transform((value) => (value && value.length > 0 ? value : null))
  .refine(
    (value) => value === null || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value),
    "Choose a valid pickup time.",
  );

const orderLineSchema = z.object({
  itemId: idSchema,
  // The chosen size variant id, or null for a flat-priced item. SHAPE ONLY: the
  // action re-fetches it venue-scoped, confirms it belongs to this line's item,
  // and reads its price from the DB — a missing/foreign id is rejected there.
  variantId: z
    .string()
    .trim()
    .min(1)
    .nullish()
    .transform((value) => value ?? null),
  selectedOptionIds: z
    .array(idSchema)
    .max(30, "Too many options on one item.")
    .default([]),
  quantity: z
    .number()
    .int("Invalid quantity.")
    .min(1, "Quantity must be at least 1.")
    .max(50, "Quantity is too high."),
});

export const placeOrderSchema = z
  .object({
    slug: z.string().trim().toLowerCase().min(1).max(64),
    orderType: z.enum(["pickup", "dine_in"]),
    // Optional. The typed client sends `null` (not just undefined) when absent,
    // so accept null | undefined | "" via `.nullish()`; the transform normalises
    // any of them to null and `.max()` only applies once a real string is given.
    tableLabel: z
      .string()
      .trim()
      .max(40, "Table label is too long.")
      .nullish()
      .transform((value) => (value && value.length > 0 ? value : null)),
    customerName: customerNameSchema,
    // REQUIRED contact email (trimmed + lowercased, RFC-ish shape) — same rule as
    // the customer sign-in email, inlined because customerEmailSchema is declared
    // later in this file. Captured for order-notification delivery (and receipts);
    // not an auth factor and NEVER auto-links a guest to an account (that stays
    // magic-link-verified only).
    customerEmail: z
      .string()
      .trim()
      .toLowerCase()
      .min(3, "Enter your email.")
      .max(254, "Email is too long.")
      .refine(
        (value) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value),
        "Enter a valid email address.",
      ),
    // Optional, same nullish contract as tableLabel: blank input arrives as null
    // (or "") and is stored as null; length is only checked when a value is given.
    customerPhone: z
      .string()
      .trim()
      .max(30, "Phone number is too long.")
      .nullish()
      .transform((value) => (value && value.length > 0 ? value : null)),
    // Optional special request; captured + stored, NEVER priced (see schema).
    notes: orderNotesSchema,
    // Optional scheduled pickup time. SHAPE ONLY; placeOrder's server gate
    // validates it against the venue's hours + lead/max in the venue timezone.
    scheduledFor: scheduledForSchema,
    lines: z
      .array(orderLineSchema)
      .min(1, "Your cart is empty.")
      .max(50, "Too many items in one order."),
  })
  .refine(
    (data) =>
      data.orderType !== "dine_in" ||
      (data.tableLabel !== null && data.tableLabel.length > 0),
    { message: "Enter a table number for dine-in.", path: ["tableLabel"] },
  );

/** Explicit input contract for the placeOrder server action (what the client sends). */
export type PlaceOrderInput = {
  slug: string;
  orderType: OrderTypeValue;
  tableLabel?: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone?: string | null;
  notes?: string | null;
  // Naive venue-local wall-clock "YYYY-MM-DDTHH:MM" for a scheduled pickup, or
  // null/omitted for ASAP. Server-validated against the venue tz + hours/lead/max.
  scheduledFor?: string | null;
  lines: {
    itemId: string;
    variantId?: string | null;
    selectedOptionIds: string[];
    quantity: number;
  }[];
};

/* -------------------------------------------------------------------------- */
/* Customer identity (#7)                                                     */
/*                                                                            */
/* Used by the OPT-IN customer sign-in flow, which is firewalled from owner    */
/* Auth.js. Email is trimmed + lower-cased here so casing can never fork a      */
/* second customer; the DB unique index on (venue_id, lower(email)) is the      */
/* backstop. (Order-claim and reorder take an id/token, validated with the      */
/* existing idSchema — no new schema needed.)                                   */
/* -------------------------------------------------------------------------- */

export const customerEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Enter your email.")
  .max(254, "Email is too long.")
  .refine(
    (value) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value),
    "Enter a valid email address.",
  );

/* -------------------------------------------------------------------------- */
/* AI ordering concierge (#12) — diner "prompt to eat"                        */
/*                                                                            */
/* Diner-facing AND unauthenticated, so the proposeCart server action treats   */
/* this input as hostile: these schemas enforce SHAPE + BOUNDS only. The hard  */
/* guarantee lives in the action, which re-grounds every item id the model      */
/* returns against the live, venue-scoped getPublicMenu set — the model can     */
/* never inject an item, name, or price. Conversation state is EPHEMERAL: the   */
/* client resends a short capped history each turn and nothing is persisted     */
/* (no table, no migration).                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Max items the concierge proposes in one turn. The action caps to this AFTER
 * grounding, regardless of how many ids the model returns, so a runaway
 * response can never flood the proposal UI.
 */
export const MAX_CONCIERGE_ITEMS = 6;

/**
 * Max prior turns the client may resend for refine context (≈3 exchanges).
 * Bounds the per-call prompt size (cost); the client slices to this before
 * sending and the schema rejects anything longer.
 */
export const MAX_CONCIERGE_HISTORY = 6;

/** One diner prompt: trimmed, non-empty, short. */
const conciergeMessageSchema = z
  .string()
  .trim()
  .min(1, "Tell us what you feel like eating.")
  .max(500, "Message is too long.");

/**
 * One prior conversation turn the client resends for context. `content` is the
 * diner's own text (user) or the concierge's prior rationale (assistant) — it is
 * NEVER a price/name source for the cart (every proposed id is re-grounded
 * server-side). Bounded more generously than a fresh prompt so a returned
 * assistant rationale always validates when echoed back next turn.
 */
const conciergeTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(2000),
});

export const conciergeInputSchema = z.object({
  slug: z.string().trim().toLowerCase().min(1).max(64),
  message: conciergeMessageSchema,
  history: z.array(conciergeTurnSchema).max(MAX_CONCIERGE_HISTORY).default([]),
});

/** One ephemeral conversation turn (shared by the client panel + the action). */
export type ConciergeTurn = { role: "user" | "assistant"; content: string };

/** What the client sends to proposeCart (input side, before defaults applied). */
export type ConciergeInput = {
  slug: string;
  message: string;
  history?: ConciergeTurn[];
};
