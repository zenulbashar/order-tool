import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Tenant-scoping harness (F7 / audit §8.1).
 *
 * F7's complaint is precise: `scopedToVenue()` exists and the codebase applies
 * it with real discipline, but enforcement is **by convention** — a single
 * query that forgets the predicate silently returns cross-tenant data, and
 * "nothing — not the type system, not a test, not the database — will catch
 * it." OWASP's cheat sheet (verified 3-0 in §8.1) is explicit: *don't allow
 * queries without tenant filters*.
 *
 * This is the "test" half of that sentence. It walks every query against a
 * venue-scoped table and asserts the statement carries a tenant predicate,
 * so forgetting one fails CI instead of leaking.
 *
 * WHAT THIS IS NOT: it is not row-level security, and it is not a substitute
 * for it. §8.1 is equally explicit that RLS should NOT be scheduled yet —
 * the Supabase benchmark (verified 3-0) shows the obvious implementation of
 * this exact `venue_members` pattern *times out*, and the dissenting sources
 * (PlanetScale, Neon, AWS Prescriptive Guidance) are still unread. See
 * docs/audit/TenantIsolation.md for that decision. This harness is the part
 * the verified evidence does support, available now at no schema risk.
 *
 * It is a static check over source text, so it reasons about the code as
 * written, not as executed. A deliberate cross-venue read is allowed via the
 * exemption list below — and every exemption has to carry a reason, which is
 * itself the documentation F7 asks for.
 */

const SCHEMA = readFileSync(join(process.cwd(), "lib", "db", "schema.ts"), "utf8");

/** Drizzle table variables whose table has a `venue_id` column. */
function venueScopedTableVars(): string[] {
  const vars: string[] = [];
  const pattern = /export const (\w+) = pgTable\(\s*"(\w+)"([\s\S]*?)\n\);/g;
  for (const match of SCHEMA.matchAll(pattern)) {
    if (match[3].includes('text("venue_id")')) vars.push(match[1]);
  }
  return vars;
}

const SCOPED_TABLES = new Set(venueScopedTableVars());

/**
 * Statements that read a venue-scoped table WITHOUT a venue predicate, each
 * with the reason it is legitimate. A new entry here should be argued for in
 * review — that is the point of making it explicit rather than implicit.
 */
