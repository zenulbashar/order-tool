import type { ReactNode } from "react";

import { OPENING_DAYS } from "@/lib/validation";

import { BrandTile } from "./storefront-hero";
import type { PublicFaq, PublicVenue } from "./types";

/**
 * Storefront footer (end of the page): the venue logo + name, an About blurb,
 * opening hours, and location/contact — only the fields the owner actually filled
 * in (never fabricated). Neutral cream surface + ink text so it stays inside the
 * two-colour venue theme; the small "Powered by Prompt2Eat" is the ONLY
 * platform mark here. Plain component (no client APIs) so it renders inside the
 * client storefront. The header's About/Contact links scroll to `#storefront-footer`.
 */
function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map((n) => Number(n));
  if (Number.isNaN(h)) return hhmm;
  const period = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${String(m).padStart(2, "0")}${period}` : `${h12}${period}`;
}

export function StorefrontFooter({
  venue,
  faqs = [],
}: {
  venue: PublicVenue;
  faqs?: PublicFaq[];
}) {
  const hours = venue.openingHours ?? [];
  const byDay = new Map(hours.map((entry) => [entry.day, entry]));
  const hasHours = hours.length > 0;

  const cityLine = [venue.suburb, venue.state, venue.postcode]
    .filter(Boolean)
    .join(" ");
  const addressLines = [venue.streetAddress, cityLine, venue.country].filter(
    (line): line is string => Boolean(line && line.trim()),
  );
  const hasAddress = addressLines.length > 0;

  const mapsQuery =
    venue.latitude != null && venue.longitude != null
      ? `${venue.latitude},${venue.longitude}`
      : hasAddress
        ? [venue.name, ...addressLines].join(", ")
        : null;

  return (
    <footer
      id="storefront-footer"
      className="scroll-mt-[124px] border-t border-line bg-surface-elevated"
    >
      {/* FAQs — visible content that mirrors the FAQPage JSON-LD emitted on the
          storefront (Google requires FAQ markup to match what's on the page). */}
      {faqs.length > 0 ? (
        <div className="border-b border-line">
          <div className="mx-auto max-w-[1440px] 2xl:max-w-[1680px] px-6 py-12">
            <h2 className="font-mono text-[10px] font-bold uppercase tracking-wider text-label">
              Frequently asked
            </h2>
            <div className="mt-4 grid gap-x-10 gap-y-1 md:grid-cols-2">
              {faqs.map((faq) => (
                <details
                  key={faq.question}
                  className="group border-b border-line/60 py-3"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
                    {faq.question}
                    <span
                      aria-hidden="true"
                      className="shrink-0 text-muted transition group-open:rotate-45"
                    >
                      +
                    </span>
                  </summary>
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    {faq.answer}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </div>
      ) : null}
      <div className="mx-auto grid max-w-[1440px] 2xl:max-w-[1680px] gap-10 px-6 py-12 sm:grid-cols-2 lg:grid-cols-3">
        {/* Brand + about */}
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <BrandTile
              venue={venue}
              heightClass="h-12"
              maxWClass="max-w-[200px]"
              radiusClass="rounded-[12px]"
              textClass="text-lg"
            />
            <span className="font-display text-lg font-semibold tracking-tight text-ink">
              {venue.name}
            </span>
          </div>
          {venue.storefrontDescription ? (
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">
              {venue.storefrontDescription}
            </p>
          ) : null}
          <SocialRow venue={venue} />
        </div>

        {/* Opening hours */}
        {hasHours ? (
          <div className="min-w-0">
            <h2 className="font-mono text-[10px] font-bold uppercase tracking-wider text-label">
              Opening hours
            </h2>
            <dl className="mt-3 space-y-1.5 text-sm">
              {OPENING_DAYS.map(({ label, day }) => {
                const entry = byDay.get(day);
                return (
                  <div
                    key={day}
                    className="flex items-center justify-between gap-4"
                  >
                    <dt className="text-muted">{label}</dt>
                    <dd className="text-ink">
                      {entry
                        ? `${formatTime(entry.opens)} – ${formatTime(entry.closes)}`
                        : "Closed"}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </div>
        ) : null}

        {/* Location + contact */}
        {hasAddress || venue.phone ? (
          <div className="min-w-0">
            <h2 className="font-mono text-[10px] font-bold uppercase tracking-wider text-label">
              Find us
            </h2>
            {hasAddress ? (
              <address className="mt-3 whitespace-pre-line text-sm not-italic leading-relaxed text-muted">
                {addressLines.join("\n")}
              </address>
            ) : null}
            {mapsQuery ? (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-sm font-medium underline"
                style={{ color: "var(--action)" }}
              >
                Get directions
              </a>
            ) : null}
            {venue.phone ? (
              <p className="mt-3 text-sm">
                <a
                  href={`tel:${venue.phone.replace(/\s+/g, "")}`}
                  className="font-medium text-ink underline"
                >
                  {venue.phone}
                </a>
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="border-t border-line px-6 py-4">
        <p className="mx-auto max-w-[1440px] 2xl:max-w-[1680px] text-center text-xs text-label sm:text-left">
          Powered by Prompt2Eat
        </p>
      </div>
    </footer>
  );
}

/**
 * The "Follow us" row: one icon link per social profile the owner filled in.
 * Renders nothing when no links are set (never a fabricated handle). Order is
 * stable; each link opens in a new tab and is labelled for screen readers.
 */
function SocialRow({ venue }: { venue: PublicVenue }) {
  const entries: { url: string | null; label: string; icon: ReactNode }[] = [
    { url: venue.instagramUrl, label: "Instagram", icon: <IgIcon /> },
    { url: venue.facebookUrl, label: "Facebook", icon: <FbIcon /> },
    { url: venue.xUrl, label: "X", icon: <XIcon /> },
    { url: venue.youtubeUrl, label: "YouTube", icon: <YtIcon /> },
    { url: venue.tiktokUrl, label: "TikTok", icon: <TtIcon /> },
    { url: venue.linkedinUrl, label: "LinkedIn", icon: <LiIcon /> },
    { url: venue.websiteUrl, label: "Website", icon: <WebIcon /> },
  ];
  const links = entries.filter(
    (link): link is { url: string; label: string; icon: ReactNode } =>
      Boolean(link.url),
  );

  if (links.length === 0) return null;

  return (
    <div className="mt-4">
      <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-label">
        Follow us
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {links.map((link) => (
          <a
            key={link.label}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={link.label}
            title={link.label}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-ink transition hover:border-muted/50 hover:opacity-70"
          >
            {link.icon}
          </a>
        ))}
      </div>
    </div>
  );
}

/* — social glyphs (24×24). Brand marks use fill; the website uses a stroke globe. */
function IgIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      aria-hidden="true"
      className="h-[18px] w-[18px]"
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
function FbIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-[18px] w-[18px]">
      <path d="M13.5 21v-7.3h2.4l.4-2.9h-2.8V8.9c0-.8.2-1.4 1.4-1.4h1.5V4.9c-.3 0-1.2-.1-2.2-.1-2.1 0-3.6 1.3-3.6 3.7v2.1H8.2v2.9h2.4V21h2.9z" />
    </svg>
  );
}
function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-[16px] w-[16px]">
      <path d="M17.5 3h3l-6.6 7.5L21.8 21h-6l-4.3-5.6L6.5 21h-3l7-8L2.5 3h6.1l3.9 5.2L17.5 3zm-1.1 16.2h1.7L7.7 4.7H5.9l10.5 14.5z" />
    </svg>
  );
}
function YtIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-[18px] w-[18px]">
      <path d="M22 8.2a3 3 0 0 0-2.1-2.1C18 5.6 12 5.6 12 5.6s-6 0-7.9.5A3 3 0 0 0 2 8.2 31 31 0 0 0 1.7 12 31 31 0 0 0 2 15.8a3 3 0 0 0 2.1 2.1c1.9.5 7.9.5 7.9.5s6 0 7.9-.5A3 3 0 0 0 22 15.8 31 31 0 0 0 22.3 12 31 31 0 0 0 22 8.2zM10 15V9l5.2 3L10 15z" />
    </svg>
  );
}
function TtIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-[17px] w-[17px]">
      <path d="M16.5 3c.3 2 1.5 3.6 3.5 3.9v2.6c-1.3.1-2.5-.3-3.6-1v5.9a5.4 5.4 0 1 1-5.4-5.4c.3 0 .5 0 .8.1v2.7a2.8 2.8 0 1 0 2 2.6V3h2.7z" />
    </svg>
  );
}
function LiIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-[17px] w-[17px]">
      <path d="M6.9 8.6H4.2V20h2.7V8.6zM5.5 4A1.6 1.6 0 1 0 5.5 7.2 1.6 1.6 0 0 0 5.5 4zM20 20v-6.3c0-3.1-1.7-4.6-3.9-4.6-1.8 0-2.6 1-3 1.7V8.6H10.4V20h2.7v-6.1c0-.3 0-.6.1-.8.3-.6.8-1.2 1.7-1.2 1.2 0 1.7 1 1.7 2.3V20H20z" />
    </svg>
  );
}
function WebIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      aria-hidden="true"
      className="h-[18px] w-[18px]"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.4 2.5 2.4 15 0 18M12 3c-2.4 2.5-2.4 15 0 18" />
    </svg>
  );
}
