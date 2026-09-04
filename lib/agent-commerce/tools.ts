import "server-only";

import { and, ilike, isNotNull, or } from "drizzle-orm";

import { getPublicFaqs, getPublicMenu, getPublicVenueBySlug } from "@/app/[slug]/queries";
import { db } from "@/lib/db";
import { venues } from "@/lib/db/schema";
import { getBaseUrl } from "@/lib/url";
import { formatCents, isReservedSlug } from "@/lib/validation";

import { encodeCartHandoff } from "./cart-handoff";
import { summariseHours } from "./hours";
import type { ToolDefinition, ToolRegistry, ToolResult } from "./jsonrpc";
import { validateOrderRequest, type OrderRequestLine } from "./order-request";

/**
 * The agent-commerce tools (design roadmap: "Agent commerce · MCP / JSON-LD
 * surface"). Everything here reads the SAME public storefront data the venue
 * page renders — nothing an anonymous diner could not see — and start_order
 * writes nothing: it validates the basket against the live menu and hands back
 * a storefront link carrying the basket, which the diner pays on the normal
 * checkout. Money moves only there, through the unchanged placeOrder + webhook
 * path.
 */

const SEARCH_LIMIT = 5;

function text(value: string, structured?: Record<string, unknown>): ToolResult {
  return {
    content: [{ type: "text", text: value }],
    ...(structured ? { structuredContent: structured } : {}),
  };
}

function failure(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

function slugArg(args: Record<string, unknown>): string | null {
  const slug = typeof args.slug === "string" ? args.slug.trim().toLowerCase() : "";
  return slug && !isReservedSlug(slug) ? slug : null;
}

const DEFINITIONS: ToolDefinition[] = [
  {
    name: "find_venue",
    description:
      "Find Prompt2Eat venues by name or suburb. Returns up to five matches with their storefront slug — use the slug with the other tools.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", description: "Venue name or suburb, e.g. 'Harbour Bao' or 'Manly'." } },
      required: ["query"],
    },
  },
  {
    name: "get_venue",
    description:
      "A venue's public profile: what it is, address, phone, website, opening hours (with whether it is open right now in its own time zone), whether it is taking online orders, and its storefront and menu URLs.",
    inputSchema: {
      type: "object",
      properties: { slug: { type: "string", description: "Storefront slug from find_venue." } },
      required: ["slug"],
    },
  },
  {
    name: "get_menu",
    description:
      "The venue's live menu: categories, items with ids, descriptions, prices in AUD, dietary tags, sizes (variants) and modifier groups with their option ids. Only currently available items are returned. Use the ids with start_order.",
    inputSchema: {
      type: "object",
      properties: { slug: { type: "string" } },
      required: ["slug"],
    },
  },
  {
    name: "get_faqs",
    description: "The venue's own published FAQs (diner questions and the venue's answers).",
    inputSchema: {
      type: "object",
      properties: { slug: { type: "string" } },
      required: ["slug"],
    },
  },
  {
    name: "start_order",
    description:
      "Validate a basket against the venue's live menu and return a checkout link the DINER opens to review and pay. Nothing is ordered or charged by this call. Each line needs an itemId (and a variantId when the item has sizes, and option ids for required modifier groups). Returns the resolved lines, the subtotal, and the checkout URL to give the diner.",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string" },
        lines: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              itemId: { type: "string" },
              variantId: { type: "string" },
              optionIds: { type: "array", items: { type: "string" } },
              quantity: { type: "integer", minimum: 1 },
            },
            required: ["itemId"],
          },
        },
        table: { type: "string", description: "Optional dine-in table label from the QR code." },
      },
      required: ["slug", "lines"],
    },
  },
];

async function resolveVenue(args: Record<string, unknown>) {
  const slug = slugArg(args);
  if (!slug) return { venue: null, failure: failure("Provide a venue slug (see find_venue).") };
  const venue = await getPublicVenueBySlug(slug);
  if (!venue) return { venue: null, failure: failure(`No venue with slug "${slug}".`) };
  return { venue, failure: null };
}