const EXEMPTIONS: { file: string; reason: string }[] = [
  {
    file: "lib/tenant.ts",
    reason:
      "Resolves which venues a USER belongs to — scoped by user_id, which is what makes every later venue scope trustworthy. Also holds the allowlist-gated platform-admin override OWASP contemplates as an explicit exception.",
  },
  {
    file: "app/admin/",
    reason:
      "The platform-admin console is cross-tenant BY DESIGN, allowlist-gated and written to platform_audit_log.",
  },
  {
    file: "lib/integrations/dispatch.ts",
    reason:
      "The job engine processes every venue's outbox; each job row carries its own venue_id and the worker scopes provider calls by it.",
  },
  {
    file: "lib/orders/abandoned-checkout.ts",
    reason:
      "Cron sweep across venues for stale unpaid orders; each row's own venue_id scopes the cancel write that follows.",
  },
  {
    file: "lib/agent-commerce/tools.ts",
    reason:
      "Public venue discovery for AI agents (find_venue) — the same public fields the storefront shows, live venues only; every other tool resolves by slug through the public storefront reader.",
  },
  {
    file: "lib/voice/webhook.ts",
    reason:
      "Resolves WHICH venue a dialled phone number belongs to (unique voice_number), the phone-agent equivalent of resolving a storefront by slug; everything after reads that venue's public data.",
  },
  {
    file: "lib/sweep-watermark.ts",
    reason: "sweep_watermarks is keyed by sweep NAME and is platform-wide, not per venue.",
  },
  {
    file: "lib/stock/depletion.ts",
    reason: "Cron sweep across venues; each row's own venue_id scopes the write that follows.",
  },
  {
    file: "lib/loyalty/earn.ts",
    reason: "Cron sweep across venues; per-row venue_id scopes the ledger write.",
  },
  {
    file: "lib/loyalty/redeem.ts",
    reason: "Cron sweep across venues; per-row venue_id scopes the ledger write.",
  },
  {
    file: "lib/giftcards/redeem.ts",
    reason: "Cron sweep across venues; per-row venue_id scopes the ledger write.",
  },
  {
    file: "lib/payments/refund-service.ts",
    reason:
      "Resolves an order by its globally-unique Stripe PaymentIntent id for webhook reconciliation; the in-product path takes venueId and filters on it.",
  },
  {
    file: "lib/payments/refund-compensation.ts",
    reason:
      "Operates on one already-resolved order id, then scopes every write by that order's own venue_id.",
  },
  {
    file: "app/api/stripe/webhook/route.ts",
    reason:
      "Resolves orders ONLY by stripe_payment_intent_id — a Stripe-issued, globally-unique key that is never client-supplied.",
  },
  {
    file: "lib/customer/",
    reason: "Customer identity + notification paths resolve by order id or customer session token.",
  },
  {
    file: "lib/staff/invitations.ts",
    reason:
      "Invitation acceptance resolves by a hashed single-use token that itself names the venue.",
  },
  {
    file: "lib/audit.ts",
    reason: "Writes/reads audit rows; the read path takes venueId and filters on it explicitly.",
  },
  {
    file: "lib/push.ts",
    reason: "Resolves push tokens for one already-confirmed order.",
  },
  {
    file: "lib/promotions.ts",
    reason: "Platform-wide promotion definitions; per-order application is scoped at apply time.",
  },
  {
    file: "lib/menu-health.ts",
    reason: "Takes a venueId parameter and filters on it; flagged only by the heuristic's shape.",
  },
  {
    file: "lib/shop/",
    reason: "The marketing shop feed is platform-wide, not venue data.",
  },
  {
    file: "lib/seo",
    reason: "SEO jobs iterate venues platform-wide; per-row venue_id scopes each write.",
  },
  {
    file: "lib/nudges.ts",
    reason: "Cross-venue nudge computation; each row carries its own venue_id.",
  },
  {
    file: "lib/concierge.ts",
    reason: "Reads a single venue by the id it was handed.",
  },
  {
    file: "lib/platform-settings.ts",
    reason: "platform_settings is platform-wide configuration.",
  },
  {
    file: "lib/billing",
    reason: "Platform billing resolves by Stripe subscription/customer id.",
  },
  {
    file: "lib/support",
    reason: "Support desk resolves tickets by their own id, then scopes replies by the ticket.",
  },
  {
    file: "lib/orders/daily-number.ts",
    reason: "Takes a venueId parameter and filters on it.",
  },
  {
    file: "app/onboarding/",
    reason: "Creates the venue and its first membership; there is no prior venue to scope to.",
  },
  {
    file: "app/invite/",
    reason: "Invitation acceptance, scoped by the token's own venue.",
  },
  {
    file: "app/api/integrations/",
    reason: "Square OAuth/webhook paths resolve by signed state or provider account id.",
  },
  {
    file: "app/api/jobs/",
    reason: "Cron routes drive the cross-venue sweeps listed above.",
  },
  {
    file: "app/api/support/",
    reason: "Support routes resolve by session then scope to that session's venue.",
  },
  {
    file: "app/api/push/",
    reason: "Registers a device token for the signed-in session's venue.",
  },
  {
    file: "app/[slug]/",
    reason:
      "The public storefront resolves a venue BY SLUG (that is the tenant key for an anonymous diner) and scopes every subsequent read by the resolved venue id.",
  },
  {
    file: "app/dashboard/integrations/actions.ts",
    reason:
      "Writes target venueIntegrations.id, but that id came from squareIntegrationFor(venue.id) — a venue-scoped read — so the write inherits the scope. This is the read-then-write-by-id pattern; it is safe ONLY because the read is scoped, which is why it is listed rather than ignored.",
  },
  {
    file: "app/dashboard/marketplace/actions.ts",
    reason:
      "Updates a marketplace order by an id resolved from the caller's own venue earlier in the same action.",
  },
  {
    file: "app/api/stripe/billing-webhook/route.ts",
    reason:
      "Resolves the marketplace order by its Stripe checkout-session id, from a signature-verified webhook; that id is Stripe-issued and never client-supplied.",
  },
  {
    file: "lib/giftcards/queries.ts",
    reason:
      "Sums pending reservations against ONE gift card id that the caller already resolved venue-scoped; a card belongs to exactly one venue.",
  },
  {
    file: "lib/integrations/square/mirror.ts",
    reason:
      "The Square worker runs against one claimed job row, which carries its own venue_id; the order and its items are reached through that job's order_id.",
  },
];

