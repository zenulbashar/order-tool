import { describe, expect, it } from "vitest";

import {
  buildScoreDropEmail,
  detectScoreDrop,
  isDueForScheduledAudit,
  SCHEDULED_AUDIT_INTERVAL_MS,
  SCORE_DROP_THRESHOLD,
} from "@/lib/seo-audit-schedule-core";

const NOW = Date.UTC(2026, 8, 4, 3, 30);

describe("isDueForScheduledAudit", () => {
  it("is due when the venue has never been audited", () => {
    expect(isDueForScheduledAudit(null, NOW)).toBe(true);
  });

  it("is due exactly at the interval and not one millisecond before", () => {
    const boundary = new Date(NOW - SCHEDULED_AUDIT_INTERVAL_MS);
    expect(isDueForScheduledAudit(boundary, NOW)).toBe(true);
    expect(isDueForScheduledAudit(new Date(boundary.getTime() + 1), NOW)).toBe(false);
  });
});

describe("detectScoreDrop", () => {
  const issues = [{ title: "A" }, { title: "B" }, { title: "C" }, { title: "D" }];

  it("never nudges on the first run", () => {
    expect(detectScoreDrop("seo", null, { score: 10, band: "poor", issues })).toBeNull();
  });

  it("nudges at the threshold and stays quiet one point under it", () => {
    const previous = { score: 80, band: "good" };
    expect(
      detectScoreDrop("seo", previous, { score: 80 - SCORE_DROP_THRESHOLD, band: "good", issues }),
    ).not.toBeNull();
    expect(
      detectScoreDrop("seo", previous, { score: 80 - SCORE_DROP_THRESHOLD + 1, band: "good", issues }),
    ).toBeNull();
  });

  it("nudges on a band fall even when the points fall is small", () => {
    const drop = detectScoreDrop(
      "aeo",
      { score: 70, band: "good" },
      { score: 68, band: "ok", issues },
    );
    expect(drop).toMatchObject({ kind: "aeo", previousScore: 70, currentScore: 68 });
  });

  it("ignores improvements and flat runs, and quotes only the top issues", () => {
    expect(
      detectScoreDrop("seo", { score: 50, band: "ok" }, { score: 72, band: "good", issues }),
    ).toBeNull();
    expect(
      detectScoreDrop("seo", { score: 50, band: "ok" }, { score: 50, band: "ok", issues }),
    ).toBeNull();
    const drop = detectScoreDrop(
      "seo",
      { score: 50, band: "ok" },
      { score: 20, band: "poor", issues },
    );
    expect(drop?.topIssues).toEqual(["A", "B", "C"]);
  });
});

describe("buildScoreDropEmail", () => {
  it("names the venue, both scores, the issues, and the studio link", () => {
    const email = buildScoreDropEmail({
      venueName: "Test Cafe",
      drops: [
        {
          kind: "seo",
          previousScore: 82,
          currentScore: 61,
          previousBand: "good",
          currentBand: "ok",
          topIssues: ["Opening hours missing"],
        },
      ],
      studioUrl: "https://prompt2eat.com/dashboard/seo",
    });
    expect(email.subject).toBe("Test Cafe: your SEO score dropped");
    expect(email.text).toContain("82 → 61");
    expect(email.text).toContain("Opening hours missing");
    expect(email.text).toContain("https://prompt2eat.com/dashboard/seo");
  });

  it("lists both kinds in the subject when both fell", () => {
    const drop = {
      previousScore: 80,
      currentScore: 60,
      previousBand: "good",
      currentBand: "ok",
      topIssues: [],
    };
    const email = buildScoreDropEmail({
      venueName: "Test Cafe",
      drops: [
        { kind: "seo", ...drop },
        { kind: "aeo", ...drop },
      ],
      studioUrl: "https://x/dashboard/seo",
    });
    expect(email.subject).toContain("SEO and AEO");
  });
});