export const agentCommerceTools: ToolRegistry = {
  list: () => DEFINITIONS,
  async call(name, args) {
    const baseUrl = await getBaseUrl();
    switch (name) {
      case "find_venue": {
        const query = typeof args.query === "string" ? args.query.trim() : "";
        if (query.length < 2 || query.length > 80) {
          return failure("Give a venue name or suburb of 2 to 80 characters.");
        }
        const pattern = `%${query.replace(/[%_]/g, "")}%`;
        // Public discovery across venues: the same fields the public storefront
        // shows. Only live venues are listed.
        const rows = await db
          .select({
            slug: venues.slug,
            name: venues.name,
            suburb: venues.suburb,
            state: venues.state,
          })
          .from(venues)
          .where(
            and(
              isNotNull(venues.onboardingCompletedAt),
              or(ilike(venues.name, pattern), ilike(venues.suburb, pattern)),
            ),
          )
          .limit(SEARCH_LIMIT);
        const results = rows.map((row) => ({
          ...row,
          storefrontUrl: `${baseUrl}/${row.slug}`,
        }));
        return text(
          results.length === 0
            ? `No venues match "${query}".`
            : results
                .map((r) => `${r.name} (${[r.suburb, r.state].filter(Boolean).join(", ")}) — slug: ${r.slug}`)
                .join("\n"),
          { venues: results },
        );
      }
      case "get_venue": {
        const { venue, failure: fail } = await resolveVenue(args);
        if (!venue) return fail!;
        const hours = summariseHours(venue.openingHours, venue.timezone, new Date());
        const address = [venue.streetAddress, venue.suburb, venue.state, venue.postcode]
          .filter(Boolean)
          .join(", ");
        const profile = {
          slug: venue.slug,
          name: venue.name,
          description: venue.storefrontDescription,
          address: address || null,
          phone: venue.phone,
          website: venue.websiteUrl,
          acceptsOnlineOrders: venue.acceptsOrders,
          scheduledPickup: venue.schedulingEnabled,
          bookings: venue.bookingsEnabled,
          hours,
          storefrontUrl: `${baseUrl}/${venue.slug}`,
          menuUrl: `${baseUrl}/${venue.slug}/menu`,
        };
        const todays =
          hours.today.ranges.length === 0
            ? "closed today"
            : hours.today.ranges.map((r) => `${r.opens}–${r.closes}`).join(", ");
        return text(
          `${venue.name}${address ? ` — ${address}` : ""}. ${hours.openNow ? "Open now" : "Closed now"} (${hours.today.day}: ${todays}, ${hours.timeZone}). ` +
            `${venue.acceptsOrders ? "Taking online orders" : "Not taking online orders right now"}. Menu: ${profile.menuUrl}`,
          profile,
        );
      }
      case "get_menu": {
        const { venue, failure: fail } = await resolveVenue(args);
        if (!venue) return fail!;
        const menu = await getPublicMenu(venue.id);
        const categories = menu.map((category) => ({
          name: category.name,
          description: category.description,
          items: category.items.map((item) => ({
            itemId: item.id,
            name: item.name,
            description: item.description,
            priceAud: item.variants.length > 0 ? null : formatCents(item.priceCents),
            priceCents: item.variants.length > 0 ? null : item.priceCents,
            dietaryTags: item.tags,
            variants: item.variants.map((v) => ({
              variantId: v.id,
              name: v.name,
              priceAud: formatCents(v.priceCents),
              priceCents: v.priceCents,
            })),
            modifierGroups: item.groups.map((g) => ({
              name: g.name,
              minSelect: g.minSelect,
              maxSelect: g.maxSelect,
              options: g.options.map((o) => ({
                optionId: o.id,
                name: o.name,
                priceDeltaCents: o.priceDeltaCents,
              })),
            })),
          })),
        }));
        const summary = categories
          .map(
            (c) =>
              `${c.name}: ` +
              c.items
                .map((i) =>
                  i.priceAud
                    ? `${i.name} $${i.priceAud} [${i.itemId}]`
                    : `${i.name} from $${formatCents(Math.min(...i.variants.map((v) => v.priceCents)))} [${i.itemId}]`,
                )
                .join("; "),
          )
          .join("\n");
        return text(summary || "The menu is empty right now.", { currency: "AUD", categories });
      }
      case "get_faqs": {
        const { venue, failure: fail } = await resolveVenue(args);
        if (!venue) return fail!;
        const faqs = await getPublicFaqs(venue.id);
        return text(
          faqs.length === 0
            ? "This venue has not published FAQs."
            : faqs.map((f) => `Q: ${f.question}\nA: ${f.answer}`).join("\n\n"),
          { faqs },
        );
      }
      case "start_order": {
        const { venue, failure: fail } = await resolveVenue(args);
        if (!venue) return fail!;
        if (!venue.acceptsOrders) {
          return failure(`${venue.name} is not taking online orders right now.`);
        }
        const menu = await getPublicMenu(venue.id);
        const lines = Array.isArray(args.lines) ? (args.lines as OrderRequestLine[]) : [];
        const validated = validateOrderRequest(menu, lines);
        if (!validated.ok) return failure(validated.error);
        const table =
          typeof args.table === "string" && /^[A-Za-z0-9 -]{1,20}$/.test(args.table.trim())
            ? args.table.trim()
            : null;
        const token = encodeCartHandoff(validated.lines);
        const checkoutUrl =
          `${baseUrl}/${venue.slug}/menu?cart=${token}` +
          (table ? `&table=${encodeURIComponent(table)}` : "");
        const resolved = validated.lines.map((line) => ({
          itemId: line.itemId,
          name: line.name,
          variant: line.variantName,
          options: line.optionNames,
          quantity: line.quantity,
          lineAud: formatCents(line.lineCents),
        }));
        return text(
          `Basket ready (subtotal $${formatCents(validated.subtotalCents)} AUD, before any discounts). ` +
            `Give the diner this link to review and pay: ${checkoutUrl}`,
          {
            checkoutUrl,
            subtotalCents: validated.subtotalCents,
            subtotalAud: formatCents(validated.subtotalCents),
            lines: resolved,
            note: "Nothing has been ordered or charged. The diner completes payment on the storefront.",
          },
        );
      }
      default:
        return null;
    }
  },
};
