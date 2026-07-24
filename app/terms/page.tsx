import type { Metadata } from "next";
import Link from "next/link";

import { MarketingPageShell } from "@/app/_marketing/page-shell";
import { SITE_NAME } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: `The terms that govern use of ${SITE_NAME}.`,
  alternates: { canonical: "/terms" },
};

const CONTACT_EMAIL = "hello@prompt2eat.com";

/**
 * Baseline terms of service grounded in the product's actual model (subscription
 * plans with a trial, owner-supplied content, Stripe-processed payments). Have
 * counsel review before relying on it in a regulated market.
 */
export default function TermsPage() {
  return (
    <MarketingPageShell
      title="Terms of Service"
      updated="24 July 2026"
      intro="These terms govern your use of Prompt2Eat. By creating an account or using the service, you agree to them."
    >
      <h2>The service</h2>
      <p>
        Prompt2Eat provides software for restaurants and cafés to run online and
        in-venue ordering, take payments, and manage their operations, including
        a hosted storefront and AI-assisted features.
      </p>

      <h2>Accounts</h2>
      <p>
        You must provide accurate information, keep your sign-in secure, and be
        authorised to act for the venue you manage. You are responsible for
        activity under your account.
      </p>

      <h2>Acceptable use</h2>
      <ul>
        <li>Do not use the service unlawfully or to sell prohibited items.</li>
        <li>Do not misrepresent your business, menu, or prices.</li>
        <li>Do not attempt to disrupt, reverse engineer, or abuse the service or its rate limits.</li>
      </ul>

      <h2>Plans, trials, and billing</h2>
      <p>
        Paid plans are billed in advance on a recurring basis through our payment
        provider. Free trials convert to a paid plan unless cancelled before the
        trial ends. Fees are non-refundable except where required by law. We may
        change plan pricing on reasonable notice.
      </p>

      <h2>Your content</h2>
      <p>
        You keep ownership of the menu, brand, imagery, and other content you add.
        You grant us the licence needed to host and display it to run your
        storefront. You are responsible for the accuracy of your content,
        including prices, allergen information, and any claims you publish.
      </p>

      <h2>Payments to venues</h2>
      <p>
        Payments from diners are processed by our payment provider and settled to
        the venue&apos;s connected account, less applicable fees. The venue is the
        merchant of record for its orders and is responsible for fulfilment, tax,
        and customer service.
      </p>

      <h2>AI features</h2>
      <p>
        Some features use AI to assist with ordering and to suggest copy. AI
        output can be imperfect; you are responsible for reviewing anything you
        publish or rely on. AI suggestions in the dashboard are drafts and are
        never published without your action.
      </p>

      <h2>Availability and disclaimers</h2>
      <p>
        We work to keep the service reliable but provide it &ldquo;as is&rdquo;
        without warranties of uninterrupted or error-free operation, to the extent
        permitted by law. Nothing in these terms limits rights you have under
        applicable consumer law.
      </p>

      <h2>Liability</h2>
      <p>
        To the extent permitted by law, our aggregate liability arising from the
        service is limited to the fees you paid us in the twelve months before the
        claim.
      </p>

      <h2>Termination</h2>
      <p>
        You may stop using the service at any time. We may suspend or end access
        for breach of these terms. On termination you can request an export of
        your data as described in our <Link href="/privacy">Privacy Policy</Link>.
      </p>

      <h2>Governing law</h2>
      <p>
        These terms are governed by the laws of Australia. Questions? Email{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </MarketingPageShell>
  );
}
