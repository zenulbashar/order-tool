import Link from "next/link";

import { getFeaturedProducts } from "@/lib/shop/feed";

/**
 * Homepage shop teaser. Shows the three cheapest hospitality picks straight from
 * the live feed (a 50" digital signage display, a laptop, and a tablet), and
 * links through to the dedicated /shop page. Async server component, rendered
 * inside the (sync) Landing server component.
 */

const CONTAINER = "mx-auto w-full max-w-[1240px] px-[clamp(18px,4vw,48px)]";
const eyebrow = "font-mono text-[11px] font-bold uppercase tracking-[0.18em]";

const GRADIENTS = [
  "from-[#e7d3a3] to-[#c9a35e]",
  "from-[#cdb98f] to-[#8a6f3f]",
  "from-[#d9c39a] to-[#a8824c]",
];

export async function ShopTeaser() {
  const products = await getFeaturedProducts();

  return (
    <section id="shop" className="bg-[#FFFDF8] py-[clamp(72px,10vw,120px)]">
      <div className={CONTAINER}>
        <div className="flex flex-wrap items-end justify-between gap-4" data-reveal>
          <div className="max-w-[560px]">
            <span className={`${eyebrow} text-[#B08A30]`}>The shop</span>
            <h2 className="mt-3 font-display text-[clamp(30px,4.4vw,52px)] font-extrabold leading-[1.03] tracking-[-0.03em]">
              Everything your venue needs.
            </h2>
            <p className="mt-4 text-[clamp(16px,1.7vw,20px)] leading-[1.55] text-[#6E756B]">
              Screens, laptops, mini PCs, and the rest of the hardware it takes
              to open your doors. Ordered from the same place you run Prompt2Eat.
            </p>
          </div>
          <Link
            href="/shop"
            className="rounded-xl border border-[#E0D6C1] px-5 py-2.5 text-sm font-bold text-[#16241C] transition hover:bg-[#F6F0E2]"
          >
            Browse the shop →
          </Link>
        </div>
        <div className="mt-10 grid gap-[18px] sm:grid-cols-3">
          {products.map((p, i) => (
            <Link
              key={p.id}
              href="/shop"
              data-reveal
              data-delay={i * 70}
              className="group overflow-hidden rounded-[22px] border border-[#EDE4D2] bg-[#FFFDF8] shadow-[0_1px_3px_rgba(20,30,25,0.04)] transition hover:-translate-y-1 hover:shadow-[0_24px_46px_-24px_rgba(20,30,25,0.3)]"
            >
              <span className="relative flex aspect-[4/3] items-center justify-center overflow-hidden">
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.imageUrl}
                    alt={p.name}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${GRADIENTS[i % GRADIENTS.length]}`}>
                    <span className={`${eyebrow} text-[9px] text-white/70`}>Product shot</span>
                  </span>
                )}
                {p.inStock ? (
                  <span className="absolute left-2 top-2 rounded-full bg-[var(--color-accent)] px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-[#16241C]">
                    In stock
                  </span>
                ) : null}
              </span>
              <span className="block p-4">
                <span className={`${eyebrow} text-[9px] text-[#A99A78]`}>
                  {p.subcategory ?? p.category}
                </span>
                <span className="mt-1 flex items-center justify-between gap-3">
                  <span className="font-display text-[15.5px] font-extrabold leading-snug">
                    {p.name}
                  </span>
                  <span className="shrink-0 font-display text-lg font-extrabold">
                    {p.price || "See price"}
                  </span>
                </span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
