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

/**
 * Billing tiers. A closed set, so a pgEnum (house style) — unlike plan_status,
 * which is free text for Stripe-status flexibility. `trial` is the safe default
 * for every existing and new venue. `free` (Phase 2) is the LAPSED end-state: a
 * venue whose subscription canceled/lapsed drops to `free`, which maps to no
 * tier-differentiated features (baseline ordering only) in lib/billing/plans.ts.
 * The plan→features mapping lives there; this enum is only the storage type.
 */
export const venuePlan = pgEnum("venue_plan", [
  "trial",
  "pro",
  "scale",
  "free",
]);

/**
 * Venue category (Phase 3a onboarding). A closed set, so a pgEnum (house style).
 * Nullable on the venue until the owner picks one in the wizard's first step; it
 * is presentational metadata only and gates nothing.
 */
export const venueType = pgEnum("venue_type", [
  "cafe",
  "restaurant",
  "bar",
  "bakery",
  "food_truck",
]);

// Pay-by-bank discount mode (Track B · 3b-ii). off = none; flat = a fixed cents
// saving; percent = a percentage of subtotal.
export const paytoDiscountMode = pgEnum("payto_discount_mode", [
  "off",
  "flat",
  "percent",
]);

// Per-venue subscription-fee discount, set by the admin console (Track E2c).
// off = list price; percent = % off the monthly fee; amount = fixed cents off.
// Applied as a Stripe coupon on the venue's subscription — our columns are the
// intent, Stripe's discount is the runtime truth (like payto_enabled).
export const planDiscountMode = pgEnum("plan_discount_mode", [
  "off",
  "percent",
  "amount",
]);

// Platform promotion type (Track E2d). percent = % off subtotal; amount = fixed
// cents off. Applied server-side as an order discount line — never a surcharge.
export const promotionType = pgEnum("promotion_type", ["percent", "amount"]);

// Who bears a promotion's cost (Track E2d), mirroring the delivery platforms.
// v1 records this for reporting; merchant is the default (the venue's margin
// absorbs it, as on Uber Eats / Zomato).
export const promotionFunding = pgEnum("promotion_funding", [
  "merchant",
  "platform",
  "cofunded",
]);

// Promotion reach (Track E2d-2). all = every venue; selected = only the venues
// listed in promotion_venues.
export const promotionScope = pgEnum("promotion_scope", ["all", "selected"]);

// Promotion audience (Track E2d-2). all = anyone; new = customers with no prior
// confirmed order at the venue (guests, being untracked, count as new).
export const promotionAudience = pgEnum("promotion_audience", ["all", "new"]);

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
    // Optional venue TEXT colour (the diner side's two-colour system: --brand +
    // this). NULL = automatic (the shared ink default) — the storefront only
    // overrides --color-ink when the owner explicitly set one. Auto-derivation
    // from the logo applies to brand_color at upload time, never this.
    brandTextColor: text("brand_text_color"),
    // Optional owner-authored promo shown as a slim dismissible bar at the top
    // of the storefront (e.g. "Order your cake online — pick up in store").
    announcement: text("announcement"),
    // Optional social profile links → "Follow us" icons in the storefront
    // footer. All nullable; each normalised to a full URL at save time. Instagram
    // came first; the rest are additive and independent (any subset can be set).
    instagramUrl: text("instagram_url"),
    facebookUrl: text("facebook_url"),
    xUrl: text("x_url"),
    youtubeUrl: text("youtube_url"),
    tiktokUrl: text("tiktok_url"),
    linkedinUrl: text("linkedin_url"),
    websiteUrl: text("website_url"),
    logoUrl: text("logo_url"),
    // Storefront brand imagery (owner-uploaded, both nullable — unset ⇒ no
    // change to today's look). cover_url replaces the storefront's brand-colour
    // cover band with a real hero image; background_url is a full-bleed image
    // revealed in the empty side gutters behind the centered menu column on wide
    // screens (all diner pages). Written server-side to R2 by the dedicated
    // imagery actions, mirroring logo_url — never by the theme save.
    coverUrl: text("cover_url"),
    // Two more optional hero slots — the desktop storefront hero rotates through
    // cover_url → cover_url_2 → cover_url_3 (NULLs skipped). Additive; the
    // mobile band keeps using cover_url alone. background_url is retired from
    // the UI but the column stays (no destructive migration).
    coverUrl2: text("cover_url_2"),
    coverUrl3: text("cover_url_3"),
    backgroundUrl: text("background_url"),
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
    // Scheduled pickup config (Phase 8). schedulingEnabled is the explicit
    // per-venue opt-in (default false — nothing changes until an owner turns it
    // on AND has opening_hours set). lead/max bound how far out a customer may
    // schedule; defaulted so existing rows backfill safely. None alters an
    // existing column. The scheduled time itself lives on orders.scheduled_for.
    schedulingEnabled: boolean("scheduling_enabled").notNull().default(false),
    schedulingLeadMinutes: integer("scheduling_lead_minutes")
      .notNull()
      .default(20),
    schedulingMaxDaysAhead: integer("scheduling_max_days_ahead")
      .notNull()
      .default(7),
    // Pay-by-bank (PayTo) opt-in (Track B). Default false — nothing changes
    // until an owner turns it on, which requests the `payto_payments`
    // capability on the venue's Stripe connected account; PayTo then appears
    // in the existing Payment Element via automatic_payment_methods (no money-
    // path change). This column is OUR intent/copy state; Stripe's live
    // capability status is the runtime truth (mirrored like charges_enabled).
    paytoEnabled: boolean("payto_enabled").notNull().default(false),
    // Pay-by-bank discount steering (Track B · 3b-ii). A venue may pass a small
    // saving to customers who pay by bank (cheaper for the venue than cards).
    // `mode` off = no discount (default); `flat` = paytoDiscountValue cents off;
    // `percent` = paytoDiscountValue percent of subtotal off. Applied ONLY as a
    // server-recomputed discount line on the PaymentIntent AFTER the customer
    // picks PayTo — never a card surcharge (RBA-safe). placeOrder is unchanged;
    // the discount is a separate, method-triggered update.
    paytoDiscountMode: paytoDiscountMode("payto_discount_mode")
      .notNull()
      .default("off"),
    paytoDiscountValue: integer("payto_discount_value").notNull().default(0),
    // Customer loyalty / points (owner-configurable). Logged-in diners earn
    // points on confirmed orders and redeem them as a checkout discount. All
    // four are additive + money-inert: enabling changes no existing charge, and
    // redemption (PR2) rides the SAME server-recomputed discount seam as promos.
    //  - enabled: master switch (default off);
    //  - earnRatePerDollar: points earned per whole $1 of SUBTOTAL;
    //  - redeemValueCents: cash value of one point in cents (e.g. 1 → 100 pts = $1);
    //  - minRedeemPoints: floor below which a customer can't redeem.
    loyaltyEnabled: boolean("loyalty_enabled").notNull().default(false),
    loyaltyEarnRatePerDollar: integer("loyalty_earn_rate_per_dollar")
      .notNull()
      .default(1),
    loyaltyRedeemValueCents: integer("loyalty_redeem_value_cents")
      .notNull()
      .default(1),
    loyaltyMinRedeemPoints: integer("loyalty_min_redeem_points")
      .notNull()
      .default(0),
    // Sales tax / GST (inclusive). AU menu prices are GST-INCLUSIVE, so tax is a
    // DISPLAY component of the price — never added to the charge. enabled off =
    // no GST line; rate in basis points (1000 = 10.00%); label shown on receipts.
    taxEnabled: boolean("tax_enabled").notNull().default(false),
    taxRateBps: integer("tax_rate_bps").notNull().default(0),
    taxLabel: text("tax_label").notNull().default("GST"),
    // Notification preference (quick-win #5): whether new-order push alerts are
    // sent to this venue's registered devices. Default on; the send path
    // (lib/push.ts) is still a no-op unless FCM is configured + a device is
    // registered, so this only ever suppresses, never fabricates, a push.
    pushNewOrders: boolean("push_new_orders").notNull().default(true),
    // Admin-set subscription-fee discount (Track E2c). off = list price; the
    // value is % (percent mode) or cents/month (amount mode). Applied as a
    // Stripe coupon on the subscription; these columns are our intent/display.
    planDiscountMode: planDiscountMode("plan_discount_mode").notNull().default("off"),
    planDiscountValue: integer("plan_discount_value").notNull().default(0),
    // Billing entitlement (Phase 1). `plan` is the ONLY field gated on now; it is
    // the single value hasFeature() reads (see lib/billing/plans.ts). Existing
    // rows backfill to 'trial' so every current venue keeps full access, matching
    // the diner concierge being free for all today. trial_ends_at + plan_status
    // are STORED now but ENFORCED in Phase 2 (trial-expiry + Stripe sync) — added
    // here so that phase needs no destructive migration. plan_status is plain text
    // (not an enum) on purpose: Stripe's status vocabulary expands later
    // (past_due, unpaid, paused, ...) and text avoids a forced ALTER TYPE.
    plan: venuePlan("plan").notNull().default("trial"),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    planStatus: text("plan_status").notNull().default("trialing"),
    // Platform billing (Phase 2). The venue's Stripe CUSTOMER + SUBSCRIPTION on
    // the PLATFORM account — entirely separate from the Connect account above
    // (stripe_account_id), which is the venue's own charging account. These let
    // the separate billing webhook resolve a venue from an invoice/subscription
    // event when metadata is absent. Both nullable (set when the owner first
    // subscribes) and written server-side only, never from client input.
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    // Roster add-on entitlement (Track C). Default false — set true by Build 5's
    // consolidated billing when the Roster line is added to the venue's
    // subscription. Read into the signed Roster SSO handoff token's
    // entitlements.roster claim; Roster decides what a false claim means.
    rosterEntitled: boolean("roster_entitled").notNull().default(false),
    // Onboarding wizard (Phase 3a). venue_type is the owner-picked category.
    // onboarding_completed_at is the SINGLE "this venue is live-ready" signal —
    // null until the wizard finishes (Step 5, a later sub-phase); the go-live /
    // order-taking block keys off it then. onboarding_step is the resume pointer
    // (1..5) so a paused wizard re-enters where it left off. Service-style flags
    // record which fulfilment modes the venue offers; defaults mirror today's
    // behaviour (pickup + dine-in, no delivery) so existing rows are unaffected.
    // STORED in 3a but NOT yet enforced on the diner storefront.
    venueType: venueType("venue_type"),
    onboardingCompletedAt: timestamp("onboarding_completed_at", {
      withTimezone: true,
    }),
    onboardingStep: integer("onboarding_step").notNull().default(1),
    offersDineIn: boolean("offers_dine_in").notNull().default(true),
    offersTakeaway: boolean("offers_takeaway").notNull().default(true),
    offersDelivery: boolean("offers_delivery").notNull().default(false),
    // Multi-station label printing (onboarding "Stations" step). When true the
    // orders desk can print a separate sticky/label docket per prep station
    // (kebab, grill, …) in addition to the customer receipt and the packaging
    // docket. Stations themselves live in venue_stations; this is just the
    // master on/off the owner sets while onboarding. Default false → existing
    // venues keep today's single-ticket behaviour untouched.
    stationPrintingEnabled: boolean("station_printing_enabled")
      .notNull()
      .default(false),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("venues_slug_idx").on(table.slug),
    // One venue per Stripe customer / subscription. Nullable-unique: many NULLs
    // are allowed in Postgres, and these give the billing webhook a reliable
    // fallback lookup when an event carries no venueId metadata (e.g. invoices).
    uniqueIndex("venues_stripe_customer_id_idx").on(table.stripeCustomerId),
    uniqueIndex("venues_stripe_subscription_id_idx").on(
      table.stripeSubscriptionId,
    ),
    check(
      "venues_scheduling_lead_minutes_nonneg",
      sql`${table.schedulingLeadMinutes} >= 0`,
    ),
    check(
      "venues_scheduling_max_days_ahead_nonneg",
      sql`${table.schedulingMaxDaysAhead} >= 0`,
    ),
  ],
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

