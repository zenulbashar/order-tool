import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BrandMark, Wordmark } from "@/app/_components/wordmark";
import { getSegment, SEGMENTS } from "@/lib/marketing-segments";
import { serializeJsonLd, SITE_NAME, SITE_URL } from "@/lib/seo";

const CONTAINER = "mx-auto w-full max-w-[1080px] px-[clamp(18px,4vw,48px)]";

type SegmentParams = { params: Promise<{ segment: string }> };

/** Audience pages are typed data — every page prerenders statically, no DB. */
export function generateStaticParams() {
  return SEGMENTS.map((segment) => ({ segment: segment.slug }));
}

export async function generateMetadata({
  params,
}: SegmentParams): Promise<Metadata> {
  const { segment: slug } = await params;
  const segment = getSegment(slug);
  if (!segment) return { title: "Page not found" };
  return {
    title: segment.metaTitle,
    description: segment.metaDescription,
    alternates: { canonical: `/for/${segment.slug}` },
    openGraph: {
      type: "website",
      title: `${segment.metaTitle} · ${SITE_NAME}`,
      description: segment.metaDescription,
      url: `/for/${segment.slug}`,
    },
  };
}

/**
 * One audience "service page" (/for/<segment>): hero, the audience's real pain
 * points, product features framed for them, an FAQ, and a sign-up CTA. The FAQ
 * is also emitted as FAQPage JSON-LD from the SAME data (so the markup can never
 * drift from what's on the page). Metadata, canonical, and the sitemap entry are
 * handled here + in app/sitemap.ts.
 */
