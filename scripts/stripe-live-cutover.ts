/**
 * Stripe TEST -> LIVE cutover: clear the mode-scoped Stripe identifiers stored on
 * every venue, so each one re-onboards against the live platform account.
 *
 * WHY THIS IS NEEDED. Stripe object ids are scoped to the mode that created them:
 * an `acct_`/`cus_`/`sub_` minted in test mode does not exist under a live key.
 * The rows themselves are fine — only the ids are stale — but leaving them in
 * place fails in the worst possible shape:
 *
 *   - `placeOrder` gates on `venues.stripe_charges_enabled`, a MIRRORED boolean
 *     that is never re-checked against Stripe. It passes, the order and its
 *     line items commit, and only THEN does paymentIntents.create reject the
 *     dead account — leaving an orphan `pending_payment` row (hidden from the
 *     kitchen board) and a generic "We couldn't start payment." for the diner.
 *   - The mirror cannot self-correct: `syncStripeAccountStatus` throws on a
 *     stale account and the payments page falls back to the stored
 *     `chargesEnabled: true`. There is no `account.updated` handler.
 *   - Re-onboarding IS supported (connectStripe short-circuits only the
 *     account-CREATION branch, then builds an Account Link either way), but with
 *     a stale test id `accountLinks.create` throws under a live key and the bare
 *     catch redirects to `?error=connect` — so the owner just sees a generic
 *     failure with no way forward.
 *
 * Clearing the ids puts every venue back on the first-run path, which works.
 *
 * DRY RUN BY DEFAULT. Prints what it would change and exits without writing.
 * Pass --apply to actually clear them.
 *
 *   DATABASE_URL="postgres://…" npx tsx scripts/stripe-live-cutover.ts
 *   DATABASE_URL="postgres://…" npx tsx scripts/stripe-live-cutover.ts --apply
 *
 * Use the DIRECT (non-pooled) Neon URL, same as migrations.
 *
 * WHAT IT DOES NOT TOUCH: orders, payments history, menus, or the `plan` /
 * `plan_status` columns. Subscription state re-syncs from the live billing
 * webhook once a venue subscribes again; blanking the tier here would revoke
 * entitlements before the owner has any way to restore them.
 *
 * Relative imports (not the "@/" alias) so it runs under a plain `tsx`.
 */
import { isNotNull, or, eq } from "drizzle-orm";

import { db } from "../lib/db";
import { venues } from "../lib/db/schema";

const APPLY = process.argv.includes("--apply");

async function main() {
  const rows = await db
    .select({
      id: venues.id,
      name: venues.name,
      slug: venues.slug,
      stripeAccountId: venues.stripeAccountId,
      stripeCustomerId: venues.stripeCustomerId,
      stripeSubscriptionId: venues.stripeSubscriptionId,
      stripeChargesEnabled: venues.stripeChargesEnabled,
    })
    .from(venues)
    .where(
      or(
        isNotNull(venues.stripeAccountId),
        isNotNull(venues.stripeCustomerId),
        isNotNull(venues.stripeSubscriptionId),
        eq(venues.stripeChargesEnabled, true),
      ),
    );

  if (rows.length === 0) {
    console.log(
      "OK: no venue holds a Stripe identifier. Nothing to clear — every venue will onboard fresh.",
    );
    return;
  }

  console.log(
    `${rows.length} venue(s) hold Stripe identifiers${APPLY ? "" : " (dry run — nothing written)"}:`,
  );
  for (const row of rows) {
    const held = [
      row.stripeAccountId ? `account=${row.stripeAccountId}` : null,
      row.stripeCustomerId ? `customer=${row.stripeCustomerId}` : null,
      row.stripeSubscriptionId ? `subscription=${row.stripeSubscriptionId}` : null,
      row.stripeChargesEnabled ? "charges_enabled=true" : null,
    ].filter(Boolean);
    console.log(`  - ${row.name} (/${row.slug}): ${held.join("  ")}`);
  }

  if (!APPLY) {
    console.log(
      "\nRe-run with --apply to clear these. Each owner then reconnects Stripe from\n" +
        "Dashboard -> Payments, which runs live Connect Express onboarding (real KYC).",
    );
    return;
  }

  const cleared = await db
    .update(venues)
    .set({
      stripeAccountId: null,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      stripeChargesEnabled: false,
    })
    .where(
      or(
        isNotNull(venues.stripeAccountId),
        isNotNull(venues.stripeCustomerId),
        isNotNull(venues.stripeSubscriptionId),
        eq(venues.stripeChargesEnabled, true),
      ),
    )
    .returning({ id: venues.id });

  console.log(
    `\nCleared Stripe identifiers on ${cleared.length} venue(s). Every venue must now\n` +
      "reconnect Stripe before it can take an order — until then placeOrder is\n" +
      "correctly blocked by stripe_charges_enabled = false, which is the safe state.",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    process.exit(process.exitCode ?? 0);
  });