/**
 * Dine-in tables (Phase 10). Owner-managed dining tables for a venue. `label`
 * is the free-text table name (e.g. "1", "Patio 3") shown to staff and encoded
 * into a per-table QR deep-link ({baseUrl}/{slug}?table=<label>) that pre-fills
 * dine-in on the storefront. Venue-scoped with IDOR-safe writes, mirroring
 * menu_item_variants. Additive: a brand-new table, no existing column altered.
 */
export const venueTables = pgTable(
  "venue_tables",
  {
    id: id(),
    venueId: text("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    // Optional seat count shown on the table card + tent (design). Null = unset.
    seats: integer("seats"),
    // No DB default; set to MAX(sort_order)+1 within the venue on insert.
    sortOrder: integer("sort_order").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("venue_tables_venue_idx").on(table.venueId),
    // Case-insensitive uniqueness per venue so two tables can't share a label
    // (and therefore an identical QR deep-link). Mirrors users_email_lower_idx.
    uniqueIndex("venue_tables_venue_label_idx").on(
      table.venueId,
      sql`lower(${table.label})`,
    ),
  ],
);
export type VenueTable = typeof venueTables.$inferSelect;

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

// Which prep station a menu item's docket line belongs to. "auto" (default)
// defers to category-name detection at display time (drinks/bar → front
// counter, everything else → kitchen); "kitchen" / "counter" are explicit
// owner overrides. Display-only — never touches money or the order snapshot.
export const menuItemStation = pgEnum("menu_item_station", [
  "auto",
  "kitchen",
  "counter",
]);

/**
 * Owner-defined prep stations for multi-station label printing (e.g. "Kebab",
 * "Grill", "Fryer"), configured in the onboarding "Stations" step. Distinct from
 * the built-in kitchen/counter split above: those route lines on the ONE thermal
 * receipt; a venue_station drives a SEPARATE per-station sticky/label docket that
 * shows only that station's items (plus a "+N more items" count) with no prices,
 * headed by `<dailyNumber>-<code>` (e.g. "42-K").
 *
 * `code` is the station initial(s) used in that heading and must be unique within
 * the venue so a tag like "42-K" is unambiguous. Display/routing only — never
 * snapshotted onto an order, so renaming a station or changing its code is
 * always safe and never rewrites financial history.
 */
export const venueStations = pgTable(
  "venue_stations",
  {
    id: id(),
    venueId: text("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // Short initial(s) for the label heading, e.g. "K" for Kebab. Uppercased in
    // app code before write; kept short by a CHECK so labels stay legible.
    code: text("code").notNull(),
    // Per-station toggle for whether its sticky label actually prints. The venue
    // master switch is venues.station_printing_enabled; this lets an owner keep a
    // station defined but silence its label without deleting it.
    labelPrintEnabled: boolean("label_print_enabled").notNull().default(true),
    sortOrder: integer("sort_order").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("venue_stations_venue_idx").on(table.venueId),
    // Codes must be distinct within a venue so "42-K" points at exactly one
    // station. Case is normalised (uppercased) in app code before insert.
    uniqueIndex("venue_stations_venue_code_idx").on(table.venueId, table.code),
    check(
      "venue_stations_code_len",
      sql`char_length(${table.code}) between 1 and 3`,
    ),
  ],
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
    // Prep-station routing for the kitchen docket. "auto" defers to category-
    // name detection; owner may pin an item to "kitchen" or "counter" (drinks
    // fridge / front counter). Display-only — order snapshots never read it.
    station: menuItemStation("station").notNull().default("auto"),
    // Owner-defined station this item is prepared at, for the per-station label
    // docket (venue_stations). NULL = not routed to any custom station: the item
    // still appears on the receipt and packaging docket, and counts toward the
    // "+N more items" tally on other stations' labels. Set NULL if its station
    // is deleted (onDelete) — display-only, so it never touches order money.
    stationId: text("station_id").references(() => venueStations.id, {
      onDelete: "set null",
    }),
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
export type VenueStation = typeof venueStations.$inferSelect;
export type ModifierGroup = typeof modifierGroups.$inferSelect;
export type ModifierOption = typeof modifierOptions.$inferSelect;
export type MenuItemVariant = typeof menuItemVariants.$inferSelect;
export type MenuItemTag = typeof menuItemTags.$inferSelect;

/* -------------------------------------------------------------------------- */
/* Customer identity (#7) — a SEPARATE system from owner Auth.js              */
/*                                                                            */
/* This is the customer-facing identity store, FIREWALLED from the owner auth */
/* system above (users / accounts / sessions / verification_tokens):          */
/*  - the Auth.js DrizzleAdapter (lib/auth.ts) is wired to ONLY the owner four */
/*    tables and has no knowledge of anything here;                           */
/*  - all customer code lives under lib/customer/* + app/[slug]/account/* and  */
/*    NEVER imports lib/auth.ts, signIn/auth/signOut, or the owner tables;     */
/*  - customers use their OWN session cookie (ot_customer_session), distinct   */
/*    from the Auth.js cookie and from ot_selected_venue.                      */
/*                                                                            */
/* SCOPE = per-VENUE: a customer belongs to ONE venue, keyed by (venue_id,     */
/* lower(email)). The SAME email can therefore be a customer at venue A, a     */
/* customer at venue B, AND an owner — all as SEPARATE records that never      */
/* collide, because owner identity lives in a different table keyed GLOBALLY.  */
/* An owner is never auto-made a customer, or vice-versa. Forward-compatible   */
/* to per-platform later via an additive account table + nullable link.        */
/*                                                                            */
/* Defined BEFORE the Orders section below so orders.customer_id can carry a   */
/* nullable FK into it (matching the codebase's define-before-reference rule). */
/* -------------------------------------------------------------------------- */

export const customers = pgTable(
  "customers",
  {
    id: id(),
    venueId: text("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    // The verified identity — the magic-link is sent here. Stored lowercased;
    // the unique index is on lower(email) PER VENUE so casing can never fork a
    // second customer (mirrors the owner users_email_lower_idx, venue-scoped).
    email: text("email").notNull(),
    // OPTIONAL, customer-saved for venue convenience — NOT an auth factor, and
    // deliberately NOT used to claim past orders under email auth (auto-claiming
    // an UNVERIFIED phone match would be an IDOR; see app/[slug]/account).
    phone: text("phone"),
    // Optional display name; minimal PII by design.
    name: text("name"),
    // Per-customer order-notification preferences (opt-in). Email defaults ON
    // (we already have the verified address and it's low-friction); SMS defaults
    // OFF (it needs a phone AND a configured provider). Both additive, NOT NULL
    // with defaults so existing rows backfill safely. Consulted best-effort at
    // send time — they gate notifications, never the order/money path.
    notifyOrderEmail: boolean("notify_order_email").notNull().default(true),
    notifyOrderSms: boolean("notify_order_sms").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    // Per-venue, case-insensitive identity key: "one customer per (venue,
    // email)". Keeps the owner/customer keyspaces disjoint — owner email is
    // unique GLOBALLY, customer email only WITHIN a venue.
    uniqueIndex("customers_venue_email_lower_idx").on(
      table.venueId,
      sql`lower(${table.email})`,
    ),
    index("customers_venue_idx").on(table.venueId),
  ],
);

// Why a points_ledger row exists. "earn" (credit on a confirmed order),
// "redeem" (debit when points pay for an order — PR2), "adjust" (manual
// owner correction). The balance is the SUM of deltaPoints; never a stored
// counter, so it can't drift from its history.
export const pointsLedgerReason = pgEnum("points_ledger_reason", [
  "earn",
  "redeem",
  "adjust",
]);

/**
 * Customer loyalty points, as an append-only LEDGER (never a mutable balance).
 * Each row is a signed delta for one (venue, customer); the live balance is
 * SUM(delta_points). Firewalled like every customer read — venue + customer
 * scoped, cascades with both. Earning writes an "earn" row from the Stripe
 * webhook's isolated after() block; the UNIQUE(order_id, reason) index makes
 * that idempotent under webhook replays + the cron backstop (one earn per
 * order, later one redeem per order). order_id is a real FK (SET NULL on order
 * delete) so history survives; a manual "adjust" has no order_id.
 */
export const pointsLedger = pgTable(
  "points_ledger",
  {
    id: id(),
    venueId: text("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    orderId: text("order_id").references(() => orders.id, {
      onDelete: "set null",
    }),
    deltaPoints: integer("delta_points").notNull(),
    reason: pointsLedgerReason("reason").notNull(),
    note: text("note"),
    createdAt: createdAt(),
  },
  (table) => [
    index("points_ledger_venue_customer_idx").on(
      table.venueId,
      table.customerId,
    ),
    // One earn (and later one redeem) per order — idempotent webhook + sweep.
    uniqueIndex("points_ledger_order_reason_idx").on(
      table.orderId,
      table.reason,
    ),
  ],
);

export const giftCardStatus = pgEnum("gift_card_status", ["active", "void"]);

// Why a gift_card_ledger row exists. "issue" (opening value), "topup" (owner
// adds value), "redeem" (spent on an order), "adjust" (manual correction). The
// card's balance is the cached counter kept in step with the SUM of these.
export const giftCardReason = pgEnum("gift_card_reason", [
  "issue",
  "redeem",
  "topup",
  "adjust",
]);

/**
 * Owner-issued stored-value gift cards (redeem-only v1). A card is a per-venue
 * CODE carrying a cash balance a diner can spend at checkout. balance_cents is a
 * CACHED counter kept in step with the append-only gift_card_ledger in the SAME
 * transaction (the stock-ledger pattern — never drifts). The code is a BEARER
 * credential (anyone holding it can redeem) shown to the owner, so it is stored
 * as-is, unique per venue. Venue-scoped; cascades with the venue.
 */
export const giftCards = pgTable(
  "gift_cards",
  {
    id: id(),
    venueId: text("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    initialCents: integer("initial_cents").notNull(),
    balanceCents: integer("balance_cents").notNull(),
    status: giftCardStatus("status").notNull().default("active"),
    note: text("note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("gift_cards_venue_code_idx").on(table.venueId, table.code),
    index("gift_cards_venue_idx").on(table.venueId),
    check("gift_cards_balance_nonneg", sql`${table.balanceCents} >= 0`),
  ],
);

/**
 * Append-only ledger of every value movement on a gift card. Balance =
 * SUM(delta_cents); the card's cached balance_cents mirrors it. A "redeem" row
 * carries the order it paid for (soft ref, SET NULL on order delete) and is made
 * idempotent by unique(order_id, reason) — one redeem per order (issue/topup/
 * adjust carry no order_id; NULLs are distinct so they never collide).
 */
export const giftCardLedger = pgTable(
  "gift_card_ledger",
  {
    id: id(),
    venueId: text("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    giftCardId: text("gift_card_id")
      .notNull()
      .references(() => giftCards.id, { onDelete: "cascade" }),
    orderId: text("order_id").references(() => orders.id, {
      onDelete: "set null",
    }),
    deltaCents: integer("delta_cents").notNull(),
    reason: giftCardReason("reason").notNull(),
    note: text("note"),
    createdAt: createdAt(),
  },
  (table) => [
    index("gift_card_ledger_card_idx").on(table.giftCardId),
    uniqueIndex("gift_card_ledger_order_reason_idx").on(
      table.orderId,
      table.reason,
    ),
  ],
);

export const supportDepartment = pgEnum("support_department", [
  "tech",
  "sales",
  "billing",
]);

export const supportTicketStatus = pgEnum("support_ticket_status", [
  "open",
  "replied",
  "closed",
]);

/**
 * MIRROR of support tickets raised by the Foundry support agent (AI support
 * chat — docs/ai-support-chat-plan.md). Foundry is the system of record for
 * conversations AND tickets (decision D2); this table only mirrors the tickets
 * that concern THIS platform's venues so they're visible in-app, populated
 * idempotently by the signed webhook (app/api/support/webhook). Money-inert;
 * venue-scoped like every owner surface.
 */
export const supportTickets = pgTable(
  "support_tickets",
  {
    id: id(),
    venueId: text("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    // Foundry's ticket id — the idempotency key for webhook upserts.
    foundryTicketId: text("foundry_ticket_id").notNull(),
    // Foundry's conversation id (opaque here; transcripts live in Foundry).
    conversationId: text("conversation_id").notNull(),
    department: supportDepartment("department").notNull(),
    // Agent-written handoff brief (plain text, React-escaped on render).
    summary: text("summary").notNull(),
    status: supportTicketStatus("status").notNull().default("open"),
    // The operator's reply, mirrored on ticket.replied (nullable until then).
    reply: text("reply"),
    createdAt: createdAt(),
    repliedAt: timestamp("replied_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("support_tickets_foundry_idx").on(table.foundryTicketId),
    index("support_tickets_venue_idx").on(table.venueId),
  ],
);

/**
 * Single-use magic-link tokens for customer sign-in — SEPARATE from the Auth.js
 * verification_tokens table. We store only a SHA-256 HASH of the token; the raw
 * token exists only inside the emailed link, so a DB leak yields no usable links
 * (stronger than the owner adapter, which stores raw tokens). Venue-scoped,
 * short-lived (~15 min), and deleted on consume.
 */
export const customerLoginTokens = pgTable(
  "customer_login_tokens",
  {
    id: id(),
    venueId: text("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("customer_login_tokens_token_hash_idx").on(table.tokenHash),
    index("customer_login_tokens_venue_email_idx").on(
      table.venueId,
      table.email,
    ),
  ],
);

/**
 * Customer sessions — SEPARATE from the Auth.js sessions table. Created after a
 * magic link is consumed. The cookie holds only the raw opaque session token; we
 * store its SHA-256 HASH. The row is VENUE-BOUND: getCustomer(venueId) requires
 * session.venue_id === venueId, so a session minted at venue A resolves to null
 * at venue B — per-venue isolation enforced server-side even though the cookie
 * itself is path "/".
 */
export const customerSessions = pgTable(
  "customer_sessions",
  {
    id: id(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    venueId: text("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    sessionTokenHash: text("session_token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("customer_sessions_token_hash_idx").on(table.sessionTokenHash),
    index("customer_sessions_customer_idx").on(table.customerId),
    index("customer_sessions_venue_idx").on(table.venueId),
  ],
);

export type Customer = typeof customers.$inferSelect;

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
    // Contact email captured at checkout (now a required field). NULLABLE in the
    // column so pre-existing guest orders backfill safely; new orders always set
    // it. Used to email the confirmed/ready notification to guests (signed-in
    // customers are messaged via their account per their prefs). Never a pricing
    // input; inert to the recompute / app fee / PaymentIntent / webhook.
    customerEmail: text("customer_email"),
    // OPTIONAL, NULLABLE free-text "special requests" the customer types at
    // checkout (e.g. "no onion", "extra napkins"). ADDITIVE and deliberately
    // INERT to money: it is captured/trimmed/length-capped text only, stored on
    // the order row, shown to the kitchen / on the receipt / confirmation /
    // history — and is NEVER read back as a pricing input. The server recompute,
    // the snapshot totals, the app fee, the PaymentIntent, and the webhook do not
    // touch it. Guest orders and the pre-notes money path are unchanged.
    notes: text("notes"),
    // OPTIONAL, NULLABLE soft association to a customer account (#7). Guest
    // orders leave this NULL and behave EXACTLY as before — identity is opt-in
    // and is NEVER required to order. placeOrder does NOT set this column (its
    // INSERT lists explicit columns), so the order-creation path stays
    // byte-for-byte unchanged; an order is linked ONLY by the SEPARATE
    // claimOrder action, where possession of the opaque public_token is the
    // proof. FK with ON DELETE SET NULL — deleting a customer reverts their
    // orders to guest and NEVER deletes an order (cf. the venue cascade). It is
    // a real relationship to a living entity (like venue_id), not a price
    // snapshot, hence an FK and not one of the analytics-only soft refs.
    customerId: text("customer_id").references(() => customers.id, {
      onDelete: "set null",
    }),
    status: orderStatus("status").notNull().default("pending_payment"),
    // Kitchen lifecycle, separate from `status` (payment). NOT NULL DEFAULT
    // 'new' so existing paid orders backfill into the queue safely.
    fulfillmentStatus: orderFulfillmentStatus("fulfillment_status")
      .notNull()
      .default("new"),
    // When the order was handed off (fulfillment_status → completed). Set by the
    // kitchen action, cleared if it's moved back out of completed. The Completed
    // column windows on THIS, not created_at, so a scheduled/older order still
    // shows as just-completed. Additive + inert to money.
    completedAt: timestamp("completed_at", { withTimezone: true }),
    // Short, human "call number" for this order — a per-venue sequence that
    // resets each day (see venue_order_sequences), so staff can call "Order 7".
    // Assigned best-effort at order creation; NULL if the counter was
    // unavailable or for pre-existing orders. Display-only, INERT to money.
    dailyNumber: integer("daily_number"),
    subtotalCents: integer("subtotal_cents").notNull(),
    totalCents: integer("total_cents").notNull(),
    // GST component (inclusive) already contained in total_cents — an additive
    // display/reporting snapshot, NEVER added to the charge. 0 when tax disabled.
    taxCents: integer("tax_cents").notNull().default(0),
    // Pay-by-bank discount applied to THIS order (Track B · 3b-ii). Default 0 —
    // placeOrder always writes the full (card) price and leaves this 0. A
    // separate, method-triggered server action (applyBankDiscount) sets it and
    // lowers total_cents when the customer chooses PayTo; total = subtotal −
    // discount. Never a surcharge.
    discountCents: integer("discount_cents").notNull().default(0),
    // Promotion breakdown (Track E2d). `discount_cents` above is the COMBINED
    // saving (promo + pay-by-bank); these record how much of it is the platform
    // promotion and which one, so the single recompute can reconstruct both
    // components (discount_cents alone is lossy). Soft ref — no FK — so deleting
    // a promo never rewrites a placed order. bank portion = discount − promo.
    promoDiscountCents: integer("promo_discount_cents").notNull().default(0),
    appliedPromoId: text("applied_promo_id"),
    // Loyalty points redeemed on THIS order (Loyalty PR2). Like the promo
    // breakdown above, these decompose `discount_cents`: points_discount_cents
    // is the cash value redeemed (part of the combined discount), and
    // points_redeemed is how many points that consumed. Both default 0 —
    // placeOrder never sets them; the same server recompute (applyOrderDiscounts)
    // sets them when the diner opts to redeem, and the webhook writes the ledger
    // debit at confirmation. Inert to the fee model (fee is on the final total).
    pointsDiscountCents: integer("points_discount_cents").notNull().default(0),
    pointsRedeemed: integer("points_redeemed").notNull().default(0),
    // Gift-card redemption on THIS order (Gift cards PR2). points-style
    // decomposition of discount_cents: gift_card_redeemed_cents is the value the
    // card paid, gift_card_id (soft ref — no FK, survives a card delete) which
    // card. Default 0/null — placeOrder never sets them; the same recompute
    // (applyOrderDiscounts) records the reservation and the webhook writes the
    // card ledger debit at confirmation. Fee is on the final total.
    giftCardId: text("gift_card_id"),
    giftCardRedeemedCents: integer("gift_card_redeemed_cents")
      .notNull()
      .default(0),
    // The platform's co-funded share of this order's promo discount (Track
    // E2d-3), recorded at apply time = round(promo_discount_cents ×
    // promotion.platform_funded_percent ÷ 100). A tracked liability the platform
    // owes the venue for a co-/platform-funded promo, reconciled out of band —
    // it does NOT change the charge or the application fee.
    platformFundedCents: integer("platform_funded_cents").notNull().default(0),
    // Stripe PaymentIntent backing this order (direct charge on the venue's
    // connected account). Set server-side after the order row is written; the
    // webhook resolves orders to confirm/fail by THIS id only — never a
    // client-supplied identifier.
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    // OPTIONAL scheduled pickup time (Phase 8). NULL = ASAP = today's exact
    // behaviour. An ADDITIVE capture like `notes`: the customer's chosen pickup
    // instant (validated server-side, in the venue timezone, against open hours +
    // lead time BEFORE the order is created) — INERT to money: the recompute,
    // snapshots, app fee, PaymentIntent, and webhook never read it. Stored as an
    // absolute instant (timestamptz) so the kitchen renders it with
    // formatVenueTime exactly like created_at. Pickup-only; dine-in stays NULL.
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
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
    // The customer order-history read (#7): a customer's own orders, newest
    // first. Always combined with venue_id in the query (the session is
    // venue-bound), and customer_id is session-derived — never client input.
    index("orders_customer_created_idx").on(table.customerId, table.createdAt),
    check("orders_subtotal_cents_nonneg", sql`${table.subtotalCents} >= 0`),
    check("orders_total_cents_nonneg", sql`${table.totalCents} >= 0`),
    check("orders_discount_cents_nonneg", sql`${table.discountCents} >= 0`),
    // Supports the promotion budget aggregation (Track E2d-2): sum of
    // promo_discount_cents by applied_promo_id over confirmed orders.
    index("orders_applied_promo_idx").on(table.appliedPromoId),
  ],
);

/**
 * Per-venue, per-day counter behind orders.daily_number — the short "call
 * number" that resets each day. service_date is a YYYY-MM-DD string in the
 * venue's timezone (computed at order time). Incremented atomically via an
 * INSERT … ON CONFLICT DO UPDATE … +1 RETURNING, so concurrent orders never
 * collide. Cascades with the venue. Purely operational; never a money input.
 */
export const venueOrderSequences = pgTable(
  "venue_order_sequences",
  {
    venueId: text("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    serviceDate: text("service_date").notNull(),
    lastNumber: integer("last_number").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.venueId, table.serviceDate] })],
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
    // Chosen item size variant snapshot (Phase 5c). All THREE are NULLABLE: a
    // flat-priced line has no variant and leaves them null. variant_price_cents
    // _snapshot is the FINANCIAL base price for the line at order time (already
    // folded into unit_price_cents_snapshot together with any modifier deltas);
    // variant_name_snapshot is what the kitchen / receipt / confirmation render.
    // menu_item_variant_id is a SOFT reference (nullable, NO FK) for "which sizes
    // sell" analytics ONLY — NEVER a price source — mirroring the menu_item_id /
    // modifier_option_id soft refs. Additive: no existing column is altered.
    menuItemVariantId: text("menu_item_variant_id"),
    variantNameSnapshot: text("variant_name_snapshot"),
    variantPriceCentsSnapshot: integer("variant_price_cents_snapshot"),
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
    check(
      "order_items_variant_price_snapshot_nonneg",
      sql`${table.variantPriceCentsSnapshot} IS NULL OR ${table.variantPriceCentsSnapshot} >= 0`,
    ),
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

/* -------------------------------------------------------------------------- */
/* Integrations (Track 0)                                                      */
/*                                                                            */
/* Third-party connectors (Square POS first) that MIRROR order state OUTWARD  */
/* after confirmation. Nothing here participates in the money path: orders    */
/* are confirmed solely by the Stripe webhook, and integration work is        */
/* re-derivable from order state (outbox pattern), so a provider outage can   */
/* never delay or fail an order.                                              */
/* -------------------------------------------------------------------------- */

export const integrationProvider = pgEnum("integration_provider", [
  "square",
  // Future connectors extend this enum additively: 'doshii', 'ordermentum'…
]);

/**
 * Connection lifecycle. `needs_attention` = connected but recent mirror work
 * is failing (surfaced on the integrations hub); `revoked` = the provider
 * grant was revoked (by the venue on the provider side, or token failure);
 * `disabled` = the owner paused/disconnected it in prompt2eat.
 */
export const integrationStatus = pgEnum("integration_status", [
  "active",
  "needs_attention",
  "revoked",
  "disabled",
]);

export const integrationJobKind = pgEnum("integration_job_kind", [
  "order_mirror",
  // Reserved seams (Tracks A follow-ups + D): 'refund_mirror',
  // 'inventory_depletion' — added additively when their arcs build.
]);

export const integrationJobStatus = pgEnum("integration_job_status", [
  "pending",
  "processing",
  "succeeded",
  "failed",
  "dead",
]);

/**
 * One row per (venue, provider) connection. OAuth tokens are stored ONLY
 * encrypted (AES-256-GCM via lib/crypto.ts) — no plaintext token column
 * exists. Health fields power the hub's quiet-error surfacing.
 */
export const venueIntegrations = pgTable(
  "venue_integrations",
  {
    id: id(),
    venueId: text("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    provider: integrationProvider("provider").notNull(),
    status: integrationStatus("status").notNull().default("active"),
    // Encrypted (v1.<iv>.<ct>.<tag>) — never log, never select into client code.
    accessTokenEnc: text("access_token_enc"),
    refreshTokenEnc: text("refresh_token_enc"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    // Last successful token refresh — drives the ≤7-day refresh duty.
    tokenRefreshedAt: timestamp("token_refreshed_at", { withTimezone: true }),
    // Provider-side account + chosen location (e.g. Square merchant_id and the
    // location this venue maps to; one venue ↔ one provider location).
    providerAccountId: text("provider_account_id"),
    providerLocationId: text("provider_location_id"),
    providerLocationName: text("provider_location_name"),
    // Space-separated OAuth scopes actually granted (for health/debug display).
    scopes: text("scopes"),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    // Scrubbed, human-readable summary only — NEVER raw provider payloads or
    // anything token-shaped.
    lastError: text("last_error"),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("venue_integrations_venue_provider_idx").on(
      table.venueId,
      table.provider,
    ),
    index("venue_integrations_venue_idx").on(table.venueId),
    check(
      "venue_integrations_failures_nonneg",
      sql`${table.consecutiveFailures} >= 0`,
    ),
  ],
);

/**
 * The integrations OUTBOX. A job = "mirror order X to provider P". Jobs are
 * derivable from order state (the cron sweep re-creates any missing row), so
 * the webhook's fast-path enqueue is a latency optimization, never a
 * correctness dependency. UNIQUE (order, provider, kind) makes enqueueing
 * idempotent under Stripe replays, sweep overlaps, and manual retries.
 */
export const integrationJobs = pgTable(
  "integration_jobs",
  {
    id: id(),
    venueId: text("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    provider: integrationProvider("provider").notNull(),
    kind: integrationJobKind("kind").notNull(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    status: integrationJobStatus("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    // Exponential backoff pointer; the processor only claims due jobs.
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Scrubbed summary only (same rule as venue_integrations.last_error).
    lastError: text("last_error"),
    // Provider-side id created by this job (e.g. the Square order id). Its
    // presence lets a retried job resume after a partial success.
    providerRef: text("provider_ref"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("integration_jobs_order_provider_kind_idx").on(
      table.orderId,
      table.provider,
      table.kind,
    ),
    index("integration_jobs_due_idx").on(table.status, table.nextAttemptAt),
    index("integration_jobs_venue_idx").on(table.venueId),
    check("integration_jobs_attempts_nonneg", sql`${table.attempts} >= 0`),
  ],
);

export type VenueIntegration = typeof venueIntegrations.$inferSelect;
export type IntegrationJob = typeof integrationJobs.$inferSelect;

/* -------------------------------------------------------------------------- */
/* Stock & recipe costing (Track D)                                            */
/*                                                                            */
/* Venue-scoped ingredient library. Cost-per-recipe-unit is DERIVED, never    */
/* stored: pack_cost / pack_size / yield (lib/stock/cost.ts), so updating a    */
/* pack price re-costs every recipe automatically. Purely owner-side analytics */
/* — nothing here touches the order money path.                               */
/* -------------------------------------------------------------------------- */

/** The unit a recipe measures this ingredient in. */
export const recipeUnit = pgEnum("recipe_unit", ["g", "ml", "each"]);

export const ingredients = pgTable(
  "ingredients",
  {
    id: id(),
    venueId: text("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    unit: recipeUnit("unit").notNull(),
    // Purchase pack expressed IN the recipe unit (e.g. 12×1 L = 12000 for a
    // "ml" ingredient) + its cost. BOTH nullable: an ingredient can be added
    // name-only and costed later ("uncosted"). cost-per-unit is null until both
    // are set.
    packSize: doublePrecision("pack_size"),
    packCostCents: integer("pack_cost_cents"),
    // Usable fraction after trim/waste, 1–100; defaults to 100 (no loss).
    yieldPct: integer("yield_pct").notNull().default(100),
    supplier: text("supplier"),
    // Packaging (cups, lids…) vs food — a display/report distinction only.
    isPackaging: boolean("is_packaging").notNull().default(false),
    // Perpetual inventory (Track D · D4). on_hand_qty is a CACHED counter kept
    // in lockstep with the stock_movements ledger (the audit source of truth) —
    // never written directly except through recordStockMovement in the same
    // transaction as the ledger row. NULL = the owner hasn't started tracking
    // this ingredient's stock (distinct from 0 on hand); may go negative when
    // depletion outruns recorded receipts (a tracking-gap signal). par_level is
    // the reorder threshold — low-stock when on_hand < par. Both in the recipe
    // unit. Analytics only — no order money-path involvement.
    onHandQty: doublePrecision("on_hand_qty"),
    parLevel: doublePrecision("par_level"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("ingredients_venue_idx").on(table.venueId),
    check(
      "ingredients_pack_size_pos",
      sql`${table.packSize} IS NULL OR ${table.packSize} > 0`,
    ),
    check(
      "ingredients_pack_cost_nonneg",
      sql`${table.packCostCents} IS NULL OR ${table.packCostCents} >= 0`,
    ),
    check(
      "ingredients_yield_pct_range",
      sql`${table.yieldPct} >= 1 AND ${table.yieldPct} <= 100`,
    ),
    check(
      "ingredients_par_level_nonneg",
      sql`${table.parLevel} IS NULL OR ${table.parLevel} >= 0`,
    ),
  ],
);

export type Ingredient = typeof ingredients.$inferSelect;

/**
 * A recipe line: how much of an ingredient a menu item uses per serve (Track D
 * · D2). Dish COGS = Σ qty × ingredient cost-per-unit (lib/stock/cost.ts) — all
 * derived, never stored, so an ingredient price change re-costs every dish.
 * Both refs are hard FKs with ON DELETE CASCADE: deleting the item or the
 * ingredient removes its recipe lines (a recipe line is meaningless without
 * both). Analytics only — no order money-path involvement.
 */
export const recipeLines = pgTable(
  "recipe_lines",
  {
    id: id(),
    venueId: text("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    menuItemId: text("menu_item_id")
      .notNull()
      .references(() => menuItems.id, { onDelete: "cascade" }),
    ingredientId: text("ingredient_id")
      .notNull()
      .references(() => ingredients.id, { onDelete: "cascade" }),
    // Quantity in the ingredient's recipe unit (may be fractional, e.g. 0.5 each).
    qty: doublePrecision("qty").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("recipe_lines_venue_idx").on(table.venueId),
    index("recipe_lines_item_idx").on(table.menuItemId),
    // One line per (item, ingredient) — edit the qty, don't duplicate.
    uniqueIndex("recipe_lines_item_ingredient_idx").on(
      table.menuItemId,
      table.ingredientId,
    ),
    check("recipe_lines_qty_pos", sql`${table.qty} > 0`),
  ],
);

export type RecipeLine = typeof recipeLines.$inferSelect;

/**
 * A completed invoice-cost import (Track D · D3). One row per applied supplier
 * invoice scan — a lightweight audit/history record backing the "recent scans"
 * list, NOT the source of any cost (costs live on `ingredients`). We store only
 * the counts the owner sees; the scanned images are never persisted. Analytics
 * only — no order money-path involvement.
 */
export const invoiceScans = pgTable(
  "invoice_scans",
  {
    id: id(),
    venueId: text("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    // Supplier read from the invoice header (nullable — some invoices omit it).
    supplier: text("supplier"),
    // How many lines the review gate carried, and what was applied from them.
    lineCount: integer("line_count").notNull().default(0),
    updatedCount: integer("updated_count").notNull().default(0),
    createdCount: integer("created_count").notNull().default(0),
    createdAt: createdAt(),
  },
  (table) => [index("invoice_scans_venue_idx").on(table.venueId)],
);

export type InvoiceScan = typeof invoiceScans.$inferSelect;

/**
 * Why an ingredient's on-hand quantity changed. `depletion` is produced by the
 * order-consumption job (Track D · D4b); the rest are owner-initiated stock
 * events. `stocktake` reconciles to a counted absolute (its delta = counted −
 * current). All values defined up front so later builds add rows, not enum
 * members.
 */
export const stockMovementReason = pgEnum("stock_movement_reason", [
  "opening",
  "receiving",
  "adjustment",
  "wastage",
  "stocktake",
  "depletion",
]);

/**
 * The perpetual-inventory ledger (Track D · D4). One row per change to an
 * ingredient's on-hand quantity — the audit source of truth; `ingredients.
 * on_hand_qty` is a cached running sum maintained in the SAME transaction (see
 * lib/stock/movements.ts). `delta_qty` is signed (in the recipe unit): positive
 * = stock in (receiving), negative = stock out (wastage/depletion); a stocktake
 * carries whatever delta reconciles the count. `order_id` links a depletion row
 * to its order (SET NULL if the order is later removed — the movement still
 * happened). Analytics only — no order money-path involvement.
 */
export const stockMovements = pgTable(
  "stock_movements",
  {
    id: id(),
    venueId: text("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    ingredientId: text("ingredient_id")
      .notNull()
      .references(() => ingredients.id, { onDelete: "cascade" }),
    deltaQty: doublePrecision("delta_qty").notNull(),
    reason: stockMovementReason("reason").notNull(),
    // Source order for a depletion movement (D4b); null for owner-initiated
    // events. SET NULL keeps the ledger intact if the order is ever deleted.
    orderId: text("order_id").references(() => orders.id, {
      onDelete: "set null",
    }),
    note: text("note"),
    createdAt: createdAt(),
  },
  (table) => [
    index("stock_movements_venue_idx").on(table.venueId),
    index("stock_movements_ingredient_idx").on(table.ingredientId),
    // Depletion idempotency (Track D · D4b): at most ONE depletion movement per
    // (order, ingredient). Makes the order-consumption apply safe under webhook
    // replays, sweep overlaps, and concurrent kicks — insert ON CONFLICT DO
    // NOTHING and only newly-inserted rows bump the on-hand counter. Partial, so
    // it constrains nothing about the owner-initiated movements.
    uniqueIndex("stock_movements_order_depletion_uniq")
      .on(table.orderId, table.ingredientId)
      .where(sql`${table.reason} = 'depletion' AND ${table.orderId} IS NOT NULL`),
  ],
);

export type StockMovement = typeof stockMovements.$inferSelect;

/**
 * Dismissed suggestions (Track D · D5). The Suggestions inbox is DERIVED LIVE
 * from current state (low stock, stale costs, thin margins…), never stored — so
 * it can't go stale. This table persists only the owner's DISMISSALS, keyed by a
 * stable per-suggestion `dedupe_key`; a dismissal suppresses that suggestion for
 * a cooldown window (see lib/nudges.ts) and then lets it resurface if the
 * condition still holds. Owner analytics only — no order money-path involvement.
 */
export const nudges = pgTable(
  "nudges",
  {
    id: id(),
    venueId: text("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    // Stable identity of the suggestion, e.g. "reorder:<ingredientId>".
    dedupeKey: text("dedupe_key").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    // One dismissal per (venue, suggestion) — re-dismissing refreshes createdAt.
    uniqueIndex("nudges_venue_key_idx").on(table.venueId, table.dedupeKey),
  ],
);

export type Nudge = typeof nudges.$inferSelect;

/**
 * Platform-level settings (Track E). Key-value rows owned by the ADMIN CONSOLE,
 * never by venue owners — the D1 decision made concrete: platform knobs (first:
 * `square_fee_mode`) are DATA, not code branches, switchable without a deploy.
 * Values are plain strings; each accessor in lib/platform-settings.ts owns its
 * key's parsing + default, so an absent row always means "the default".
 */
export const platformSettings = pgTable("platform_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: updatedAt(),
});

export type PlatformSetting = typeof platformSettings.$inferSelect;

/**
 * Audit trail for admin-console actions (Track E). Every platform-setting
 * change writes a row: who (the allowlisted admin email), what, and the detail
 * of the change. Append-only — nothing in the app updates or deletes rows.
 */
export const platformAuditLog = pgTable(
  "platform_audit_log",
  {
    id: id(),
    actorEmail: text("actor_email").notNull(),
    action: text("action").notNull(),
    detail: text("detail"),
    createdAt: createdAt(),
  },
  (table) => [index("platform_audit_created_idx").on(table.createdAt)],
);

export type PlatformAuditEntry = typeof platformAuditLog.$inferSelect;

/**
 * Platform promotions (Track E2d). A campaign the admin console runs — a % or
 * fixed-$ discount on qualifying orders, within a window, above a minimum
 * basket. v1 is platform-wide (all venues); per-venue targeting is a later
 * additive build. The discount itself is applied server-side at the payment
 * step by the SINGLE order-discount recompute (lib/payments/order-discount.ts),
 * which stacks it with the pay-by-bank saving and clamps the total once — never
 * a surcharge. This table is the campaign DEFINITION; per-order application is
 * recorded on `orders.applied_promo_id` + `orders.promo_discount_cents`.
 */
export const promotions = pgTable(
  "promotions",
  {
    id: id(),
    name: text("name").notNull(),
    type: promotionType("type").notNull(),
    // Percent (1–100) when type=percent, else cents off.
    value: integer("value").notNull(),
    // Minimum order subtotal (cents) for the promo to apply; 0 = no minimum.
    minBasketCents: integer("min_basket_cents").notNull().default(0),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    fundingSource: promotionFunding("funding_source").notNull().default("merchant"),
    // Co-funding split (Track E2d-3): the % of each order's promo discount the
    // PLATFORM absorbs (0 = merchant funds it all, 100 = platform funds it all,
    // in between = co-funded). Drives the per-order platform_funded_cents
    // liability recorded at apply time; settled with venues OUT OF BAND (no
    // automated transfer). funding_source is the human label; this is the number
    // the accounting uses.
    platformFundedPercent: integer("platform_funded_percent").notNull().default(0),
    // Targeting + guardrails (Track E2d-2). scope=selected restricts to the
    // venues in promotion_venues; audience=new restricts to first-time
    // customers; budget_cents (nullable = uncapped) is a soft spend cap — once
    // confirmed orders' promo discount reaches it, the promo stops applying.
    scope: promotionScope("scope").notNull().default("all"),
    audience: promotionAudience("audience").notNull().default("all"),
    budgetCents: integer("budget_cents"),
    isActive: boolean("is_active").notNull().default(true),
    // Owner-created, diner-redeemable discount CODE (quick-win #4). code NULL =
    // an auto-applied promo (platform/admin — existing behaviour); a non-null,
    // UPPERCASE code applies ONLY when the diner enters it at checkout.
    // ownerVenueId marks an owner-managed promo (vs platform-created); those are
    // always scope=selected to that one venue and merchant-funded.
    code: text("code"),
    ownerVenueId: text("owner_venue_id").references(() => venues.id, {
      onDelete: "cascade",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("promotions_active_idx").on(table.isActive),
    // One live code per owning venue; partial so the many code-less platform
    // promos stay unconstrained. Codes are stored uppercased.
    uniqueIndex("promotions_owner_code_idx")
      .on(table.ownerVenueId, table.code)
      .where(sql`${table.code} IS NOT NULL`),
    index("promotions_code_idx").on(table.code),
    check("promotions_value_pos", sql`${table.value} > 0`),
    check("promotions_min_basket_nonneg", sql`${table.minBasketCents} >= 0`),
    check(
      "promotions_budget_pos",
      sql`${table.budgetCents} IS NULL OR ${table.budgetCents} > 0`,
    ),
    check(
      "promotions_platform_funded_range",
      sql`${table.platformFundedPercent} >= 0 AND ${table.platformFundedPercent} <= 100`,
    ),
  ],
);

export type Promotion = typeof promotions.$inferSelect;

/**
 * Venues a `scope=selected` promotion targets (Track E2d-2). Cascade on both
 * sides — removing a promo or a venue drops the link, never a placed order.
 */
export const promotionVenues = pgTable(
  "promotion_venues",
  {
    id: id(),
    promotionId: text("promotion_id")
      .notNull()
      .references(() => promotions.id, { onDelete: "cascade" }),
    venueId: text("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("promotion_venues_pair_idx").on(table.promotionId, table.venueId),
    index("promotion_venues_venue_idx").on(table.venueId),
  ],
);

export type PromotionVenue = typeof promotionVenues.$inferSelect;

/* -------------------------------------------------------------------------- */
/* Hardware marketplace (Track F). A PLATFORM catalog (curated in the admin      */
/* console) that venues order from. Not venue-scoped: products are global; only  */
/* orders belong to a venue. v1 is request-to-order (invoice later) — no card    */
/* charge here, so it never touches the diner money path; a Stripe platform      */
/* checkout is a later gated build.                                              */
/* -------------------------------------------------------------------------- */

export const marketplaceCategory = pgEnum("marketplace_category", [
  "signage",
  "tablet",
  "stand",
  "consumable",
  "banner",
  "other",
]);

export const marketplaceOrderStatus = pgEnum("marketplace_order_status", [
  "requested",
  "confirmed",
  "shipped",
  "cancelled",
  // Pre-payment holding state: the order exists but the venue hasn't completed
  // Stripe Checkout yet. On payment it transitions to `requested` (a PAID order
  // awaiting admin fulfilment), so the admin flow is unchanged. Hidden from the
  // venue + admin order lists until paid.
  "pending_payment",
]);

export const marketplaceProducts = pgTable(
  "marketplace_products",
  {
    id: id(),
    name: text("name").notNull(),
    description: text("description"),
    category: marketplaceCategory("category").notNull().default("other"),
    priceCents: integer("price_cents").notNull(),
    // Optional pack/unit note (e.g. "per 100") + supplier + image URL. No upload
    // flow in v1 — the admin pastes a URL.
    unitLabel: text("unit_label"),
    supplier: text("supplier"),
    imageUrl: text("image_url"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("marketplace_products_active_idx").on(table.isActive),
    check("marketplace_products_price_nonneg", sql`${table.priceCents} >= 0`),
  ],
);

export type MarketplaceProduct = typeof marketplaceProducts.$inferSelect;

export const marketplaceOrders = pgTable(
  "marketplace_orders",
  {
    id: id(),
    venueId: text("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    status: marketplaceOrderStatus("status").notNull().default("requested"),
    // Snapshot of the order total at submission (sum of line snapshots).
    totalCents: integer("total_cents").notNull(),
    note: text("note"),
    // Platform Stripe Checkout session that collects payment for this order (the
    // marketplace is charged on the PLATFORM account, like billing — never the
    // venue's Connect account / diner money path). Null for legacy invoice-later
    // rows. paidAt is stamped by the billing webhook on payment.
    stripeCheckoutSessionId: text("stripe_checkout_session_id"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("marketplace_orders_venue_idx").on(table.venueId),
    index("marketplace_orders_status_idx").on(table.status),
    check("marketplace_orders_total_nonneg", sql`${table.totalCents} >= 0`),
  ],
);

export type MarketplaceOrder = typeof marketplaceOrders.$inferSelect;

export const marketplaceOrderItems = pgTable(
  "marketplace_order_items",
  {
    id: id(),
    orderId: text("order_id")
      .notNull()
      .references(() => marketplaceOrders.id, { onDelete: "cascade" }),
    // Soft ref (nullable, no FK) — snapshots below are the truth, so a later
    // catalog edit/removal never rewrites a placed order.
    productId: text("product_id"),
    nameSnapshot: text("name_snapshot").notNull(),
    unitPriceCentsSnapshot: integer("unit_price_cents_snapshot").notNull(),
    quantity: integer("quantity").notNull(),
    lineTotalCents: integer("line_total_cents").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("marketplace_order_items_order_idx").on(table.orderId),
    check("marketplace_order_items_qty_pos", sql`${table.quantity} > 0`),
  ],
);

export type MarketplaceOrderItem = typeof marketplaceOrderItems.$inferSelect;

/* -------------------------------------------------------------------------- */
/*  Push tokens (native owner app · Capacitor)                                 */
/* -------------------------------------------------------------------------- */

export const pushPlatform = pgEnum("push_platform", ["ios", "android", "web"]);

/**
 * Device push tokens for the native owner app. The signed-in owner's device
 * registers its APNs/FCM token against their CURRENT venue; new-order pushes go
 * to that venue's tokens. Unique on the token so re-registration updates the row
 * (and can re-home a device to a different venue) instead of duplicating.
 * venue-scoped + cascade like every other row.
 */
export const pushTokens = pgTable(
  "push_tokens",
  {
    id: id(),
    venueId: text("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    platform: pushPlatform("platform").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("push_tokens_token_idx").on(table.token),
    index("push_tokens_venue_idx").on(table.venueId),
  ],
);

export type PushToken = typeof pushTokens.$inferSelect;

/* -------------------------------------------------------------------------- */
/*  Venue image library (shared, reusable across menu items)                   */
/* -------------------------------------------------------------------------- */

/**
 * A venue's reusable image library (quick-win #6). Owners upload once and attach
 * a library image to any menu item; the item's image_url references the library
 * object's URL. R2 objects live under `venues/{id}/library/…`, distinct from the
 * per-item `…/items/…` namespace, so item-photo cleanup never deletes a shared
 * library object (see menu actions' cleanup guard). venue-scoped + cascade.
 */
export const venueImages = pgTable(
  "venue_images",
  {
    id: id(),
    venueId: text("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("venue_images_venue_idx").on(table.venueId)],
);

export type VenueImage = typeof venueImages.$inferSelect;

/* -------------------------------------------------------------------------- */
/* Shop (marketing /shop page) admin controls                                 */
/* -------------------------------------------------------------------------- */

/**
 * Admin overrides for the live-feed /shop page. The grid is driven by the MMT
 * product feed (lib/shop/feed.ts) with a code-level default category allowlist;
 * these two tables + a `shop_markup_bps` platform_settings row let a platform
 * admin tune it without a deploy. Both are read fresh per request and merged
 * onto the (separately cached) feed, so edits reflect immediately.
 *
 * Per-category visibility. A row overrides the code default for one leaf
 * category (`category` stored as it appears in the feed). Absent row ⇒ the
 * code default (DEFAULT_SHOP_CATEGORIES) decides.
 */
export const shopCategorySettings = pgTable("shop_category_settings", {
  category: text("category").primaryKey(),
  visible: boolean("visible").notNull().default(true),
  updatedAt: updatedAt(),
});

export type ShopCategorySetting = typeof shopCategorySettings.$inferSelect;

/**
 * Per-product overrides, keyed by the feed's MMT product code. `hidden` removes
 * the product from the grid + featured picks; `price_override_cents` (when set)
 * replaces the feed price (and wins over the global markup).
 */
export const shopProductOverrides = pgTable(
  "shop_product_overrides",
  {
    mmtCode: text("mmt_code").primaryKey(),
    hidden: boolean("hidden").notNull().default(false),
    priceOverrideCents: integer("price_override_cents"),
    updatedAt: updatedAt(),
  },
  (table) => [
    check(
      "shop_price_override_nonneg",
      sql`${table.priceOverrideCents} IS NULL OR ${table.priceOverrideCents} >= 0`,
    ),
  ],
);

export type ShopProductOverride = typeof shopProductOverrides.$inferSelect;
