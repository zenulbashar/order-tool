import { OPENING_DAYS } from "@/lib/validation";

import { BrandTile } from "./storefront-hero";
import type { PublicVenue } from "./types";

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

export function StorefrontFooter({ venue }: { venue: PublicVenue }) {
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
      <div className="mx-auto grid max-w-[1280px] gap-10 px-6 py-12 sm:grid-cols-2 lg:grid-cols-3">
        {/* Brand + about */}
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <BrandTile
              venue={venue}
              sizeClass="h-11 w-11"
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
          {venue.instagramUrl ? (
            <a
              href={venue.instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-ink transition hover:opacity-70"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                aria-hidden="true"
                className="h-5 w-5"
              >
                <rect x="3" y="3" width="18" height="18" rx="5" />
                <circle cx="12" cy="12" r="4" />
                <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
              </svg>
              Follow us
            </a>
          ) : null}
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
        <p className="mx-auto max-w-[1280px] text-center text-xs text-label sm:text-left">
          Powered by Prompt2Eat
        </p>
      </div>
    </footer>
  );
}
