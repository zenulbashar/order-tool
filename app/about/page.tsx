import type { Metadata } from "next";
import Link from "next/link";

import { MarketingPageShell } from "@/app/_marketing/page-shell";
import { SITE_NAME } from "@/lib/seo";

export const metadata: Metadata = {
  title: "About",
  description: `What ${SITE_NAME} is: the AI-native ordering platform for restaurants and cafés.`,
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <MarketingPageShell
      title={`About ${SITE_NAME}`}
      intro="Prompt2Eat is the AI-native ordering platform for restaurants and cafés."
    >
      <p>
        Ordering out should be as simple as saying what you feel like. That is
        the whole idea behind Prompt2Eat. A diner scans a QR code at the table
        or opens a venue&apos;s storefront, describes what they are after, and
        the AI concierge finds the dish, sorts the sides, and sends the order
        straight to the kitchen.
      </p>

      <h2>For hospitality owners</h2>
      <p>
        Getting online usually means POS migrations, hardware, and weeks of
        setup. Prompt2Eat replaces that with an afternoon: import your whole
        menu from a photo, set your brand and hours, and go live on your own
        storefront. From there you run orders, take payments, manage stock, and
        handle staff in one place.
      </p>
      <ul>
        <li>A branded online storefront and QR dine-in ordering.</li>
        <li>An AI concierge that helps diners choose and order.</li>
        <li>
          Payments by card, Apple Pay, Google Pay, and PayTo pay-by-bank,
          settled to your own account.
        </li>
        <li>Menu import from a photo, stock and recipe costing, and a kitchen board.</li>
      </ul>

      <h2>Built for Australian hospitality</h2>
      <p>
        Prompt2Eat is built for the way local venues actually operate, with
        GST-inclusive pricing, PayTo pay-by-bank, and search and structured
        data so a venue&apos;s storefront can be found on Google and answered by
        AI assistants.
      </p>

      <h2>Get in touch</h2>
      <p>
        Questions or want a hand getting set up? Visit our{" "}
        <Link href="/contact">contact page</Link>, or read the{" "}
        <Link href="/learn">guides</Link> to see how it all fits together.
      </p>
    </MarketingPageShell>
  );
}
