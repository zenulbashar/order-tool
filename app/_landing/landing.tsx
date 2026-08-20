import Link from "next/link";

import { BrandMark, Wordmark } from "@/app/_components/wordmark";
import {
  annualSavingPercent,
  formatPlanAmount,
  PUBLIC_PLANS,
  type PublicPricing,
} from "@/lib/billing/public-pricing";
import type { PaidPlan } from "@/lib/billing/stripe-prices";

import { ConciergeDemo } from "./concierge-demo";
import { FaqSection } from "./faq-section";
import { RevealScript } from "./reveal-script";
import { ShopTeaser } from "./shop-teaser";
import { MobileNavDisclosure } from "./mobile-nav-disclosure";

/**
 * prompt2eat.com marketing landing page. Diner-first (the AI concierge is the
 * hero), with a clear "For Restaurants" story about winning and serving more
 * customers, a hardware Shop teaser that links to the dedicated /shop page, and
 * the usual proof + pricing + CTA. Rendered only for the marketing host (see the
 * root page's host gate). Copy is deliberately plain-spoken.
 */

const CONTAINER = "mx-auto w-full max-w-[1240px] px-[clamp(18px,4vw,48px)]";
const eyebrow =
  "font-mono text-eyebrow font-bold uppercase tracking-[0.18em]";