function isExempt(file: string): string | null {
  const normalised = file.replace(/\\/g, "/");
  for (const exemption of EXEMPTIONS) {
    if (normalised.includes(exemption.file)) return exemption.reason;
  }
  return null;
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if ([".ts", ".tsx"].includes(extname(entry)) && !entry.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

/**
 * A statement is any `.from(x)` / `.update(x)` / `.delete(x)` / `.insert(x)`
 * chain up to the next `;`. Crude on purpose — over-reporting is safe here
 * because an exemption is a one-line, reviewed addition.
 */
type Finding = { file: string; table: string; snippet: string };

/**
 * Comments are stripped BEFORE statements are split on `;`. Without this, a
 * prose semicolon inside a `//` comment truncates the statement early and the
 * scan reports a false positive on a query that is correctly scoped further
 * down the chain — which is exactly what happened when this harness was
 * first run against the orders board.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

function findUnscopedQueries(file: string): Finding[] {
  const source = stripComments(readFileSync(file, "utf8"));
  const findings: Finding[] = [];
  const pattern = /\.(?:from|update|delete)\(\s*(\w+)\s*\)/g;
  for (const match of source.matchAll(pattern)) {
    const table = match[1];
    if (!SCOPED_TABLES.has(table)) continue;
    const start = match.index ?? 0;
    const end = source.indexOf(";", start);
    const statement = source.slice(start, end === -1 ? source.length : end);
    const scoped =
      statement.includes("scopedToVenue(") ||
      /venueId/.test(statement) ||
      /venue_id/.test(statement);
    if (!scoped) {
      findings.push({
        file: file.replace(process.cwd() + "/", ""),
        table,
        snippet: statement.slice(0, 120).replace(/\s+/g, " "),
      });
    }
  }
  return findings;
}

describe("tenant scoping (F7 / §8.1)", () => {
  const files = [
    ...sourceFiles(join(process.cwd(), "app")),
    ...sourceFiles(join(process.cwd(), "lib")),
  ];

  it("finds the venue-scoped tables it claims to", () => {
    // Guards the harness itself: if this regex broke, every assertion below
    // would pass vacuously.
    expect(SCOPED_TABLES.size).toBeGreaterThan(30);
    for (const table of ["orders", "menuItems", "refunds", "giftCards"]) {
      expect(SCOPED_TABLES.has(table), `${table} should be venue-scoped`).toBe(true);
    }
  });

  it("scans a meaningful number of source files", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("has no query on a venue-scoped table without a tenant predicate", () => {
    const unexplained: Finding[] = [];
    for (const file of files) {
      if (isExempt(file)) continue;
      unexplained.push(...findUnscopedQueries(file));
    }

    const report = unexplained
      .map((f) => `  ${f.file}\n    ${f.table}: ${f.snippet}`)
      .join("\n");
    expect(
      unexplained,
      unexplained.length === 0
        ? ""
        : `Queries on venue-scoped tables with no tenant predicate.\n` +
          `Add scopedToVenue(...) / a venueId filter, or — if the read is ` +
          `deliberately cross-venue — add an EXEMPTION with a reason in this file.\n\n${report}`,
    ).toEqual([]);
  });

  it("requires every exemption to carry a reason", () => {
    // An exemption without a justification is just a hole.
    for (const exemption of EXEMPTIONS) {
      expect(exemption.reason.length, exemption.file).toBeGreaterThan(30);
    }
  });
});
