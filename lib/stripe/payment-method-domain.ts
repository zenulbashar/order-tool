import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { venues } from "@/lib/db/schema";
import { reportError } from "@/lib/observability";
import { getStripe } from "@/lib/stripe";
import { getBaseUrl } from "@/lib/url";

/**
 * Register the storefront domain as an Apple Pay `payment_method_domain` on a
 * venue's CONNECTED account.
 *
 * Apple Pay on the web only renders once the domain is registered with Stripe,
 * and because every diner charge is a DIRECT charge on the venue's connected
 * account, registering it on the platform is not enough — it has to be done once
 * per account. That was a manual step in the README ("not built this phase"),
 * which is a step that will be forgotten at scale, on the highest-conversion
 * payment method there is.
 *
 * THREE PROPERTIES THIS MUST HOLD, because it runs off the back of a page load:
 *
 *  1. It never throws. Every failure is swallowed and reported. Apple Pay simply
 *     not appearing is a soft degradation — Google Pay, Link and the card form
 *     are untouched — whereas a throw here would break the payments page for an
 *     owner who has done nothing wrong.
 *  2. It costs nothing in the steady state. The domain it last registered is
 *     stored on the venue, so the common case is a string comparison and zero
 *     Stripe calls.
 *  3. It is idempotent. Stripe rejects creating a domain that already exists on
 *     an account, so an account registered out of band (by hand, per the old
 *     README instructions) is detected by listing first and then just recorded,
 *     not re-created.
 *
 * Storing the DOMAIN rather than a boolean is what makes a later domain change
 * work: a venue moving to a custom domain (a Scale feature) re-registers, rather
 * than being wrongly treated as already done.
 */
export async function ensurePaymentMethodDomain(
  venueId: string,
  accountId: string,
  registeredDomain: string | null,
): Promise<void> {
  try {
    const domain = new URL(await getBaseUrl()).hostname;
    // Steady state: already registered for this exact domain. No API call.
    if (registeredDomain === domain) return;

    const stripe = getStripe();

    // List first. The account may already carry the domain — registered by hand
    // per the previous README instructions, or by an earlier run whose DB write
    // failed after a successful create. Creating again would error.
    const existing = await stripe.paymentMethodDomains.list(
      { domain_name: domain, limit: 1 },
      { stripeAccount: accountId },
    );

    if (existing.data.length === 0) {
      await stripe.paymentMethodDomains.create(
        { domain_name: domain },
        { stripeAccount: accountId },
      );
    }

    // Recorded only after Stripe confirms, so a failure retries next time rather
    // than marking the venue done incorrectly.
    await db
      .update(venues)
      .set({ stripePaymentMethodDomain: domain })
      .where(eq(venues.id, venueId));
  } catch (error) {
    // Deliberately swallowed — see property 1. Reported so a systemic failure
    // (wrong domain, missing Connect capability) is still discoverable rather
    // than silently costing every venue its Apple Pay button.
    await reportError(error, {
      context: "stripe.payment-method-domain",
      tags: { venue_id: venueId },
    });
  }
}
