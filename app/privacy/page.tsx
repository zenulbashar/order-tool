import type { Metadata } from "next";
import Link from "next/link";

import { MarketingPageShell } from "@/app/_marketing/page-shell";
import { SITE_NAME } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `How ${SITE_NAME} collects, uses, and protects personal information.`,
  alternates: { canonical: "/privacy" },
};

const CONTACT_EMAIL = "privacy@prompt2eat.com";

/**
 * Baseline privacy policy grounded in what the application actually does (see
 * lib/auth.ts, lib/stripe.ts, lib/sms.ts, lib/r2.ts, app/_components/analytics.tsx).
 * It describes real data flows rather than boilerplate. Have counsel review
 * before relying on it in a regulated market.
 */
export default function PrivacyPage() {
  return (
    <MarketingPageShell
      title="Privacy Policy"
      updated="24 July 2026"
      intro="This policy explains what information Prompt2Eat collects, why, and the choices you have. It covers our marketing site, owner dashboard, and the diner storefronts we host."
    >
      <h2>Who we are</h2>
      <p>
        Prompt2Eat provides ordering software to restaurants and cafés
        (&ldquo;venues&rdquo;). We are the data controller for account and
        marketing data. For orders placed on a venue&apos;s storefront, the
        venue is the controller of its customers&apos; data and we process it on
        the venue&apos;s behalf.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account details.</strong> Your email address, used for
          passwordless magic-link sign-in, and any name you provide.
        </li>
        <li>
          <strong>Venue and menu content.</strong> The business details, menu,
          hours, imagery, and settings owners enter to run their storefront.
        </li>
        <li>
          <strong>Order details.</strong> When a diner orders, the items,
          totals, and any contact details they give for order updates.
        </li>
        <li>
          <strong>Payment data.</strong> Card and bank payments are processed by
          our payment provider. We receive confirmation and limited details (such
          as the last four digits and status); we never store full card numbers.
        </li>
        <li>
          <strong>Technical data.</strong> Basic device and log information, and,
          where analytics is enabled, aggregated usage statistics.
        </li>
      </ul>

      <h2>Cookies</h2>
      <p>
        We use a small number of strictly necessary cookies to keep you signed
        in and remember which venue you are managing. These are essential to the
        service. Where web analytics is enabled we may use analytics cookies to
        understand aggregate usage; we do not use cookies for third-party
        advertising.
      </p>

      <h2>How we use information</h2>
      <ul>
        <li>To provide and secure the service and process orders and payments.</li>
        <li>To send transactional messages such as sign-in links and order updates by email, SMS, or WhatsApp.</li>
        <li>To power features you use, including AI-assisted ordering, menu import, and copy suggestions.</li>
        <li>To improve reliability and understand aggregate usage.</li>
      </ul>

      <h2>Service providers</h2>
      <p>
        We share data only with providers that help us run the service, under
        contract and only as needed: payment processing (Stripe), email delivery,
        SMS and messaging, cloud database and file storage, rate-limiting, AI
        model providers for the assistant features, and — where enabled — search
        and analytics tooling. We do not sell personal information.
      </p>

      <h2>Retention</h2>
      <p>
        We keep personal data for as long as your account is active or as needed
        to provide the service, then delete or anonymise it, unless a longer
        period is required by law (for example, financial records).
      </p>

      <h2>Your rights</h2>
      <p>
        Subject to local law, you may request access to, correction of, or
        deletion of your personal information, and object to certain processing.
        Diners should contact the venue they ordered from; for account or
        marketing data, contact us and we will help.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy or your data? Email{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> or use our{" "}
        <Link href="/contact">contact page</Link>.
      </p>
    </MarketingPageShell>
  );
}
