import type { Metadata } from "next";
import Link from "next/link";

import { MarketingPageShell } from "@/app/_marketing/page-shell";
import { SITE_NAME } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Contact",
  description: `Get in touch with the ${SITE_NAME} team.`,
  alternates: { canonical: "/contact" },
};

/** Support address on the product's own domain (no fabricated phone/address). */
const CONTACT_EMAIL = "hello@prompt2eat.com";

export default function ContactPage() {
  return (
    <MarketingPageShell
      title="Contact us"
      intro="We would love to hear from you, whether you run a venue, want a demo, or just have a question."
    >
      <h2>Email</h2>
      <p>
        The fastest way to reach us is email. We read every message and aim to
        reply within one business day.
      </p>
      <p>
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      </p>

      <h2>Already a customer?</h2>
      <p>
        If you run a venue on Prompt2Eat, the quickest route is the support chat
        inside your <Link href="/dashboard">owner dashboard</Link>, where we can
        see your account and help right away.
      </p>

      <h2>New to Prompt2Eat?</h2>
      <p>
        You can <Link href="/signin">start a free trial</Link> in a few minutes,
        or read the <Link href="/learn">guides</Link> first to see how ordering,
        payments, and the AI concierge work.
      </p>
    </MarketingPageShell>
  );
}
