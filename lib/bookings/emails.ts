import {
  brandTileHtml,
  escHtml,
  readableHexOn,
  safeBrandHex,
} from "@/lib/customer/email-brand";
import { formatVenueTime } from "@/lib/time";

/**
 * The two booking emails, built as pure render functions so both can be asserted
 * without sending anything.
 *
 * The DINER email wears the VENUE's identity (brand colour, venue logo, venue
 * name) — the diner booked a table at that café, not at Prompt2Eat. This is the
 * same owner-diner firewall the order emails already follow.
 *
 * The OWNER email is deliberately plain. It is an operational alert read on a
 * phone mid-service, so it leads with the four facts that decide what happens
 * next — when, how many, who, and any note — and nothing else competes with them.
 *
 * Everything interpolated is user data (venue name, diner name, free-text note),
 * so everything is escaped.
 */

export type BookingEmailInput = {
  venueName: string;
  timeZone: string;
  customerName: string;
  partySize: number;
  bookedFor: Date;
  notes: string | null;
  /** Diner-facing link to view or cancel. */
  manageUrl: string;
};

export type RenderedEmail = { subject: string; html: string; text: string };

function firstNameOf(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName.trim();
}

function peopleLabel(partySize: number): string {
  return partySize === 1 ? "1 person" : `${partySize} people`;
}

/** Diner's confirmation. Venue-branded. */
export function renderBookingConfirmationEmail(
  opts: BookingEmailInput & { brandColor: string; logoUrl: string | null },
): RenderedEmail {
  const brand = safeBrandHex(opts.brandColor);
  const onBrand = readableHexOn(brand);
  const venue = escHtml(opts.venueName);
  const when = formatVenueTime(opts.bookedFor, opts.timeZone);
  const first = escHtml(firstNameOf(opts.customerName));
  const party = peopleLabel(opts.partySize);

  const subject = `Your table at ${opts.venueName} — ${when}`;

  const noteHtml = opts.notes
    ? `<tr><td style="padding:6px 0;color:#5b6b62;font-size:14px;">Your note</td><td style="padding:6px 0;text-align:right;color:#16241c;font-size:14px;">${escHtml(opts.notes)}</td></tr>`
    : "";

  const html = `<div style="margin:0;padding:24px;background:#f7f3ea;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#fffdf8;border-radius:16px;overflow:hidden;border:1px solid #e6ded0;">
    <div style="padding:20px 24px;border-bottom:1px solid #e6ded0;">
      ${brandTileHtml(opts.venueName, brand, onBrand, opts.logoUrl)}
    </div>
    <div style="padding:24px;">
      <h1 style="margin:0 0 8px;font-size:20px;color:#16241c;">You're booked in, ${first}</h1>
      <p style="margin:0 0 20px;color:#5b6b62;font-size:15px;line-height:1.5;">
        We've saved you a table at ${venue}. Nothing else to do — just come in and mention your name.
      </p>
      <table role="presentation" style="width:100%;border-collapse:collapse;border-top:1px solid #e6ded0;">
        <tr><td style="padding:10px 0;color:#5b6b62;font-size:14px;">When</td><td style="padding:10px 0;text-align:right;color:#16241c;font-size:15px;font-weight:600;">${escHtml(when)}</td></tr>
        <tr><td style="padding:6px 0;color:#5b6b62;font-size:14px;">Party</td><td style="padding:6px 0;text-align:right;color:#16241c;font-size:14px;">${party}</td></tr>
        <tr><td style="padding:6px 0;color:#5b6b62;font-size:14px;">Name</td><td style="padding:6px 0;text-align:right;color:#16241c;font-size:14px;">${escHtml(opts.customerName)}</td></tr>
        ${noteHtml}
      </table>
      <a href="${escHtml(opts.manageUrl)}" style="display:inline-block;margin-top:22px;padding:12px 20px;border-radius:10px;background:${brand};color:${onBrand};text-decoration:none;font-weight:700;font-size:15px;">View or cancel this booking</a>
      <p style="margin:18px 0 0;color:#8a978f;font-size:12px;line-height:1.5;">
        Plans changed? Please cancel using the link above so we can give the table to someone else.
      </p>
    </div>
  </div>
</div>`;

  const text = [
    `You're booked in, ${firstNameOf(opts.customerName)}`,
    ``,
    `We've saved you a table at ${opts.venueName}.`,
    ``,
    `When:  ${when}`,
    `Party: ${party}`,
    `Name:  ${opts.customerName}`,
    ...(opts.notes ? [`Note:  ${opts.notes}`] : []),
    ``,
    `View or cancel: ${opts.manageUrl}`,
    ``,
    `Plans changed? Please cancel using the link above so we can give the table to someone else.`,
  ].join("\n");

  return { subject, html, text };
}

/** Owner's operational alert. Plain by design. */
export function renderOwnerBookingEmail(
  opts: BookingEmailInput & { dashboardUrl: string; phone: string | null },
): RenderedEmail {
  const when = formatVenueTime(opts.bookedFor, opts.timeZone);
  const party = peopleLabel(opts.partySize);
  const subject = `New booking — ${party}, ${when}`;

  const rows: [string, string][] = [
    ["When", when],
    ["Party", party],
    ["Name", opts.customerName],
    ...(opts.phone ? ([["Phone", opts.phone]] as [string, string][]) : []),
    ...(opts.notes ? ([["Note", opts.notes]] as [string, string][]) : []),
  ];

  const rowHtml = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#5b6b62;font-size:14px;white-space:nowrap;">${escHtml(label)}</td><td style="padding:6px 0;color:#16241c;font-size:15px;font-weight:600;">${escHtml(value)}</td></tr>`,
    )
    .join("");

  const html = `<div style="margin:0;padding:24px;background:#f7f3ea;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#fffdf8;border-radius:16px;padding:24px;border:1px solid #e6ded0;">
    <h1 style="margin:0 0 4px;font-size:18px;color:#16241c;">New table booking</h1>
    <p style="margin:0 0 18px;color:#5b6b62;font-size:14px;">${escHtml(opts.venueName)}</p>
    <table role="presentation" style="border-collapse:collapse;">${rowHtml}</table>
    <a href="${escHtml(opts.dashboardUrl)}" style="display:inline-block;margin-top:20px;padding:10px 18px;border-radius:10px;background:#16241c;color:#f7f3ea;text-decoration:none;font-weight:700;font-size:14px;">Open bookings</a>
  </div>
</div>`;

  const text = [
    `New table booking — ${opts.venueName}`,
    ``,
    ...rows.map(([label, value]) => `${label.padEnd(6)} ${value}`),
    ``,
    `Open bookings: ${opts.dashboardUrl}`,
  ].join("\n");

  return { subject, html, text };
}
