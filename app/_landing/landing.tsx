import Link from "next/link";

import { ConciergeDemo } from "./concierge-demo";
import { RevealScript } from "./reveal-script";
import { ShopTeaser } from "./shop-teaser";

/**
 * prompt2eat.com marketing landing page. Diner-first (the AI concierge is the
 * hero), with a clear "For Restaurants" story about winning and serving more
 * customers, a hardware Shop teaser that links to the dedicated /shop page, and
 * the usual proof + pricing + CTA. Rendered only for the marketing host (see the
 * root page's host gate). Copy is deliberately plain-spoken.
 */

const CONTAINER = "mx-auto w-full max-w-[1240px] px-[clamp(18px,4vw,48px)]";
const eyebrow =
  "font-mono text-[11px] font-bold uppercase tracking-[0.18em]";

function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display font-extrabold tracking-[-0.035em] ${className}`}>
      Prompt<span className="text-[var(--color-accent)]">2</span>Eat
    </span>
  );
}

function BentoIcon({ d }: { d: string }) {
  return (
    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#F6EAD0]">
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#B08A30"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d={d} stroke="#F4B43C" />
        <path d={d} opacity="0.35" />
      </svg>
    </span>
  );
}

const RESTAURANT_FEATURES = [
  { title: "AI menu import", body: "Photograph your paper menu. It becomes a live, editable menu in a few minutes.", d: "M4 5h16M4 12h16M4 19h10" },
  { title: "AI descriptions and tags", body: "Write descriptions that sell and flag allergens in one click.", d: "M12 3v18M5 8l7-5 7 5" },
  { title: "Kitchen orders board", body: "Every order lands on a live screen your team works straight from.", d: "M5 3h14v18H5zM9 7h6M9 11h6M9 15h4" },
  { title: "Tables and QR codes", body: "A printed code for every table, ready to scan and order.", d: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM16 16h4v4h-4z" },
  { title: "Design Studio", body: "Make branded menus and posters without hiring a designer.", d: "M4 20h16M6 16l4-9 4 9M8 13h4" },
  { title: "Food cost and stock", body: "See the margin on every dish and get a nudge before you run low.", d: "M3 3v18h18M7 15l3-4 3 3 4-6" },
  { title: "Reports and customers", body: "Know your best sellers, your busiest hours, and your regulars.", d: "M4 20V10M10 20V4M16 20v-8M20 20V7" },
  { title: "Native iOS and Android apps", body: "Run the venue from your phone, with a ping on every new order.", d: "M7 3h10v18H7zM11 18h2" },
];

const NAV_LINKS = [
  { label: "Concierge", href: "#concierge" },
  { label: "For Restaurants", href: "#restaurants" },
  { label: "Shop", href: "/shop" },
  { label: "Pricing", href: "#pricing" },
];

export function Landing() {
  return (
    <div className="bg-[#FFFDF8] text-[#16241C]" id="top">
      <style>{CSS}</style>
      <noscript>
        {/* Keep everything visible without JS. */}
        <style>{`[data-reveal]{opacity:1 !important;transform:none !important}`}</style>
      </noscript>
      <RevealScript />

      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-[rgba(247,243,234,0.08)] bg-[rgba(15,36,27,0.82)] backdrop-blur-[14px] backdrop-saturate-150">
        <nav className={`${CONTAINER} flex flex-wrap items-center gap-x-6 gap-y-2 py-3`}>
          <a href="#top" className="flex items-center gap-2">
            <Mark />
            <Wordmark className="text-[21px] text-[#F7F3EA]" />
          </a>
          <div className="ml-auto flex flex-wrap items-center gap-1 md:ml-4">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.label}
                href={l.href}
                className="rounded-[9px] px-3 py-1.5 text-[13.5px] font-semibold text-[#C9D4CB] transition hover:bg-[rgba(247,243,234,0.07)] hover:text-[#F7F3EA]"
              >
                {l.label}
              </Link>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <Link
              href="/signin"
              className="rounded-[9px] px-3 py-1.5 text-[13.5px] font-semibold text-[#F7F3EA] transition hover:bg-[rgba(247,243,234,0.08)]"
            >
              Sign in
            </Link>
            <Link
              href="/signin"
              className="rounded-[11px] bg-[var(--color-accent)] px-4 py-1.5 text-[13.5px] font-bold text-[#16241C] shadow-[0_14px_30px_-12px_rgba(244,180,60,0.65)] transition hover:-translate-y-0.5"
            >
              Start free
            </Link>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-[radial-gradient(120%_90%_at_78%_-8%,#1D4636,#143228_38%,#0F281E_70%,#0C1C15)]">
        <span className="pointer-events-none absolute -right-24 -top-32 h-96 w-96 rounded-full bg-[var(--color-accent)]/20 blur-3xl [animation:p2e-aurora_18s_ease-in-out_infinite]" />
        <span className="pointer-events-none absolute -left-24 top-40 h-80 w-80 rounded-full bg-[#7FA890]/16 blur-3xl [animation:p2e-aurora_22s_ease-in-out_infinite]" />
        <div className="pointer-events-none absolute inset-0 opacity-50 [background-image:radial-gradient(rgba(247,243,234,0.05)_1px,transparent_1px)] [background-size:26px_26px]" />
        <div
          className={`${CONTAINER} relative flex flex-wrap items-center gap-[clamp(36px,5vw,72px)] py-[clamp(48px,7vw,88px)]`}
        >
          <div className="flex-1 basis-[420px]" data-reveal>
            <span className={`${eyebrow} inline-flex items-center gap-2 rounded-full border border-[rgba(244,180,60,0.28)] bg-[rgba(247,243,234,0.06)] px-3 py-1.5 text-[10.5px] text-[var(--color-accent)]`}>
              <span className="h-1.5 w-1.5 rounded-full bg-[#3FA66A] [animation:p2e-pulse_2s_ease-in-out_infinite]" />
              AI Concierge · now live
            </span>
            <h1 className="mt-5 font-display text-[clamp(40px,6.2vw,74px)] font-extrabold leading-[0.98] tracking-[-0.035em] text-[#F7F3EA]">
              Just say what
              <br />
              you&rsquo;re hungry for.
            </h1>
            <p className="mt-5 max-w-[520px] text-[clamp(16px,1.7vw,20px)] leading-[1.55] text-[#B9C6BB]">
              Prompt2Eat turns your table into a conversation. A diner scans the
              code, says what they feel like, and the concierge finds the dish,
              sorts the sides, and sends the order to your kitchen. No app to
              download, no menu to squint at.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                href="/signin"
                className="rounded-xl bg-[var(--color-accent)] px-[26px] py-[15px] font-bold text-[#16241C] shadow-[0_14px_30px_-12px_rgba(244,180,60,0.65)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_36px_-12px_rgba(244,180,60,0.8)]"
              >
                Start free →
              </Link>
              <a
                href="#concierge"
                className="rounded-xl border border-[rgba(247,243,234,0.18)] bg-[rgba(247,243,234,0.06)] px-[26px] py-[15px] font-bold text-[#F7F3EA] transition hover:bg-[rgba(247,243,234,0.1)]"
              >
                See it order for you
              </a>
            </div>
            <p className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-[#9FB0A2]">
              <span className={`${eyebrow} text-[10px] text-[#5F7568]`}>Order with</span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full bg-[conic-gradient(from_180deg,#4285F4,#9b72cb,#d96570,#4285F4)]" />
                Google Gemini
              </span>
              <span className="text-[#5F7568]">·</span>
              <span> Pay · G Pay · PayTo</span>
            </p>
          </div>
          <div className="flex-1 basis-[380px]" data-reveal data-delay="120">
            <ConciergeDemo />
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section className="bg-[#0C1C15] py-6">
        <div className={`${CONTAINER} flex flex-wrap items-center justify-center gap-x-4 gap-y-3`}>
          <span className={`${eyebrow} text-[10.5px] text-[#5F7568]`}>
            Works everywhere you already are
          </span>
          {[
            { label: "Order from Google Gemini", dot: true },
            { label: "Apple Pay and Google Pay" },
            { label: "PayTo · pay by bank" },
          ].map((c) => (
            <span
              key={c.label}
              className="inline-flex items-center gap-2 rounded-full border border-[rgba(247,243,234,0.1)] bg-[rgba(247,243,234,0.05)] px-3.5 py-1.5 text-[13px] font-semibold text-[#C9D4CB]"
            >
              {c.dot ? (
                <span className="h-2.5 w-2.5 rounded-full bg-[conic-gradient(from_180deg,#4285F4,#9b72cb,#d96570,#4285F4)]" />
              ) : null}
              {c.label}
            </span>
          ))}
          <span className="rounded-full bg-[var(--color-accent)] px-3.5 py-1.5 text-[13px] font-bold text-[#16241C]">
            No app needed
          </span>
        </div>
      </section>

      {/* Concierge deep-dive */}
      <section id="concierge" className="bg-gradient-to-b from-[#FFFDF8] to-[#FBF6EC] py-[clamp(72px,10vw,128px)]">
        <div className={CONTAINER}>
          <div className="mx-auto max-w-[640px] text-center" data-reveal>
            <span className={`${eyebrow} text-[var(--color-accent-ink,#B08A30)] text-[#B08A30]`}>
              The concierge
            </span>
            <h2 className="mt-3 font-display text-[clamp(30px,4.4vw,52px)] font-extrabold leading-[1.03] tracking-[-0.03em]">
              Ordering, reinvented by AI.
            </h2>
            <p className="mt-4 text-[clamp(16px,1.7vw,20px)] leading-[1.55] text-[#6E756B]">
              The concierge reads your whole menu and answers like a waiter who
              knows every dish. Diners get to the right meal faster, and they
              tend to add a little more along the way.
            </p>
          </div>

          <div className="mt-16 flex flex-col gap-[clamp(28px,4vw,64px)]">
            <FeatureRow
              flip={false}
              eyebrow="Natural language"
              title="Say it the way you think it."
              body="Something light, no nuts, under $20. The concierge understands plain requests, respects allergies and budgets, and replies in seconds. No scrolling, no guessing."
              pills={[
                { label: "Dairy-free aware", cls: "bg-[#e7f4ea] text-[#2f7a4f]" },
                { label: "Budget-smart", cls: "bg-[#fbf0d8] text-[#b07f1e]" },
                { label: "Allergen-safe", cls: "bg-[#eef0ea] text-[#5d655b]" },
              ]}
              visual={
                <div className="rounded-[22px] border border-[#EDE4D2] bg-white p-5 shadow-[0_30px_56px_-28px_rgba(20,30,25,0.22)]">
                  <div className="flex justify-end">
                    <span className="max-w-[80%] rounded-[16px_16px_5px_16px] bg-gradient-to-br from-[#f4b43c] to-[#e79a24] px-3.5 py-2 text-sm font-medium text-[#16241c]">
                      Warming, veggie, about $18
                    </span>
                  </div>
                  <div className="mt-2.5 flex justify-start">
                    <span className="max-w-[85%] rounded-[16px_16px_16px_5px] bg-[#F6F0E2] px-3.5 py-2 text-sm text-[#16241c]">
                      The mushroom orzo fits perfectly, $17 and fully
                      vegetarian. Want a soup with it?
                    </span>
                  </div>
                </div>
              }
            />
            <FeatureRow
              flip
              eyebrow="Google Gemini"
              title="Order from the assistant they already use."
              body="Prompt2Eat plugs into Google Gemini, so a diner can order from your venue without opening anything new. They ask Gemini, it places the order, your kitchen gets the ticket."
              visual={
                <div className="rounded-[22px] bg-gradient-to-br from-[#143228] to-[#0f281e] p-5 text-[#F7F3EA] shadow-[0_30px_56px_-28px_rgba(13,29,22,0.5)]">
                  <span className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1.5 text-xs font-semibold">
                    <span className="h-3 w-3 rounded-full bg-[conic-gradient(from_180deg,#4285F4,#9b72cb,#d96570,#4285F4)]" />
                    Gemini
                  </span>
                  <p className="mt-3 rounded-[14px] bg-white/10 px-3.5 py-2 text-sm">
                    Order my usual from Maple &amp; Thyme for table 12.
                  </p>
                  <p className="mt-2 inline-flex items-center gap-2 rounded-[14px] bg-[var(--color-accent)] px-3.5 py-2 text-sm font-semibold text-[#16241c]">
                    ✓ Placed. The kitchen has it.
                  </p>
                </div>
              }
            />
            <FeatureRow
              flip={false}
              eyebrow="QR dine-in"
              title="Scan the table. Order and pay from the seat."
              body="One code per table. Guests order and pay without waving anyone down, so your staff spend their time on service instead of taking orders."
              visual={
                <div className="rounded-[22px] border border-[#EDE4D2] bg-white p-6 text-center shadow-[0_30px_56px_-28px_rgba(20,30,25,0.22)]">
                  <div className="mx-auto grid w-32 grid-cols-5 gap-1 rounded-2xl bg-[#16241C] p-3">
                    {QR_PATTERN.map((on, i) => (
                      <span
                        key={i}
                        className={`aspect-square rounded-[3px] ${on ? "bg-[var(--color-accent)]" : "bg-[#F7F3EA]/15"}`}
                      />
                    ))}
                  </div>
                  <p className="mt-3 font-display text-lg font-extrabold">Table 12</p>
                  <p className={`${eyebrow} text-[10px] text-[#8A9384]`}>Scan to order</p>
                </div>
              }
            />
            <FeatureRow
              flip
              eyebrow="Reorder and upsell"
              title="Turn first-timers into regulars."
              body="Regulars reorder their favourite in a tap. Smart suggestions add the side or drink that pairs, which lifts the average order without any pressure. That is how a busy night becomes a bigger night."
              visual={
                <div className="rounded-[22px] border border-[#EDE4D2] bg-white p-5 shadow-[0_30px_56px_-28px_rgba(20,30,25,0.22)]">
                  <div className="flex items-center gap-3 rounded-2xl bg-[#F6F0E2] p-3">
                    <span className="h-10 w-10 rounded-lg bg-gradient-to-br from-[#d8b26a] to-[#b07f2e]" />
                    <span className="flex-1">
                      <span className={`${eyebrow} block text-[9px] text-[#8A9384]`}>Your usual</span>
                      <span className="block text-sm font-bold">Wild Mushroom Orzo</span>
                    </span>
                    <span className="rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-bold text-[#16241c]">
                      Reorder
                    </span>
                  </div>
                  <div className="mt-2.5 flex items-center gap-2 rounded-2xl border border-dashed border-[#E0D6C1] p-3 text-sm text-[#6E756B]">
                    <span className={`${eyebrow} text-[9px] text-[var(--color-accent)]`}>Smart upsell</span>
                    Add miso soup? <span className="ml-auto font-bold text-[#16241c]">+$4</span>
                  </div>
                </div>
              }
            />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="relative bg-[#16241C] py-[clamp(72px,10vw,120px)]">
        <span className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(244,180,60,0.12),transparent)]" />
        <div className={`${CONTAINER} relative`}>
          <div className="text-center" data-reveal>
            <span className={`${eyebrow} text-[var(--color-accent)]`}>How it works</span>
            <h2 className="mt-3 font-display text-[clamp(30px,4.4vw,52px)] font-extrabold tracking-[-0.03em] text-[#F7F3EA]">
              Scan. Chat. Eat.
            </h2>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-3">
            {[
              { n: "1", t: "Scan the table", b: "Point a phone at the table code. The menu opens in the browser, no download." },
              { n: "2", t: "Chat your craving", b: "Tell the concierge what you feel like. It recommends and customises in seconds." },
              { n: "3", t: "Pay and eat", b: "Pay by card or bank on the same screen. The kitchen is already working on it." },
            ].map((s, i) => (
              <div key={s.n} className="text-center" data-reveal data-delay={i * 80}>
                <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-[18px] bg-[rgba(247,243,234,0.06)] font-display text-2xl font-extrabold text-[var(--color-accent)]">
                  {s.n}
                </span>
                <h3 className="mt-4 font-display text-[clamp(20px,3vw,26px)] font-extrabold text-[#F7F3EA]">
                  {s.t}
                </h3>
                <p className="mx-auto mt-2 max-w-[280px] text-[15px] leading-[1.55] text-[#9FB0A2]">
                  {s.b}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* For Restaurants */}
      <section id="restaurants" className="bg-gradient-to-b from-[#FBF6EC] to-[#FFFDF8] py-[clamp(72px,10vw,128px)]">
        <div className={CONTAINER}>
          <div className="max-w-[680px]" data-reveal>
            <span className={`${eyebrow} text-[#B08A30]`}>For restaurants</span>
            <h2 className="mt-3 font-display text-[clamp(30px,4.4vw,52px)] font-extrabold leading-[1.03] tracking-[-0.03em]">
              One platform to run the whole venue.
            </h2>
            <p className="mt-4 text-[clamp(16px,1.7vw,20px)] leading-[1.55] text-[#6E756B]">
              Ordering is where it starts. The rest of the venue runs here too.
              Your menu, your kitchen screen, your payments, your marketing, and
              your numbers, all in one place. Bigger baskets, faster tables, and
              regulars who keep coming back.
            </p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {RESTAURANT_FEATURES.map((f, i) => (
              <div
                key={f.title}
                data-reveal
                data-delay={(i % 3) * 60}
                className="rounded-[22px] border border-[#EDE4D2] bg-[#FFFDF8] p-5 shadow-[0_1px_3px_rgba(20,30,25,0.04)] transition hover:-translate-y-1 hover:shadow-[0_24px_46px_-24px_rgba(20,30,25,0.3)]"
              >
                <BentoIcon d={f.d} />
                <h3 className="mt-3.5 font-display text-base font-extrabold tracking-[-0.015em]">
                  {f.title}
                </h3>
                <p className="mt-1 text-[13.5px] leading-[1.5] text-[#7C8579]">{f.body}</p>
              </div>
            ))}
            {/* Payments spotlight */}
            <div
              data-reveal
              className="rounded-[22px] bg-gradient-to-br from-[#143228] to-[#0f281e] p-5 text-[#F7F3EA] shadow-[0_30px_56px_-28px_rgba(13,29,22,0.5)]"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/8">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F4B43C" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="6" width="18" height="12" rx="2" />
                  <path d="M3 10h18" />
                </svg>
              </span>
              <h3 className="mt-3.5 font-display text-base font-extrabold tracking-[-0.015em]">
                Card, wallet, and pay by bank
              </h3>
              <p className="mt-1 text-[13.5px] leading-[1.5] text-[#9FB0A2]">
                Card, Apple Pay, Google Pay, and PayTo, settled straight to your
                account. Connect Square if you already run one.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Shop teaser */}
      <ShopTeaser />

      {/* Social proof */}
      <section className="relative bg-gradient-to-b from-[#0F281E] to-[#0C1C15] py-[clamp(72px,10vw,120px)]">
        <span className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(244,180,60,0.1),transparent)]" />
        <div className={`${CONTAINER} relative`}>
          {/* TODO-METRIC: replace with real figures once you have them. */}
          <div className="grid gap-8 text-center sm:grid-cols-4" data-reveal>
            {[
              { v: 2.4, suffix: "M", dec: 1, label: "Orders placed", amber: true },
              { v: 12, suffix: "k+", dec: 0, label: "Venues onboard" },
              { v: 38, suffix: "%", dec: 0, label: "Avg. check uplift" },
              { v: 4.9, suffix: "", dec: 1, label: "Diner rating" },
            ].map((m) => (
              <div key={m.label}>
                <span
                  className={`block font-display text-[clamp(38px,5vw,60px)] font-extrabold tracking-[-0.03em] ${m.amber ? "text-[var(--color-accent)]" : "text-[#F7F3EA]"}`}
                  data-count={m.v}
                  data-suffix={m.suffix}
                  data-decimals={m.dec}
                >
                  0
                </span>
                <span className="mt-1 block text-sm text-[#9FB0A2]">{m.label}</span>
              </div>
            ))}
          </div>
          {/* TODO-TESTIMONIAL: replace quotes, names, venues. */}
          <div className="mt-14 grid gap-4 sm:grid-cols-3">
            {[
              { q: "Guests order faster and add more. Our average table is up and the floor feels calmer.", who: "Sofia Marin", venue: "Maple & Thyme" },
              { q: "Setting up the menu took an afternoon. The photo import did most of the work.", who: "Daniel O.", venue: "Otto & Sons" },
              { q: "The concierge answers the questions my staff used to field all night.", who: "Priya N.", venue: "Blue Door Cafe" },
            ].map((t, i) => (
              <div
                key={i}
                data-reveal
                data-delay={i * 80}
                className="rounded-[22px] border border-[rgba(247,243,234,0.1)] bg-[rgba(247,243,234,0.05)] p-6"
              >
                <span className="font-display text-3xl font-extrabold text-[var(--color-accent)]">&ldquo;</span>
                <p className="mt-1 text-base leading-[1.55] text-[#E4EBE4]">{t.q}</p>
                <div className="mt-4 flex items-center gap-3">
                  <span className="h-9 w-9 rounded-full bg-gradient-to-br from-[#7fa890] to-[#3f7a63]" />
                  <span className="text-sm text-[#7FA890]">
                    <span className="block font-bold text-[#C9D4CB]">{t.who}</span>
                    {t.venue}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="bg-gradient-to-b from-[#FFFDF8] to-[#FBF6EC] py-[clamp(72px,10vw,128px)]">
        <div className={CONTAINER}>
          <div className="text-center" data-reveal>
            <span className={`${eyebrow} text-[#B08A30]`}>Pricing</span>
            <h2 className="mt-3 font-display text-[clamp(30px,4.4vw,52px)] font-extrabold tracking-[-0.03em]">
              Free for 30 days. No card.
            </h2>
          </div>
          <div className="mx-auto mt-12 grid max-w-[960px] items-stretch gap-4 sm:grid-cols-3">
            {[
              { name: "Starter", price: "$0", note: "to start", cta: "Start free", featured: false },
              { name: "Growth", price: "$89", note: "per month", cta: "Start free trial", featured: true },
              { name: "Pro", price: "Custom", note: "for groups", cta: "Talk to sales", featured: false },
            ].map((tier, i) => (
              <div
                key={tier.name}
                data-reveal
                data-delay={i * 70}
                className={`flex flex-col rounded-[22px] p-6 ${
                  tier.featured
                    ? "relative border-2 border-[var(--color-accent)] bg-gradient-to-br from-[#143228] to-[#0f281e] text-[#F7F3EA] shadow-[0_30px_56px_-28px_rgba(13,29,22,0.5)]"
                    : "border border-[#EDE4D2] bg-[#FFFDF8]"
                }`}
              >
                {tier.featured ? (
                  <span className="absolute -top-3 left-6 rounded-full bg-[var(--color-accent)] px-3 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-[#16241C]">
                    Most popular
                  </span>
                ) : null}
                <span className={`${eyebrow} text-[10px] ${tier.featured ? "text-[#9FB0A2]" : "text-[#B08A30]"}`}>
                  {tier.name}
                </span>
                <p className="mt-3">
                  <span className={`font-display text-[44px] font-extrabold tracking-[-0.03em] ${tier.featured ? "text-[var(--color-accent)]" : ""}`}>
                    {tier.price}
                  </span>{" "}
                  <span className={tier.featured ? "text-[#9FB0A2]" : "text-[#7C8579]"}>{tier.note}</span>
                </p>
                <Link
                  href="/signin"
                  className={`mt-auto rounded-xl px-4 py-3 text-center text-sm font-bold transition ${
                    tier.featured
                      ? "bg-[var(--color-accent)] text-[#16241C] hover:opacity-90"
                      : "border border-[#16241C] text-[#16241C] hover:bg-[#16241C] hover:text-[#F7F3EA]"
                  }`}
                >
                  {tier.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section id="cta" className="bg-[#FFFDF8] px-[clamp(18px,4vw,48px)] py-[clamp(48px,7vw,96px)]">
        <div className="relative mx-auto max-w-[1080px] overflow-hidden rounded-[32px] bg-[radial-gradient(120%_140%_at_85%_0%,#F6C258,#F4B43C_45%,#E79A24)] px-[clamp(28px,6vw,72px)] py-[clamp(48px,7vw,80px)] text-[#16241C]">
            <span className="pointer-events-none absolute -bottom-16 -left-10 h-64 w-64 rounded-full bg-[#0f281e]/15 blur-2xl" />
            <div className="relative max-w-[560px]" data-reveal>
              <h2 className="font-display text-[clamp(30px,4.4vw,52px)] font-extrabold leading-[1.03] tracking-[-0.03em]">
                Start free. Your menu is live in minutes.
              </h2>
              <p className="mt-3 text-lg leading-[1.5]">
                Set up your menu, print your table codes, and take your first
                order today.
              </p>
              <form action="/signin" className="mt-6 flex flex-wrap gap-2">
                <input
                  type="email"
                  name="email"
                  required
                  placeholder="you@venue.com"
                  aria-label="Email address"
                  className="min-w-0 flex-1 rounded-xl border border-[#16241C]/20 bg-white/70 px-4 py-3 text-sm text-[#16241C] placeholder:text-[#16241C]/50 focus-visible:outline-2 focus-visible:outline-[#16241C]"
                />
                <button
                  type="submit"
                  className="rounded-xl bg-[#16241C] px-5 py-3 text-sm font-bold text-[#F7F3EA] transition hover:opacity-90"
                >
                  Start free →
                </button>
              </form>
              <p className="mt-3 text-[13px] text-[#16241C]/70">
                30-day trial. No credit card. Cancel anytime.
              </p>
            </div>
          </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#0C1C15] py-14 text-[#C9D4CB]">
        <div className={CONTAINER}>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <div className="flex items-center gap-2">
                <Mark />
                <Wordmark className="text-lg text-[#F7F3EA]" />
              </div>
              <p className="mt-3 max-w-[280px] text-sm text-[#7FA890]">
                The AI-native way to order. Built for hospitality, loved by
                diners.
              </p>
            </div>
            {[
              { h: "Product", links: ["Concierge", "For Restaurants", "Pricing", "Shop"] },
              { h: "Company", links: ["About", "Careers", "Contact"] },
              { h: "Legal", links: ["Privacy", "Terms"] },
            ].map((col) => (
              <div key={col.h}>
                <p className={`${eyebrow} text-[10px] text-[#5F7568]`}>{col.h}</p>
                <ul className="mt-3 space-y-2 text-sm font-medium">
                  {col.links.map((l) => (
                    <li key={l}>
                      <span className="cursor-default text-[#C9D4CB]">{l}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-[rgba(247,243,234,0.08)] pt-6 text-sm text-[#7FA890]">
            <span>© 2026 Prompt2Eat. All rights reserved.</span>
            <span className="flex gap-4">
              <span>X</span>
              <span>Instagram</span>
              <span>LinkedIn</span>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Mark() {
  return (
    <span className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-[var(--color-accent)] font-display text-base font-extrabold text-[#0c1c15] shadow-[0_0_16px_rgba(244,180,60,0.55)]">
      P
    </span>
  );
}

function FeatureRow({
  flip,
  eyebrow: eb,
  title,
  body,
  pills,
  visual,
}: {
  flip: boolean;
  eyebrow: string;
  title: string;
  body: string;
  pills?: { label: string; cls: string }[];
  visual: React.ReactNode;
}) {
  return (
    <div className="grid items-center gap-[clamp(28px,4vw,64px)] lg:grid-cols-2" data-reveal>
      <div className={flip ? "lg:order-2" : ""}>
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[#B08A30]">
          {eb}
        </span>
        <h3 className="mt-2.5 font-display text-[clamp(24px,3vw,34px)] font-extrabold leading-[1.08] tracking-[-0.02em]">
          {title}
        </h3>
        <p className="mt-3 max-w-[440px] text-[15px] leading-[1.6] text-[#6E756B]">{body}</p>
        {pills ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {pills.map((p) => (
              <span key={p.label} className={`rounded-full px-3 py-1 text-xs font-semibold ${p.cls}`}>
                {p.label}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div className={flip ? "lg:order-1" : ""}>{visual}</div>
    </div>
  );
}

const QR_PATTERN = [
  true, true, false, true, true,
  true, false, true, false, true,
  false, true, true, true, false,
  true, false, true, false, true,
  true, true, false, true, true,
];

const CSS = `
@keyframes p2e-aurora { 0%,100%{transform:translate(0,0)} 50%{transform:translate(-4%,4%)} }
@keyframes p2e-pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
@keyframes p2e-blink { 0%,100%{opacity:1} 50%{opacity:0} }
@keyframes p2e-think { 0%,100%{transform:translateY(0);opacity:.5} 50%{transform:translateY(-3px);opacity:1} }
@keyframes p2e-msg-in { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
@keyframes p2e-pop { 0%{transform:scale(0)} 70%{transform:scale(1.2)} 100%{transform:scale(1)} }
@keyframes p2e-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
[data-reveal]{opacity:0;transform:translateY(26px);transition:opacity .7s cubic-bezier(.2,.7,.2,1),transform .7s cubic-bezier(.2,.7,.2,1)}
[data-reveal].is-visible{opacity:1;transform:none}
html{scroll-behavior:smooth}
@media (prefers-reduced-motion: reduce){
  [data-reveal]{opacity:1 !important;transform:none !important;transition:none !important}
  html{scroll-behavior:auto}
  [class*="p2e-"]{animation:none !important}
}
`;
