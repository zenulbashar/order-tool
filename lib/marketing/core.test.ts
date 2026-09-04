import { describe, expect, it } from "vitest";

import {
  BODY_MAX,
  buildImagePrompt,
  buildVenueBrief,
  cleanCopy,
  HASHTAG_MAX,
  type MarketingVenue,
  parseMarketingDrafts,
  parseMarketingRequest,
  TOPIC_MAX,
} from "@/lib/marketing/core";

const venue: MarketingVenue = {
  name: "Test Cafe",
  venueType: "cafe",
  storefrontDescription: "Neighbourhood coffee and pies.",
  suburb: "West End",
  state: "QLD",
  storefrontUrl: "https://prompt2eat.com/test-cafe",
  instagramUrl: null,
  menuItems: ["Flat white", "Beef pie"],
};

describe("parseMarketingRequest", () => {
  it("accepts a full request and normalises the optional offer", () => {
    const result = parseMarketingRequest({
      goal: "special",
      tone: "warm",
      channels: ["instagram", "instagram", "sms"],
      topic: "  Friday   pie deal ",
      offer: "",
    });
    expect(result).toEqual({
      ok: true,
      request: {
        goal: "special",
        tone: "warm",
        channels: ["instagram", "sms"],
        topic: "Friday pie deal",
        offer: null,
      },
    });
  });

  it("rejects unknown goals, empty channels and a missing topic, in that order", () => {
    expect(parseMarketingRequest({ goal: "spam", tone: "warm", channels: ["sms"], topic: "x" })).toMatchObject({
      ok: false,
      error: { field: "goal" },
    });
    expect(parseMarketingRequest({ goal: "special", tone: "warm", channels: ["tiktok"], topic: "hi" })).toMatchObject({
      ok: false,
      error: { field: "channels" },
    });
    expect(parseMarketingRequest({ goal: "special", tone: "warm", channels: ["sms"], topic: "hi" })).toMatchObject({
      ok: false,
      error: { field: "topic" },
    });
  });

  it("caps the topic length", () => {
    const result = parseMarketingRequest({
      goal: "general",
      tone: "playful",
      channels: ["facebook"],
      topic: "a".repeat(TOPIC_MAX + 100),
    });
    expect(result.ok && result.request.topic.length).toBe(TOPIC_MAX);
  });
});

describe("buildVenueBrief / buildImagePrompt", () => {
  it("names real menu items and the ordering link, and forbids dishes when there are none", () => {
    expect(buildVenueBrief(venue)).toContain("Flat white; Beef pie");
    expect(buildVenueBrief(venue)).toContain("https://prompt2eat.com/test-cafe");
    expect(buildVenueBrief({ ...venue, menuItems: [] })).toContain("do not name dishes");
  });

  it("keeps text and logos out of the image prompt", () => {
    const prompt = buildImagePrompt(venue, {
      goal: "new_item",
      tone: "warm",
      channels: ["instagram"],
      topic: "new mango tart",
      offer: null,
    });
    expect(prompt).toContain("new mango tart");
    expect(prompt).toContain("No text");
  });
});

describe("parseMarketingDrafts", () => {
  it("returns one clean draft per requested channel, in request order", () => {
    const drafts = parseMarketingDrafts(
      {
        drafts: [
          { channel: "sms", headline: "", body: "Pies are $5 today — come by", hashtags: [] },
          { channel: "facebook", headline: "x", body: "not requested", hashtags: [] },
          {
            channel: "instagram",
            headline: "“Pie day”",
            body: "Hot pies.\n\n\n\nCome by.",
            hashtags: ["#WestEnd", "westend", "#Pie Day!", "x", ...Array(10).fill("#tag")],
          },
          { channel: "instagram", headline: "dupe", body: "dupe", hashtags: [] },
        ],
      },
      ["instagram", "sms"],
    );
    expect(drafts.map((d) => d.channel)).toEqual(["instagram", "sms"]);
    expect(drafts[0].headline).toBe("Pie day");
    expect(drafts[0].body).toBe("Hot pies.\n\nCome by.");
    expect(drafts[0].hashtags).toEqual(["#westend", "#pieday", "#tag"]);
    expect(drafts[0].hashtags.length).toBeLessThanOrEqual(HASHTAG_MAX);
    expect(drafts[1].body).toBe("Pies are $5 today, come by");
    expect(drafts[1].hashtags).toEqual([]);
  });

  it("clips bodies to the channel limit and drops empty ones", () => {
    const drafts = parseMarketingDrafts(
      {
        drafts: [
          { channel: "sms", headline: "", body: "a".repeat(1000), hashtags: [] },
          { channel: "email", headline: "s", body: "   ", hashtags: [] },
        ],
      },
      ["sms", "email"],
    );
    expect(drafts).toHaveLength(1);
    expect(drafts[0].body).toHaveLength(BODY_MAX.sms);
    expect(parseMarketingDrafts(null, ["sms"])).toEqual([]);
  });

  it("cleanCopy strips dashes and wrapping quotes", () => {
    expect(cleanCopy("“Fresh — daily”", 100)).toBe("Fresh, daily");
  });
});
