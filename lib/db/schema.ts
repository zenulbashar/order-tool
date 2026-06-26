import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Generate primary keys application-side so inserts never depend on a DB
 * extension and stay consistent with the Auth.js adapter's text ids.
 */
const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/* -------------------------------------------------------------------------- */
/* Core domain                                                                */
/* -------------------------------------------------------------------------- */

export const users = pgTable(
  "users",
  {
    id: id(),
    name: text("name"),
    email: text("email").notNull(),
    // emailVerified + image are required by the Auth.js Drizzle adapter.
    emailVerified: timestamp("email_verified", { withTimezone: true, mode: "date" }),
    image: text("image"),
    createdAt: createdAt(),
  },
  (table) => [
    // MANDATORY: case-insensitive uniqueness on email. Combined with
    // normalizeIdentifier() in the auth config, this prevents the
    // duplicate-account drift we hit on roster-tool.
    uniqueIndex("users_email_lower_idx").on(sql`lower(${table.email})`),
  ],
);

/**
 * One opening-hours range for a venue, stored in venues.opening_hours (jsonb).
 * `day` is 0=Monday … 6=Sunday; `opens`/`closes` are 24h "HH:MM" strings exactly
 * as produced by an <input type="time">, so the data is valid by construction.
 * Closed days are simply absent from the array, and the array shape is
 * forward-compatible with split hours (two ranges on the same day). Emitted as
 * schema.org OpeningHoursSpecification on the public storefront — never guessed.
 */
export type OpeningHoursEntry = { day: number; opens: string; closes: string };

export const venues = pgTable(
  "venues",
  {
    id: id(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id),
    timezone: text("timezone").notNull().default("Australia/Brisbane"),
    // Storefront theming (Phase 2a). brand_color is the venue's accent, applied
    // as a runtime CSS variable on the public storefront; it is NOT NULL with a
    // neutral default so existing rows backfill safely. logo_url is a URL field
    // only (no upload yet). storefront_description is optional public copy.
    brandColor: text("brand_color").notNull().default("#111827"),
    logoUrl: text("logo_url"),
    storefrontDescription: text("storefront_description"),
    // Stripe Connect (Phase 2c). The venue connects its OWN Express account;
    // customers are charged directly on it and the platform takes a per-order
    // application fee. All three are written server-side from Stripe — never
    // from client input. charges_enabled gates whether checkout may charge.
    stripeAccountId: text("stripe_account_id"),
    stripeChargesEnabled: boolean("stripe_charges_enabled")
      .notNull()
      .default(false),
    stripeOnboardedAt: timestamp("stripe_onboarded_at", { withTimezone: true }),
    // Structured-data / SEO inputs (Phase 6). ALL NULLABLE with no defaults: a
    // venue fills in whatever it has, and the public storefront emits schema.org
    // JSON-LD using ONLY the fields that are set (see app/[slug]/json-ld.tsx) —
    // never placeholders or guesses. None of these alter an existing column.
    // Address parts map to a PostalAddress; phone -> telephone; opening_hours ->
    // OpeningHoursSpecification; latitude/longitude -> GeoCoordinates (emitted
    // only when BOTH are set). country has no DB default — the owner form
    // pre-fills "AU" but existing rows stay untouched (NULL).
    streetAddress: text("street_address"),
    suburb: text("suburb"),
    state: text("state"),
    postcode: text("postcode"),
    country: text("country"),
    phone: text("phone"),
    openingHours: jsonb("opening_hours").$type<OpeningHoursEntry[]>(),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("venues_slug_idx").on(table.slug)],
);

export const memberRole = pgEnum("venue_role", ["owner", "staff"]);

