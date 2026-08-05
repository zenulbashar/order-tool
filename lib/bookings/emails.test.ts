import { describe, expect, it } from "vitest";

import {
  renderBookingConfirmationEmail,
  renderOwnerBookingEmail,
} from "./emails";

/**
 * The booking emails. Both carry USER-SUPPLIED text — the venue name, the
 * diner's name, and a free-text note — straight into HTML, so escaping is the
 * property that matters most here. The rest is making sure the two emails
 * actually say the four things a reader needs.
 */
const BASE = {
  venueName: "Corner Cafe",
  timeZone: "Australia/Brisbane",
  customerName: "Sam Rivera",
  partySize: 4,
  // 04:00 UTC == 14:00 Brisbane.
  bookedFor: new Date("2026-08-10T04:00:00.000Z"),
  notes: null,
  manageUrl: "https://prompt2eat.com/corner-cafe/book/tok123",
};

describe("renderBookingConfirmationEmail", () => {
  it("leads with the venue and the time in the subject", () => {
    const mail = renderBookingConfirmationEmail({
      ...BASE,
      brandColor: "#2E7D5B",
      logoUrl: null,
    });
    expect(mail.subject).toContain("Corner Cafe");
    // Rendered in the VENUE timezone, not the server's.
    expect(mail.subject).toMatch(/2:00\s?pm/i);
  });

  it("states the party size in words a person reads", () => {
    const mail = renderBookingConfirmationEmail({
      ...BASE,
      brandColor: "#2E7D5B",
      logoUrl: null,
    });
    expect(mail.text).toContain("4 people");
    expect(mail.html).toContain("4 people");
  });

  it("singularises a party of one", () => {
    const mail = renderBookingConfirmationEmail({
      ...BASE,
      partySize: 1,
      brandColor: "#2E7D5B",
      logoUrl: null,
    });
    expect(mail.text).toContain("1 person");
    expect(mail.text).not.toContain("1 people");
  });

  it("carries the cancel link in both parts", () => {
    const mail = renderBookingConfirmationEmail({
      ...BASE,
      brandColor: "#2E7D5B",
      logoUrl: null,
    });
    expect(mail.html).toContain(BASE.manageUrl);
    expect(mail.text).toContain(BASE.manageUrl);
  });

  it("ESCAPES user text so a note cannot inject markup", () => {
    const mail = renderBookingConfirmationEmail({
      ...BASE,
      customerName: '<script>alert("x")</script>',
      notes: '<img src=x onerror="alert(1)">',
      brandColor: "#2E7D5B",
      logoUrl: null,
    });
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).not.toContain("<img src=x");
    expect(mail.html).toContain("&lt;");
  });

  it("omits the note row entirely when there is no note", () => {
    const mail = renderBookingConfirmationEmail({
      ...BASE,
      brandColor: "#2E7D5B",
      logoUrl: null,
    });
    expect(mail.html).not.toContain("Your note");
    expect(mail.text).not.toContain("Note:");
  });
});

describe("renderOwnerBookingEmail", () => {
  const OWNER = {
    ...BASE,
    dashboardUrl: "https://prompt2eat.com/dashboard/bookings",
    phone: "+61400000000",
  };

  it("puts the decision-making facts in the subject", () => {
    // Read on a phone mid-service: party size and time, before anything else.
    const mail = renderOwnerBookingEmail(OWNER);
    expect(mail.subject).toContain("4 people");
    expect(mail.subject).toMatch(/2:00\s?pm/i);
  });

  it("includes the diner's phone when given, and omits the row when not", () => {
    expect(renderOwnerBookingEmail(OWNER).text).toContain("+61400000000");
    const noPhone = renderOwnerBookingEmail({ ...OWNER, phone: null });
    expect(noPhone.text).not.toContain("Phone");
  });

  it("surfaces the diner's note, which is why it was collected", () => {
    const mail = renderOwnerBookingEmail({
      ...OWNER,
      notes: "Nut allergy",
    });
    expect(mail.text).toContain("Nut allergy");
    expect(mail.html).toContain("Nut allergy");
  });

  it("ESCAPES user text", () => {
    const mail = renderOwnerBookingEmail({
      ...OWNER,
      customerName: "<b>bold</b>",
      notes: "<script>x</script>",
    });
    expect(mail.html).not.toContain("<b>bold</b>");
    expect(mail.html).not.toContain("<script>");
  });
});
