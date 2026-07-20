import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BrandMark, Wordmark } from "@/app/_components/wordmark";
import { ARTICLES, getArticle } from "@/lib/marketing-content";
import { serializeJsonLd, SITE_NAME, SITE_URL } from "@/lib/seo";

const CONTAINER = "mx-auto w-full max-w-[760px] px-[clamp(18px,4vw,48px)]";

type ArticleParams = { params: Promise<{ slug: string }> };

/** Articles are typed data — every page prerenders statically, no DB. */
export function generateStaticParams() {
  return ARTICLES.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({
  params,
}: ArticleParams): Promise<Metadata> {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) return { title: "Guide not found" };
  return {
    title: article.title,
    description: article.description,
    alternates: { canonical: `/learn/${article.slug}` },
    openGraph: {
      type: "article",
      title: article.title,
      description: article.description,
      url: `/learn/${article.slug}`,
    },
  };
}

/**
 * One /learn guide: prose from lib/marketing-content.ts plus Article JSON-LD
 * built from the SAME data (publisher = the Organization node the landing
 * declares). Ends with cross-links to the other guides and the start-free CTA.
 */
export default async function ArticlePage({ params }: ArticleParams) {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) notFound();

  const others = ARTICLES.filter((a) => a.slug !== article.slug).slice(0, 3);
  const jsonLd = serializeJsonLd({
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": `${SITE_URL}/learn/${article.slug}#article`,
    headline: article.title,
    description: article.description,
    url: `${SITE_URL}/learn/${article.slug}`,
    author: { "@type": "Organization", name: SITE_NAME },
    publisher: { "@id": `${SITE_URL}/#organization` },
  });

  return (
    <div className="min-h-dvh bg-[#FFFDF8] text-[#16241C]">
      <script
        type="application/ld+json"
        // Safe: serializeJsonLd escapes "<" so no value can break out of the tag.
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />

      <header className="sticky top-0 z-50 border-b border-[rgba(247,243,234,0.08)] bg-[rgba(15,36,27,0.92)] backdrop-blur-[14px]">
        <nav className={`${CONTAINER} flex items-center gap-4 py-3`}>
          <Link href="/" className="flex items-center gap-2">
            <BrandMark className="h-[30px] w-[30px] shrink-0 rounded-lg" />
            <Wordmark className="text-[21px] text-[#F7F3EA]" />
          </Link>
          <Link
            href="/learn"
            className="ml-auto rounded-[9px] px-3 py-1.5 text-[13.5px] font-semibold text-[#C9D4CB] transition hover:bg-[rgba(247,243,234,0.08)] hover:text-[#F7F3EA]"
          >
            ← All guides
          </Link>
        </nav>
      </header>

      <main className={`${CONTAINER} py-[clamp(48px,7vw,88px)]`}>
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[#B08A30]">
          {article.eyebrow}
        </span>
        <h1 className="mt-3 font-display text-[clamp(28px,4vw,44px)] font-extrabold leading-[1.08] tracking-[-0.03em]">
          {article.title}
        </h1>
        <p className="mt-4 text-[17px] leading-[1.6] text-[#5C6B5E]">
          {article.description}
        </p>

        {article.sections.map((section) => (
          <section key={section.heading} className="mt-10">
            <h2 className="font-display text-[22px] font-extrabold tracking-[-0.02em]">
              {section.heading}
            </h2>
            {section.paragraphs.map((paragraph) => (
              <p
                key={paragraph.slice(0, 40)}
                className="mt-4 text-[16px] leading-[1.7] text-[#3C4A3E]"
              >
                {paragraph}
              </p>
            ))}
          </section>
        ))}

        {/* CTA — same amber treatment as the landing hero. */}
        <div className="mt-14 rounded-[22px] bg-[radial-gradient(120%_140%_at_85%_0%,#F6C258,#F4B43C_45%,#E79A24)] p-7">
          <p className="font-display text-[22px] font-extrabold tracking-[-0.02em]">
            See it on your own menu.
          </p>
          <p className="mt-1.5 text-[15px] font-medium text-[#3A2A08]">
            Free for 30 days — import your menu from a photo and go live in
            minutes.
          </p>
          <Link
            href="/signin"
            className="mt-4 inline-block rounded-xl bg-[#16241C] px-6 py-3 font-bold text-[#F7F3EA] transition hover:-translate-y-0.5"
          >
            Start free →
          </Link>
        </div>

        {others.length > 0 ? (
          <nav aria-label="More guides" className="mt-12">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#B08A30]">
              Keep reading
            </p>
            <ul className="mt-3 space-y-2">
              {others.map((other) => (
                <li key={other.slug}>
                  <Link
                    href={`/learn/${other.slug}`}
                    className="font-bold text-[#16241C] underline decoration-[var(--color-accent)] decoration-2 underline-offset-4 hover:opacity-80"
                  >
                    {other.title}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </main>

      <footer className="border-t border-[#EDE4D2] py-8">
        <div className={`${CONTAINER} text-sm text-[#7A8A7C]`}>
          © 2026 Prompt2Eat. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