function BentoIcon({ d }: { d: string }) {
  return (
    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#F6EAD0]">
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#856819"
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
  { label: "FAQ", href: "#faq" },
  { label: "Guides", href: "/learn" },
];

/**
 * The pricing grid. Tier NAMES and what each unlocks come from the entitlement
 * model (lib/billing/plans.ts) — `trial` grants Scale-level access for 30 days
 * (app/dashboard/billing/actions.ts sets trial_period_days: 30), `pro` adds the
 * concierge and owner AI tools, `scale` adds multi-venue, custom domain and the
 * SEO/AEO studio. AMOUNTS are never written here: they are read back from the
 * same Stripe lookup keys checkout resolves, so this page and the charge cannot
 * disagree. When Stripe can't be reached the card falls back to naming the tier
 * without a number, which is the one safe thing to show.
 */
const PRICING_TIERS: {
  name: string;
  plan: PaidPlan | null;
  blurb: string;
  cta: string;
  featured: boolean;
  fallbackPrice: string;
  fallbackNote: string;
}[] = [
  {
    name: "Free trial",
    plan: null,
    blurb:
      "Everything in Scale for 30 days. No card, no commitment — bring your menu across and take real orders.",
    cta: "Start free",
    featured: false,
    fallbackPrice: "$0",
    fallbackNote: "for 30 days",
  },
  {
    name: "Pro",
    plan: "pro",
    blurb:
      "The full ordering platform, plus the AI ordering concierge and the AI menu import and description tools.",
    cta: "Start free trial",
    featured: true,
    fallbackPrice: "Pricing",
    fallbackNote: "shown at checkout",
  },
  {
    name: "Scale",
    plan: "scale",
    blurb:
      "Everything in Pro, plus multiple venues, your own storefront domain, and the SEO and AEO studio.",
    cta: "Start free trial",
    featured: false,
    fallbackPrice: "Pricing",
    fallbackNote: "shown at checkout",
  },
];

export function Landing({ pricing }: { pricing: PublicPricing }) {
  // Every resolved tier shares a currency (they are Prices on one account), so
  // the first one is representative; AUD is the default the platform bills in.
  const pricingCurrency =
    PUBLIC_PLANS.map((plan) => pricing[plan]?.currency).find(Boolean) ?? "AUD";

  return (
    <div className="bg-surface-elevated text-forest" id="top">
      <style>{CSS}</style>
      <noscript>
        {/* Keep everything visible without JS. */}
        <style>{`[data-reveal]{opacity:1 !important;transform:none !important}`}</style>
      </noscript>
      <RevealScript />

      {/* Nav */}
      <header className="sticky top-0 z-sticky border-b border-[rgba(247,243,234,0.08)] bg-[rgba(15,36,27,0.82)] backdrop-blur-[14px] backdrop-saturate-150 relative">
        <nav className={`${CONTAINER} flex flex-wrap items-center gap-x-6 gap-y-2 py-3`}>
          <a href="#top" className="flex items-center gap-2">
            <Mark />
            <Wordmark className="text-[21px] text-surface" />
          </a>
          {/* Hidden below md — six links in a flex-wrap row inside a sticky
              header wrapped to 3–4 rows at 390px (UI audit P1-4). */}
          <div className="ml-auto hidden flex-wrap items-center gap-1 md:ml-4 md:flex">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.label}
                href={l.href}
                className="flex min-h-11 items-center rounded-[9px] px-3 text-[13.5px] font-semibold text-[var(--mkt-on-dark)] transition hover:bg-[rgba(247,243,234,0.07)] hover:text-surface md:min-h-9"
              >
                {l.label}
              </Link>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <Link
              href="/signin"
              className="hidden min-h-11 items-center rounded-[9px] px-3 text-[13.5px] font-semibold text-surface transition hover:bg-[rgba(247,243,234,0.08)] sm:inline-flex md:min-h-9"
            >
              Sign in
            </Link>
            <Link
              href="/signin"
              className="inline-flex min-h-11 items-center rounded-[11px] bg-[var(--color-accent)] px-4 text-[13.5px] font-bold text-forest shadow-[0_14px_30px_-12px_rgba(244,180,60,0.65)] transition hover:-translate-y-0.5 md:min-h-9"
            >
              Start free
            </Link>
            <MobileNavDisclosure links={NAV_LINKS} />
          </div>
        </nav>
      </header>

      {/* The skip link's no-JS anchor target (M7 / audit F10). Without a
          main landmark the plain `href="#main-content"` did nothing here and
          only the JS fallback worked. */}
      <main id="main-content" tabIndex={-1}>

      {/* Hero */}
      <section className="relative overflow-hidden bg-[radial-gradient(120%_90%_at_78%_-8%,#1D4636,#143228_38%,#0F281E_70%,#0C1C15)]">
        <span className="pointer-events-none absolute -right-24 -top-32 h-96 w-96 rounded-full bg-[var(--color-accent)]/20 blur-3xl [animation:p2e-aurora_18s_ease-in-out_infinite]" />
        <span className="pointer-events-none absolute -left-24 top-40 h-80 w-80 rounded-full bg-[var(--mkt-on-dark-sage-bright)]/16 blur-3xl [animation:p2e-aurora_22s_ease-in-out_infinite]" />
        <div className="pointer-events-none absolute inset-0 opacity-50 [background-image:radial-gradient(rgba(247,243,234,0.05)_1px,transparent_1px)] [background-size:26px_26px]" />
        <div
          className={`${CONTAINER} relative flex flex-wrap items-center gap-[clamp(36px,5vw,72px)] py-[clamp(48px,7vw,88px)]`}
        >
          <div className="flex-1 basis-[420px]" data-reveal>
            <span className={`${eyebrow} inline-flex items-center gap-2 rounded-full border border-[rgba(244,180,60,0.28)] bg-[rgba(247,243,234,0.06)] px-3 py-1.5 text-[10.5px] text-[var(--color-accent)]`}>
              <span className="h-1.5 w-1.5 rounded-full bg-success [animation:p2e-pulse_2s_ease-in-out_infinite]" />
              AI Concierge · now live
            </span>
            <h1 className="mt-5 font-display text-[clamp(40px,6.2vw,74px)] font-extrabold leading-[0.98] tracking-[-0.035em] text-surface">
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
                className="rounded-xl bg-[var(--color-accent)] px-[26px] py-[15px] font-bold text-forest shadow-[0_14px_30px_-12px_rgba(244,180,60,0.65)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_36px_-12px_rgba(244,180,60,0.8)]"
              >
                Start free →
              </Link>
              <a
                href="#concierge"
                className="rounded-xl border border-[rgba(247,243,234,0.18)] bg-[rgba(247,243,234,0.06)] px-[26px] py-[15px] font-bold text-surface transition hover:bg-[rgba(247,243,234,0.1)]"
              >
                See it order for you
              </a>
            </div>
            <p className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-[var(--mkt-on-dark-muted)]">
              <span className={`${eyebrow} text-micro text-[var(--mkt-on-dark-sage)]`}>Pay with</span>
              <span> Pay · G Pay · PayTo</span>
            </p>
          </div>
          <div className="flex-1 basis-[380px]" data-reveal data-delay="120">
            <ConciergeDemo />
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section className="bg-[var(--mkt-forest-darkest)] py-6">
        <div className={`${CONTAINER} flex flex-wrap items-center justify-center gap-x-4 gap-y-3`}>
          <span className={`${eyebrow} text-[10.5px] text-[var(--mkt-on-dark-sage)]`}>
            Works everywhere you already are
          </span>
          {[
            { label: "Apple Pay and Google Pay" },
            { label: "PayTo · pay by bank" },
          ].map((c) => (
            <span
              key={c.label}
              className="inline-flex items-center gap-2 rounded-full border border-[rgba(247,243,234,0.1)] bg-[rgba(247,243,234,0.05)] px-3.5 py-1.5 text-[13px] font-semibold text-[var(--mkt-on-dark)]"
            >
              {c.label}
            </span>
          ))}
          <span className="rounded-full bg-[var(--color-accent)] px-3.5 py-1.5 text-[13px] font-bold text-forest">
            No app needed
          </span>
        </div>
      </section>

      {/* Concierge deep-dive */}
      <section id="concierge" className="bg-gradient-to-b from-surface-elevated to-[var(--mkt-cream-soft)] py-[clamp(72px,10vw,128px)]">
        <div className={CONTAINER}>
          <div className="mx-auto max-w-[640px] text-center" data-reveal>
            <span className={`${eyebrow} text-[var(--color-accent-ink,#856819)] text-[var(--mkt-eyebrow)]`}>
              The concierge
            </span>
            <h2 className="mt-3 font-display text-[clamp(30px,4.4vw,52px)] font-extrabold leading-[1.03] tracking-[-0.03em]">
              Ordering, reinvented by AI.
            </h2>
            <p className="mt-4 text-[clamp(16px,1.7vw,20px)] leading-[1.55] text-[var(--mkt-muted)]">
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
                { label: "Budget-smart", cls: "bg-[#fbf0d8] text-accent-deep" },
                { label: "Allergen-safe", cls: "bg-[#eef0ea] text-[#5d655b]" },
              ]}
              visual={
                <div className="rounded-[22px] border border-[var(--mkt-line)] bg-white p-5 shadow-[0_30px_56px_-28px_rgba(20,30,25,0.22)]">
                  <div className="flex justify-end">
                    <span className="max-w-[80%] rounded-[16px_16px_5px_16px] bg-gradient-to-br from-accent to-[var(--mkt-amber-deep)] px-3.5 py-2 text-sm font-medium text-forest">
                      Warming, veggie, about $18
                    </span>
                  </div>
                  <div className="mt-2.5 flex justify-start">
                    <span className="max-w-[85%] rounded-[16px_16px_16px_5px] bg-[var(--mkt-cream)] px-3.5 py-2 text-sm text-forest">
                      The mushroom orzo fits perfectly, $17 and fully
                      vegetarian. Want a soup with it?
                    </span>
                  </div>
                </div>
              }
            />
            <FeatureRow
              flip
              eyebrow="QR dine-in"
              title="Scan the table. Order and pay from the seat."
              body="One code per table. Guests order and pay without waving anyone down, so your staff spend their time on service instead of taking orders."
              visual={
                <div className="rounded-[22px] border border-[var(--mkt-line)] bg-white p-6 text-center shadow-[0_30px_56px_-28px_rgba(20,30,25,0.22)]">
                  <div className="mx-auto grid w-32 grid-cols-5 gap-1 rounded-2xl bg-forest p-3">
                    {QR_PATTERN.map((on, i) => (
                      <span
                        key={i}
                        className={`aspect-square rounded-[3px] ${on ? "bg-[var(--color-accent)]" : "bg-surface/15"}`}
                      />
                    ))}
                  </div>
                  <p className="mt-3 font-display text-lg font-extrabold">Table 12</p>
                  <p className={`${eyebrow} text-micro text-[var(--mkt-on-dark-dim)]`}>Scan to order</p>
                </div>
              }
            />
            <FeatureRow
              flip={false}
              eyebrow="Reorder and upsell"
              title="Turn first-timers into regulars."
              body="Regulars reorder their favourite in a tap. Smart suggestions add the side or drink that pairs, which lifts the average order without any pressure. That is how a busy night becomes a bigger night."
              visual={
                <div className="rounded-[22px] border border-[var(--mkt-line)] bg-white p-5 shadow-[0_30px_56px_-28px_rgba(20,30,25,0.22)]">
                  <div className="flex items-center gap-3 rounded-2xl bg-[var(--mkt-cream)] p-3">
                    <span className="h-10 w-10 rounded-lg bg-gradient-to-br from-[var(--mkt-amber-light)] to-[var(--mkt-amber-mid)]" />
                    <span className="flex-1">
                      <span className={`${eyebrow} block text-2xs text-[var(--mkt-on-dark-dim)]`}>Your usual</span>
                      <span className="block text-sm font-bold">Wild Mushroom Orzo</span>
                    </span>
                    <span className="rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-bold text-forest">
                      Reorder
                    </span>
                  </div>
                  <div className="mt-2.5 flex items-center gap-2 rounded-2xl border border-dashed border-[var(--mkt-line-strong)] p-3 text-sm text-[var(--mkt-muted)]">
                    <span className={`${eyebrow} text-2xs text-[var(--color-accent)]`}>Smart upsell</span>
                    Add miso soup? <span className="ml-auto font-bold text-forest">+$4</span>
                  </div>
                </div>
              }
            />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="relative bg-forest py-[clamp(72px,10vw,120px)]">
        <span className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(244,180,60,0.12),transparent)]" />
        <div className={`${CONTAINER} relative`}>
          <div className="text-center" data-reveal>
            <span className={`${eyebrow} text-[var(--color-accent)]`}>How it works</span>
            <h2 className="mt-3 font-display text-[clamp(30px,4.4vw,52px)] font-extrabold tracking-[-0.03em] text-surface">
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
                <h3 className="mt-4 font-display text-[clamp(20px,3vw,26px)] font-extrabold text-surface">
                  {s.t}
                </h3>
                <p className="mx-auto mt-2 max-w-[280px] text-[15px] leading-[1.55] text-[var(--mkt-on-dark-muted)]">
                  {s.b}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* For Restaurants */}
      <section id="restaurants" className="bg-gradient-to-b from-[var(--mkt-cream-soft)] to-surface-elevated py-[clamp(72px,10vw,128px)]">
        <div className={CONTAINER}>
          <div className="max-w-[680px]" data-reveal>
            <span className={`${eyebrow} text-[var(--mkt-eyebrow)]`}>For restaurants</span>
            <h2 className="mt-3 font-display text-[clamp(30px,4.4vw,52px)] font-extrabold leading-[1.03] tracking-[-0.03em]">
              One platform to run the whole venue.
            </h2>
            <p className="mt-4 text-[clamp(16px,1.7vw,20px)] leading-[1.55] text-[var(--mkt-muted)]">
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
                className="rounded-[22px] border border-[var(--mkt-line)] bg-surface-elevated p-5 shadow-[0_1px_3px_rgba(20,30,25,0.04)] transition hover:-translate-y-1 hover:shadow-[0_24px_46px_-24px_rgba(20,30,25,0.3)]"
              >
                <BentoIcon d={f.d} />
                <h3 className="mt-3.5 font-display text-base font-extrabold tracking-[-0.015em]">
                  {f.title}
                </h3>
                <p className="mt-1 text-[13.5px] leading-[1.5] text-[var(--mkt-muted-warm)]">{f.body}</p>
              </div>
            ))}
            {/* Payments spotlight */}
            <div
              data-reveal
              className="rounded-[22px] bg-gradient-to-br from-[var(--mkt-forest-deep)] to-[var(--mkt-forest-deeper)] p-5 text-surface shadow-[0_30px_56px_-28px_rgba(13,29,22,0.5)]"
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
              <p className="mt-1 text-[13.5px] leading-[1.5] text-[var(--mkt-on-dark-muted)]">
                Card, Apple Pay, Google Pay, and PayTo, settled straight to your
                account. Connect Square if you already run one.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Shop teaser */}
      <ShopTeaser />

      {/* Why Prompt2Eat — real product capabilities. Deliberately NOT
          fabricated metrics or invented testimonials: those get added only
          when there are real numbers and consenting customers to cite. */}
      <section className="relative bg-gradient-to-b from-[var(--mkt-forest-deeper)] to-[var(--mkt-forest-darkest)] py-[clamp(72px,10vw,120px)]">
        <span className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(244,180,60,0.1),transparent)]" />
        <div className={`${CONTAINER} relative`}>
          <div className="text-center" data-reveal>
            <span className={`${eyebrow} text-[var(--color-accent)]`}>Why Prompt2Eat</span>
            <h2 className="mx-auto mt-3 max-w-[18ch] font-display text-[clamp(30px,4.4vw,52px)] font-extrabold tracking-[-0.03em] text-surface">
              One system, from craving to kitchen.
            </h2>
          </div>
          <div className="mt-14 grid gap-4 sm:grid-cols-3">
            {[
              {
                t: "Order in one scan",
                d: "Diners scan a QR code and just say what they feel like. The AI concierge finds the dish, sorts the sides, and sends it straight to the kitchen.",
              },
              {
                t: "Live in an afternoon",
                d: "Import your whole menu from a photo, set your brand, and go live. No POS migration and no new hardware to buy.",
              },
              {
                t: "Every way to pay",
                d: "Cards, Apple Pay, Google Pay, and PayTo pay-by-bank, taken on your storefront and settled to your own account.",
              },
            ].map((feature, i) => (
              <div
                key={feature.t}
                data-reveal
                data-delay={i * 80}
                className="rounded-[22px] border border-[rgba(247,243,234,0.1)] bg-[rgba(247,243,234,0.05)] p-6"
              >
                <p className="font-display text-lg font-extrabold text-surface">
                  {feature.t}
                </p>
                <p className="mt-2 text-base leading-[1.55] text-[var(--mkt-on-dark)]">
                  {feature.d}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="bg-gradient-to-b from-surface-elevated to-[var(--mkt-cream-soft)] py-[clamp(72px,10vw,128px)]">
        <div className={CONTAINER}>
          <div className="text-center" data-reveal>
            <span className={`${eyebrow} text-[var(--mkt-eyebrow)]`}>Pricing</span>
            <h2 className="mt-3 font-display text-[clamp(30px,4.4vw,52px)] font-extrabold tracking-[-0.03em]">
              Free for 30 days. No card.
            </h2>
          </div>
          <div className="mx-auto mt-12 grid max-w-[960px] items-stretch gap-4 sm:grid-cols-3">
            {PRICING_TIERS.map((tier, i) => {
              const price = tier.plan ? pricing[tier.plan] : undefined;
              const saving = price ? annualSavingPercent(price) : null;
              return (
              <div
                key={tier.name}
                data-reveal
                data-delay={i * 70}
                className={`flex flex-col rounded-[22px] p-6 ${
                  tier.featured
                    ? "relative border-2 border-[var(--color-accent)] bg-gradient-to-br from-[var(--mkt-forest-deep)] to-[var(--mkt-forest-deeper)] text-surface shadow-[0_30px_56px_-28px_rgba(13,29,22,0.5)]"
                    : "border border-[var(--mkt-line)] bg-surface-elevated"
                }`}
              >
                {tier.featured ? (
                  <span className="absolute -top-3 left-6 rounded-full bg-[var(--color-accent)] px-3 py-0.5 font-mono text-2xs font-bold uppercase tracking-wider text-forest">
                    Most popular
                  </span>
                ) : null}
                <span className={`${eyebrow} text-micro ${tier.featured ? "text-[var(--mkt-on-dark-muted)]" : "text-[var(--mkt-eyebrow)]"}`}>
                  {tier.name}
                </span>
                <p className="mt-3">
                  <span className={`font-display text-[44px] font-extrabold tracking-[-0.03em] ${tier.featured ? "text-[var(--color-accent)]" : ""}`}>
                    {price ? formatPlanAmount(price.monthlyCents, price.currency) : tier.fallbackPrice}
                  </span>{" "}
                  <span className={tier.featured ? "text-[var(--mkt-on-dark-muted)]" : "text-[var(--mkt-muted-warm)]"}>
                    {price ? "per month" : tier.fallbackNote}
                  </span>
                </p>
                <p className={`mt-3 text-sm ${tier.featured ? "text-[var(--mkt-on-dark-muted)]" : "text-[var(--mkt-muted-warm)]"}`}>
                  {tier.blurb}
                </p>
                {saving !== null ? (
                  <p className={`mt-2 text-xs font-semibold ${tier.featured ? "text-[var(--color-accent)]" : "text-[var(--mkt-eyebrow)]"}`}>
                    Save {saving}% paying annually
                  </p>
                ) : null}
                <Link
                  href="/signin"
                  className={`mt-6 rounded-xl px-4 py-3 text-center text-sm font-bold transition ${
                    tier.featured
                      ? "bg-[var(--color-accent)] text-forest hover:opacity-90"
                      : "border border-forest text-forest hover:bg-forest hover:text-surface"
                  }`}
                >
                  {tier.cta}
                </Link>
              </div>
              );
            })}
          </div>
          <p className="mx-auto mt-6 max-w-[720px] text-center text-sm text-[var(--mkt-muted-warm)]">
            Prices in {pricingCurrency}, billed through Stripe. Every plan includes the
            storefront, menu, checkout, kitchen board and table QR codes.
          </p>
        </div>
      </section>

      {/* FAQ — long-tail SEO section; answers mirror the FAQPage JSON-LD. */}
      <FaqSection />

      {/* Final CTA */}
      <section id="cta" className="bg-surface-elevated px-[clamp(18px,4vw,48px)] py-[clamp(48px,7vw,96px)]">
        <div className="relative mx-auto max-w-[1080px] overflow-hidden rounded-[32px] bg-[radial-gradient(120%_140%_at_85%_0%,#F6C258,#F4B43C_45%,#E79A24)] px-[clamp(28px,6vw,72px)] py-[clamp(48px,7vw,80px)] text-forest">
            <span className="pointer-events-none absolute -bottom-16 -left-10 h-64 w-64 rounded-full bg-[var(--mkt-forest-deeper)]/15 blur-2xl" />
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
                  className="min-w-0 flex-1 rounded-xl border border-forest/20 bg-white/70 px-4 py-3 text-base sm:text-sm text-forest placeholder:text-forest/50 focus-visible:outline-2 focus-visible:outline-[var(--color-forest)]"
                />
                <button
                  type="submit"
                  className="rounded-xl bg-forest px-5 py-3 text-sm font-bold text-surface transition hover:opacity-90"
                >
                  Start free →
                </button>
              </form>
              <p className="mt-3 text-[13px] text-forest/70">
                30-day trial. No credit card. Cancel anytime.
              </p>
            </div>
          </div>
      </section>

      {/* Footer */}
      </main>

      <footer className="bg-[var(--mkt-forest-darkest)] py-14 text-[var(--mkt-on-dark)]">
        <div className={CONTAINER}>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-6">
            <div className="lg:col-span-2">
              <div className="flex items-center gap-2">
                <Mark />
                <Wordmark className="text-lg text-surface" />
              </div>
              <p className="mt-3 max-w-[280px] text-sm text-[var(--mkt-on-dark-sage-bright)]">
                The AI-native way to order. Built for hospitality, loved by
                diners.
              </p>
            </div>
            {[
              {
                h: "Solutions",
                links: [
                  { label: "Cafés", href: "/for/cafes" },
                  { label: "Restaurants", href: "/for/restaurants" },
                  { label: "Bars & pubs", href: "/for/bars" },
                  { label: "Bakeries", href: "/for/bakeries" },
                  { label: "Food trucks", href: "/for/food-trucks" },
                ],
              },
              {
                h: "Product",
                links: [
                  { label: "Concierge", href: "#concierge" },
                  { label: "Pricing", href: "#pricing" },
                  { label: "FAQ", href: "#faq" },
                  { label: "Guides", href: "/learn" },
                  { label: "Shop", href: "/shop" },
                ],
              },
              // Careers has no page yet — kept an inert label, not a fake link.
              {
                h: "Company",
                links: [
                  { label: "About", href: "/about" },
                  { label: "Careers" },
                  { label: "Contact", href: "/contact" },
                ],
              },
              {
                h: "Legal",
                links: [
                  { label: "Privacy", href: "/privacy" },
                  { label: "Terms", href: "/terms" },
                ],
              },
            ].map((col) => (
              <div key={col.h}>
                <p className={`${eyebrow} text-micro text-[var(--mkt-on-dark-sage)]`}>{col.h}</p>
                <ul className="mt-3 space-y-2 text-sm font-medium">
                  {col.links.map((l) => (
                    <li key={l.label}>
                      {"href" in l && l.href ? (
                        <Link
                          href={l.href}
                          className="text-[var(--mkt-on-dark)] transition hover:text-surface"
                        >
                          {l.label}
                        </Link>
                      ) : (
                        <span className="cursor-default text-[var(--mkt-on-dark)]">{l.label}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-[rgba(247,243,234,0.08)] pt-6 text-sm text-[var(--mkt-on-dark-sage-bright)]">
            <span>© 2026 Prompt2Eat. All rights reserved.</span>
            {/* Removed rather than linked: three inert <span>s styled as social
                links read as a broken page (UI audit P2-9), and inventing
                profile URLs that may not exist would be worse. Re-add as real
                <a> elements when the accounts are live. */}
          </div>
        </div>
      </footer>
    </div>
  );
}

// The real brand mark (amber leaf + AI spark, from the logo kit) with the amber
// glow the old chip carried — sized for the nav/footer lockups.
function Mark() {
  return (
    <BrandMark className="h-[30px] w-[30px] shrink-0 rounded-lg shadow-[0_0_16px_rgba(244,180,60,0.35)]" />
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
        <span className="font-mono text-eyebrow font-bold uppercase tracking-[0.18em] text-[var(--mkt-eyebrow)]">
          {eb}
        </span>
        <h3 className="mt-2.5 font-display text-[clamp(24px,3vw,34px)] font-extrabold leading-[1.08] tracking-[-0.02em]">
          {title}
        </h3>
        <p className="mt-3 max-w-[440px] text-[15px] leading-[1.6] text-[var(--mkt-muted)]">{body}</p>
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
