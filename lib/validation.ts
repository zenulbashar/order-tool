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
/* AI menu import (photo → human-reviewed draft → existing menu)              */
/*                                                                            */
/* Two shapes, BOTH validated server-side; the client draft is never trusted: */
/*  - extraction: what the vision model returns. priceCents may be NULL when   */
/*    the model can't read a price confidently — those are surfaced for the    */
/*    owner to set in review, NEVER guessed; priceText carries the raw printed  */
/*    text (e.g. "from $7.90") in that case.                                    */
/*  - publish: the reviewed draft the client sends back. Prices are now         */
/*    resolved to non-negative INTEGER cents — null is rejected. Re-validated   */
/*    in the publish action with the SAME bounds as the manual menu CRUD.       */
/* These are JSON payloads (not form strings), so names/descriptions use plain  */
/* length-bounded string schemas rather than the form transformers above.       */
/* -------------------------------------------------------------------------- */

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
const extractedItemSchema = z.object({
  name: importNameSchema,
  // null = model couldn't read a confident price; the owner sets it in review.
  priceCents: z.number().int().min(0).nullable(),
  // Raw printed price text for an ambiguous/missing price; "" otherwise.
  priceText: z.string().trim().max(120).default(""),
  description: importDescriptionSchema.default(""),
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
const publishItemSchema = z.object({
  name: importNameSchema,
  // Prices MUST be resolved before publish — no nulls reach the live menu.
  priceCents: z
    .number()
    .int("Enter a valid price.")
    .min(0, "Price can't be negative."),
  // Empty stored as null, matching the manual item CRUD.
  description: importDescriptionSchema.transform((v) =>
    v.length > 0 ? v : null,
  ),
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

const orderLineSchema = z.object({
  itemId: idSchema,
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
    // Optional, same nullish contract as tableLabel: blank input arrives as null
    // (or "") and is stored as null; length is only checked when a value is given.
    customerPhone: z
      .string()
      .trim()
      .max(30, "Phone number is too long.")
      .nullish()
      .transform((value) => (value && value.length > 0 ? value : null)),
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
  customerPhone?: string | null;
  lines: { itemId: string; selectedOptionIds: string[]; quantity: number }[];
};