export const venueMembers = pgTable(
  "venue_members",
  {
    id: id(),
    venueId: text("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("venue_members_venue_user_idx").on(table.venueId, table.userId),
  ],
);

/* -------------------------------------------------------------------------- */
/* Auth.js adapter tables                                                     */
/* JS property names match what @auth/drizzle-adapter expects; DB columns are */
/* snake_case for consistency with the rest of the schema.                    */
/* -------------------------------------------------------------------------- */

export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (table) => [
    primaryKey({ columns: [table.provider, table.providerAccountId] }),
  ],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true, mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.identifier, table.token] })],
);

/* -------------------------------------------------------------------------- */
/* Menu catalog (Phase 1)                                                     */
/* venue_id is denormalized onto every table so the scopedToVenue() convention */
/* applies uniformly (see lib/tenant.ts). Money is INTEGER CENTS, never float. */
/* sort_order has no DB default — inserts set it to MAX(sort_order)+1 within   */
/* the parent scope (see app/dashboard/menu/actions.ts).                      */
/* -------------------------------------------------------------------------- */

export const menuCategories = pgTable(
  "menu_categories",
  {
    id: id(),
    venueId: text("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("menu_categories_venue_idx").on(table.venueId)],
);

export const menuItems = pgTable(
  "menu_items",
  {
    id: id(),
    venueId: text("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => menuCategories.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    // Money is integer cents; format to dollars only at display.
    priceCents: integer("price_cents").notNull(),
    // Public URL of the owner-uploaded photo in Cloudflare R2 (nullable: items
    // may have none). Written ONLY by the upload/remove actions, never by the
    // item create/update form. See app/dashboard/menu/actions.ts + lib/r2.ts.
    imageUrl: text("image_url"),
    isAvailable: boolean("is_available").notNull().default(true),
    sortOrder: integer("sort_order").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("menu_items_venue_idx").on(table.venueId),
    index("menu_items_category_idx").on(table.categoryId),
    check("menu_items_price_cents_nonneg", sql`${table.priceCents} >= 0`),
  ],
);

export const modifierGroups = pgTable(
  "modifier_groups",
  {
    id: id(),
    venueId: text("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    itemId: text("item_id")
      .notNull()
      .references(() => menuItems.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // "Required" is DERIVED as min_select >= 1 — no separate column.
    minSelect: integer("min_select").notNull().default(0),
    maxSelect: integer("max_select").notNull().default(1),
    sortOrder: integer("sort_order").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("modifier_groups_venue_idx").on(table.venueId),
    index("modifier_groups_item_idx").on(table.itemId),
    check("modifier_groups_min_select_nonneg", sql`${table.minSelect} >= 0`),
    check("modifier_groups_max_select_min1", sql`${table.maxSelect} >= 1`),
    check(
      "modifier_groups_min_lte_max",
      sql`${table.minSelect} <= ${table.maxSelect}`,
    ),
  ],
);

export const modifierOptions = pgTable(
  "modifier_options",
  {
    id: id(),
    venueId: text("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    groupId: text("group_id")
      .notNull()
      .references(() => modifierGroups.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    priceDeltaCents: integer("price_delta_cents").notNull().default(0),
    isAvailable: boolean("is_available").notNull().default(true),
    sortOrder: integer("sort_order").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("modifier_options_venue_idx").on(table.venueId),
    index("modifier_options_group_idx").on(table.groupId),
    check(
      "modifier_options_price_delta_nonneg",
      sql`${table.priceDeltaCents} >= 0`,
    ),
  ],
);

/**
 * Item size variants (Phase 5a). An item is EITHER flat-priced (uses
 * menu_items.price_cents) OR variant-priced (has rows here, each carrying its
 * OWN absolute price) — never both. When variants exist they are authoritative
 * and the item's price_cents is ignored; that "which price wins" enforcement
 * lands in checkout (Phase 5c). This phase is owner-side CRUD only. venue_id is
 * denormalized for the scopedToVenue() convention; item_id cascades so variants
 * die with their item. Mirrors modifier_options' shape and indexing.
 */
export const menuItemVariants = pgTable(
  "menu_item_variants",
  {
    id: id(),
    venueId: text("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    itemId: text("item_id")
      .notNull()
      .references(() => menuItems.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // The variant's OWN absolute price (integer cents), not a delta.
    priceCents: integer("price_cents").notNull(),
    sortOrder: integer("sort_order").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("menu_item_variants_venue_idx").on(table.venueId),
    index("menu_item_variants_item_idx").on(table.itemId),
    check("menu_item_variants_price_cents_nonneg", sql`${table.priceCents} >= 0`),
  ],
);

/**
 * Owner-managed dietary/allergen tags on a menu item (Phase 7). A controlled
 * vocabulary the venue applies to an item to mark it e.g. vegan / halal /
 * gluten friendly, surfaced on the storefront as filter chips + card labels.
 *
 * LIFE-SAFETY: tags are SUGGESTIONS made BY THE VENUE, never platform
 * guarantees, so the storefront always shows a "confirm allergies with the
 * venue" disclaimer alongside them and uses "gluten friendly" (never "gluten
 * free") wording. The vocab is a pgEnum to match the house style
 * (venue_role / order_type / order_status / order_fulfillment_status); adding a
 * value later is a one-line additive migration, acceptable for a deliberately
 * slow-changing, safety-sensitive list.
 *
 * Shape + indexing mirror menu_item_variants: venue_id is denormalized for the
 * scopedToVenue() convention, item_id cascades so tags die with their item. An
 * item's tags are an unordered SET replace-set on save (no reorder, no in-place
 * edit), so there is deliberately no sort_order / updated_at. The unique index
 * on (item_id, tag) makes a tag idempotent per item.
 */
export const dietaryTag = pgEnum("dietary_tag", [
  "vegan",
  "vegetarian",
  "gluten_friendly",
  "dairy_free",
  "halal",
  "nut_free",
  "spicy",
]);

export const menuItemTags = pgTable(
  "menu_item_tags",
  {
    id: id(),
    venueId: text("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    itemId: text("item_id")
      .notNull()
      .references(() => menuItems.id, { onDelete: "cascade" }),
    tag: dietaryTag("tag").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("menu_item_tags_item_tag_idx").on(table.itemId, table.tag),
    index("menu_item_tags_venue_idx").on(table.venueId),
    index("menu_item_tags_item_idx").on(table.itemId),
  ],
);

export type MenuCategory = typeof menuCategories.$inferSelect;
export type MenuItem = typeof menuItems.$inferSelect;
export type ModifierGroup = typeof modifierGroups.$inferSelect;
export type ModifierOption = typeof modifierOptions.$inferSelect;
export type MenuItemVariant = typeof menuItemVariants.$inferSelect;
export type MenuItemTag = typeof menuItemTags.$inferSelect;

/* -------------------------------------------------------------------------- */
/* Orders (Phase 2b)                                                          */
/*                                                                            */
/* Public, unauthenticated checkout writes here. The server RECOMPUTES every  */
/* total from live menu prices and SNAPSHOTS names + prices at order time:    */
/* the *_snapshot columns are the financial truth, while menu_item_id /       */
/* modifier_option_id are SOFT references (nullable, NO FK) kept for analytics */
/* only — repricing or deleting a menu row must never alter or break a        */
/* historical order. Orders are retrieved publicly by the opaque,             */
/* server-generated public_token, NEVER by sequential id. venue_id is         */
/* denormalized onto every table for uniform scopedToVenue().                 */
/* -------------------------------------------------------------------------- */

export const orderType = pgEnum("order_type", ["pickup", "dine_in"]);
export const orderStatus = pgEnum("order_status", [
  "pending_payment",
  "confirmed",
  "cancelled",
  // Stripe reported the PaymentIntent failed (Phase 2c). Reached only via the
  // webhook; the customer sees a clear, non-alarming retry path.
  "payment_failed",
]);

// Kitchen/fulfillment lifecycle (Phase 3), DELIBERATELY SEPARATE from the
// payment-lifecycle `order_status` above — do not overload one for the other.
// A paid order is status='confirmed' AND fulfillment_status='new' until the
// venue advances it through preparing -> ready -> completed.
export const orderFulfillmentStatus = pgEnum("order_fulfillment_status", [
  "new",
  "preparing",
  "ready",
  "completed",
]);

export const orders = pgTable(
  "orders",
  {
    id: id(),
    venueId: text("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    // Opaque, server-generated, URL-safe random token — the ONLY handle a
    // customer uses to view an order. Unique + indexed; never a sequential id.
    publicToken: text("public_token").notNull(),
    orderType: orderType("order_type").notNull(),
    tableLabel: text("table_label"),
    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone"),
    status: orderStatus("status").notNull().default("pending_payment"),
    // Kitchen lifecycle, separate from `status` (payment). NOT NULL DEFAULT
    // 'new' so existing paid orders backfill into the queue safely.
    fulfillmentStatus: orderFulfillmentStatus("fulfillment_status")
      .notNull()
      .default("new"),
    subtotalCents: integer("subtotal_cents").notNull(),
    totalCents: integer("total_cents").notNull(),
    // Stripe PaymentIntent backing this order (direct charge on the venue's
    // connected account). Set server-side after the order row is written; the
    // webhook resolves orders to confirm/fail by THIS id only — never a
    // client-supplied identifier.
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("orders_public_token_idx").on(table.publicToken),
    index("orders_venue_idx").on(table.venueId),
    index("orders_payment_intent_idx").on(table.stripePaymentIntentId),
    // Supports the kitchen queue read: venue-scoped, status='confirmed',
    // ordered by created_at (FIFO). fulfillment_status is a residual filter.
    index("orders_venue_status_created_idx").on(
      table.venueId,
      table.status,
      table.createdAt,
    ),
    check("orders_subtotal_cents_nonneg", sql`${table.subtotalCents} >= 0`),
    check("orders_total_cents_nonneg", sql`${table.totalCents} >= 0`),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: id(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    venueId: text("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    // SOFT reference (nullable, no FK): analytics only. The snapshot columns
    // are the financial truth and must survive menu edits/deletions.
    menuItemId: text("menu_item_id"),
    itemNameSnapshot: text("item_name_snapshot").notNull(),
    unitPriceCentsSnapshot: integer("unit_price_cents_snapshot").notNull(),
    quantity: integer("quantity").notNull(),
    lineTotalCents: integer("line_total_cents").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("order_items_order_idx").on(table.orderId),
    index("order_items_venue_idx").on(table.venueId),
    check("order_items_quantity_pos", sql`${table.quantity} > 0`),
    check(
      "order_items_unit_price_nonneg",
      sql`${table.unitPriceCentsSnapshot} >= 0`,
    ),
    check("order_items_line_total_nonneg", sql`${table.lineTotalCents} >= 0`),
  ],
);

export const orderItemModifiers = pgTable(
  "order_item_modifiers",
  {
    id: id(),
    orderItemId: text("order_item_id")
      .notNull()
      .references(() => orderItems.id, { onDelete: "cascade" }),
    venueId: text("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    // SOFT reference (nullable, no FK): analytics only.
    modifierOptionId: text("modifier_option_id"),
    nameSnapshot: text("name_snapshot").notNull(),
    priceDeltaCentsSnapshot: integer("price_delta_cents_snapshot")
      .notNull()
      .default(0),
  },
  (table) => [
    index("order_item_modifiers_order_item_idx").on(table.orderItemId),
    index("order_item_modifiers_venue_idx").on(table.venueId),
    check(
      "order_item_modifiers_price_delta_nonneg",
      sql`${table.priceDeltaCentsSnapshot} >= 0`,
    ),
  ],
);

export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type OrderItemModifier = typeof orderItemModifiers.$inferSelect;
