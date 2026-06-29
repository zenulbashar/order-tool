import Link from "next/link";

import { getTablesForVenue } from "@/app/dashboard/tables/queries";
import { tableDeepLink, tableQrSvg } from "@/lib/qr";
import { requireUser, requireVenue } from "@/lib/tenant";
import { getBaseUrl } from "@/lib/url";

import { WizardProgress } from "../_components/wizard-progress";
import { finishOnboarding } from "./actions";
import { CopyLink } from "./copy-link";

// Builds absolute URLs + QR SVGs server-side; never prerendered.
export const dynamic = "force-dynamic";

export default async function LiveStepPage() {
  await requireUser();
  // No venue -> requireVenue redirects to /onboarding, which routes to Step 1.
  const venue = await requireVenue();

  const [tables, baseUrl] = await Promise.all([
    getTablesForVenue(venue.id),
    getBaseUrl(),
  ]);
  const storefrontUrl = `${baseUrl}/${venue.slug}`;

  // Reuse the existing table-QR helpers (no new QR code). Built server-side from
  // server-constructed deep-links, exactly as the dashboard tables sheet does.
  const tableCells = await Promise.all(
    tables.map(async (table) => ({
      id: table.id,
      label: table.label,
      svg: await tableQrSvg(tableDeepLink(baseUrl, venue.slug, table.label)),
    })),
  );

  return (
    <div className="space-y-6">
      <WizardProgress current={5} />
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
          You are ready to go live
        </h1>
        <p className="text-sm text-muted">
          Share your storefront link and put QR codes on your tables. You can
          change anything later from your dashboard.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-ink">Your storefront link</p>
        <CopyLink url={storefrontUrl} />
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium text-ink">Table QR codes</p>
        {tableCells.length > 0 ? (
          <div className="grid grid-cols-3 gap-3">
            {tableCells.map((cell) => (
              <div
                key={cell.id}
                className="flex flex-col items-center gap-1 rounded-lg border border-sand p-3 text-center"
              >
                <span
                  className="w-full max-w-[120px] [&_svg]:h-auto [&_svg]:w-full"
                  // QR SVG built server-side from a server-constructed URL (no
                  // user markup); qrcode emits deterministic, script-free SVG.
                  dangerouslySetInnerHTML={{ __html: cell.svg }}
                />
                <span className="text-xs text-muted">{cell.label}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">
            No tables yet.{" "}
            <Link
              href="/dashboard/tables"
              className="font-medium text-forest underline"
            >
              Set up tables
            </Link>{" "}
            to print QR codes for dine-in ordering.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-3 border-t border-sand pt-4">
        <form action={finishOnboarding}>
          <button
            type="submit"
            className="rounded-md bg-forest px-4 py-2 text-sm font-medium text-surface-elevated transition hover:bg-forest-deep"
          >
            Go to dashboard
          </button>
        </form>
        <Link
          href={`/${venue.slug}`}
          target="_blank"
          className="rounded-md border border-sand px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface"
        >
          Visit storefront
        </Link>
      </div>
    </div>
  );
}
