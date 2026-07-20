import Link from "next/link";

import { FAQ_ITEMS } from "@/lib/marketing-content";

/**
 * Landing FAQ — the long-tail SEO section. Rendered as native
 * <details>/<summary> accordions: zero JS, keyboard/screen-reader accessible,
 * and every answer is in the DOM for crawlers (Google indexes collapsed
 * content). The SAME FAQ_ITEMS array feeds the FAQPage JSON-LD in
 * marketing-json-ld.tsx, so markup and page can never disagree.
 *
 * Light-section idiom matching the Pricing section (cream gradient, amber
 * eyebrow); the amber ✦ chevron replacement keeps the one sanctioned accent.
 */
export function FaqSection() {
  return (
    <section
      id="faq"
      className="bg-gradient-to-b from-[#FBF6EC] to-[#FFFDF8] py-[clamp(72px,10vw,128px)]"
    >
      <div className="mx-auto w-full max-w-[840px] px-[clamp(18px,4vw,48px)]">
        <div className="text-center" data-reveal>
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#B08A30]">
            FAQ
          </span>
          <h2 className="mt-3 font-display text-[clamp(30px,4.4vw,52px)] font-extrabold tracking-[-0.03em]">
            Questions, answered.
          </h2>
        </div>

        <div className="mt-10 space-y-3">
          {FAQ_ITEMS.map((item, i) => (
            <details
              key={item.question}
              data-reveal
              data-delay={Math.min(i, 6) * 40}
              className="group rounded-[18px] border border-[#EDE4D2] bg-[#FFFDF8] px-5 shadow-[0_1px_3px_rgba(20,30,25,0.04)] open:shadow-[0_14px_30px_-18px_rgba(20,30,25,0.25)]"
            >
              <summary className="flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-4 py-4 font-display text-[16.5px] font-bold tracking-[-0.01em] text-[#16241C] [&::-webkit-details-marker]:hidden">
                {item.question}
                <span
                  aria-hidden="true"
                  className="shrink-0 text-[#B08A30] transition-transform group-open:rotate-45"
                >
                  ＋
                </span>
              </summary>
              <p className="pb-5 text-[15px] leading-[1.65] text-[#5C6B5E]">
                {item.answer}
              </p>
            </details>
          ))}
        </div>

        <p className="mt-8 text-center text-sm text-[#7A8A7C]" data-reveal>
          Want the longer reads?{" "}
          <Link
            href="/learn"
            className="font-bold text-[#16241C] underline decoration-[var(--color-accent)] decoration-2 underline-offset-4 hover:opacity-80"
          >
            Browse the guides →
          </Link>
        </p>
      </div>
    </section>
  );
}