export default async function SegmentPage({ params }: SegmentParams) {
  const { segment: slug } = await params;
  const segment = getSegment(slug);
  if (!segment) notFound();

  const faqJsonLd = serializeJsonLd({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": `${SITE_URL}/for/${segment.slug}#faq`,
    mainEntity: segment.faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  });

  return (
    <div className="min-h-dvh bg-[#FFFDF8] text-[#16241C]">
      <script
        type="application/ld+json"
        // Safe: serializeJsonLd escapes "<" so no value can break out of the tag.
        dangerouslySetInnerHTML={{ __html: faqJsonLd }}
      />

      {/* Slim nav */}
      <header className="sticky top-0 z-50 border-b border-[rgba(247,243,234,0.08)] bg-[rgba(15,36,27,0.92)] backdrop-blur-[14px]">
        <nav className={`${CONTAINER} flex items-center gap-4 py-3`}>
          <Link href="/" className="flex items-center gap-2">
            <BrandMark className="h-[30px] w-[30px] shrink-0 rounded-lg" />
            <Wordmark className="text-[21px] text-[#F7F3EA]" />
          </Link>
          <Link
            href="/signin"
            className="ml-auto rounded-[11px] bg-[var(--color-accent)] px-4 py-1.5 text-[13.5px] font-bold text-[#16241C] transition hover:-translate-y-0.5"
          >
            Start free
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="bg-[radial-gradient(110%_90%_at_80%_-10%,#1D4636,#143228_40%,#0F281E_72%)] text-[#F7F3EA]">
        <div className={`${CONTAINER} py-[clamp(56px,8vw,104px)]`}>
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-accent)]">
            {segment.eyebrow}
          </span>
          <h1 className="mt-3 max-w-[18ch] font-display text-[clamp(30px,5vw,56px)] font-extrabold leading-[1.04] tracking-[-0.03em]">
            {segment.heading}
          </h1>
          <p className="mt-5 max-w-[52ch] text-[clamp(16px,1.8vw,20px)] leading-[1.55] text-[#C9D4CB]">
            {segment.intro}
          </p>
          <Link
            href="/signin"
            className="mt-8 inline-block rounded-xl bg-[var(--color-accent)] px-6 py-3 font-bold text-[#16241C] transition hover:-translate-y-0.5"
          >
            Start free for 30 days →
          </Link>
        </div>
      </section>

      <main className={`${CONTAINER} py-[clamp(48px,7vw,88px)]`}>
        {/* Pain points */}
        <section>
          <h2 className="font-display text-[clamp(24px,3.2vw,36px)] font-extrabold tracking-[-0.02em]">
            Sound familiar?
          </h2>
          <div className="mt-8 grid gap-5 sm:grid-cols-3">
            {segment.painPoints.map((point) => (
              <div
                key={point.title}
                className="rounded-[18px] border border-[#EDE4D2] bg-[#FFFDF8] p-6"
              >
                <p className="font-display text-lg font-extrabold">{point.title}</p>
                <p className="mt-2 text-[15px] leading-[1.6] text-[#5C6B5E]">
                  {point.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="mt-16">
          <h2 className="font-display text-[clamp(24px,3.2vw,36px)] font-extrabold tracking-[-0.02em]">
            How Prompt2Eat helps
          </h2>
          <div className="mt-8 grid gap-5 sm:grid-cols-2">
            {segment.features.map((feature) => (
              <div
                key={feature.title}
                className="rounded-[18px] border border-[#EDE4D2] bg-white p-6"
              >
                <p className="font-display text-lg font-extrabold">
                  {feature.title}
                </p>
                <p className="mt-2 text-[15px] leading-[1.6] text-[#3C4A3E]">
                  {feature.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="mt-16">
          <h2 className="font-display text-[clamp(24px,3.2vw,36px)] font-extrabold tracking-[-0.02em]">
            Questions
          </h2>
          <div className="mt-6 divide-y divide-[#EDE4D2] border-y border-[#EDE4D2]">
            {segment.faqs.map((faq) => (
              <details key={faq.question} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display text-lg font-bold [&::-webkit-details-marker]:hidden">
                  {faq.question}
                  <span
                    aria-hidden="true"
                    className="shrink-0 text-[#B08A30] transition group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-3 text-[15px] leading-[1.7] text-[#3C4A3E]">
                  {faq.answer}
                </p>
              </details>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="mt-16 rounded-[22px] bg-[radial-gradient(120%_140%_at_85%_0%,#F6C258,#F4B43C_45%,#E79A24)] p-8">
          <p className="font-display text-[clamp(22px,3vw,30px)] font-extrabold tracking-[-0.02em] text-[#16241C]">
            Live in an afternoon.
          </p>
          <p className="mt-2 max-w-[48ch] text-[15px] font-medium text-[#3A2A08]">
            Import your menu from a photo, set your brand, connect payments, and
            open your storefront. Free for 30 days, no card to start.
          </p>
          <Link
            href="/signin"
            className="mt-5 inline-block rounded-xl bg-[#16241C] px-6 py-3 font-bold text-[#F7F3EA] transition hover:-translate-y-0.5"
          >
            Start free →
          </Link>
        </section>

        {/* Cross-links to the other audiences (internal linking). */}
        <nav aria-label="Other venue types" className="mt-14">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#B08A30]">
            Prompt2Eat for
          </p>
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[15px]">
            {SEGMENTS.filter((other) => other.slug !== segment.slug).map(
              (other) => (
                <li key={other.slug}>
                  <Link
                    href={`/for/${other.slug}`}
                    className="font-bold text-[#16241C] underline decoration-[var(--color-accent)] decoration-2 underline-offset-4 hover:opacity-80"
                  >
                    {other.eyebrow.replace(/^For /, "")}
                  </Link>
                </li>
              ),
            )}
          </ul>
        </nav>
      </main>

      <footer className="border-t border-[#EDE4D2] py-8">
        <div className={`${CONTAINER} flex flex-wrap items-center justify-between gap-3 text-sm text-[#7C8579]`}>
          <span>© 2026 Prompt2Eat. All rights reserved.</span>
          <Link href="/" className="font-semibold text-[#16241C] hover:underline">
            prompt2eat.com
          </Link>
        </div>
      </footer>
    </div>
  );
}
