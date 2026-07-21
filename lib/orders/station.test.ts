import { describe, expect, it } from "vitest";

import {
  buildStationLabels,
  formatStationTag,
  normaliseStationCode,
  resolveStation,
  splitByStation,
} from "./station";

describe("resolveStation", () => {
  it("honours an explicit override over category detection", () => {
    expect(resolveStation("counter", "Burgers")).toBe("counter");
    expect(resolveStation("kitchen", "Cocktails")).toBe("kitchen");
  });

  it("auto-detects drinks by category name (whole word / phrase)", () => {
    expect(resolveStation("auto", "Hot Drinks")).toBe("counter");
    expect(resolveStation("auto", "Wine List")).toBe("counter");
    expect(resolveStation("auto", "Coffee & Tea")).toBe("counter");
    expect(resolveStation("auto", "Soft Drink")).toBe("counter");
  });

  it("does not false-match a keyword hidden inside a food word", () => {
    expect(resolveStation("auto", "Steak")).toBe("kitchen"); // "tea" inside steak
    expect(resolveStation("auto", "Barramundi")).toBe("kitchen"); // "bar"
  });

  it("defaults unknown/missing categories to the kitchen", () => {
    expect(resolveStation("auto", "Burgers")).toBe("kitchen");
    expect(resolveStation("auto", null)).toBe("kitchen");
    expect(resolveStation(null, undefined)).toBe("kitchen");
  });
});

describe("splitByStation", () => {
  it("partitions lines into kitchen/counter, preserving order", () => {
    const items = [
      { id: "a", station: "kitchen" as const },
      { id: "b", station: "counter" as const },
      { id: "c", station: "kitchen" as const },
    ];
    const { kitchen, counter } = splitByStation(items);
    expect(kitchen.map((i) => i.id)).toEqual(["a", "c"]);
    expect(counter.map((i) => i.id)).toEqual(["b"]);
  });
});

describe("buildStationLabels", () => {
  const stations = [
    { id: "k", name: "Kebab", code: "K" },
    { id: "g", name: "Grill", code: "G" },
  ];

  it("labels each station with its lines and the +N other-pieces tally", () => {
    const items = [
      { stationId: "k", quantity: 1 },
      { stationId: "g", quantity: 2 },
      { stationId: null, quantity: 1 }, // unrouted → only in the tally
    ];
    const labels = buildStationLabels(items, stations);
    expect(labels).toHaveLength(2);
    const kebab = labels.find((l) => l.station.id === "k")!;
    expect(kebab.items).toHaveLength(1);
    expect(kebab.otherItemCount).toBe(3); // 2 grill + 1 unrouted
  });

  it("omits stations with no lines in the order", () => {
    const labels = buildStationLabels([{ stationId: "k", quantity: 1 }], stations);
    expect(labels.map((l) => l.station.id)).toEqual(["k"]);
  });

  it("counts a null/zero quantity as one piece", () => {
    const labels = buildStationLabels(
      [
        { stationId: "k", quantity: null },
        { stationId: "g", quantity: 0 },
      ],
      stations,
    );
    const kebab = labels.find((l) => l.station.id === "k")!;
    expect(kebab.otherItemCount).toBe(1); // the grill line counts as 1 piece
  });
});

describe("formatStationTag", () => {
  it("joins the daily number and uppercased code", () => {
    expect(formatStationTag(42, "k")).toBe("42-K");
  });

  it("stands the code alone when there is no daily number", () => {
    expect(formatStationTag(null, "k")).toBe("K");
    expect(formatStationTag(undefined, "gr")).toBe("GR");
  });
});

describe("normaliseStationCode", () => {
  it("keeps letters/digits, uppercases, and caps at 3 chars", () => {
    expect(normaliseStationCode("k-1!", "Kebab")).toBe("K1");
    expect(normaliseStationCode("grill", "Grill")).toBe("GRI");
  });

  it("falls back to the name's first alphanumeric when the code cleans to empty", () => {
    expect(normaliseStationCode("!!!", "Kebab")).toBe("K");
    expect(normaliseStationCode("", "7 Grill")).toBe("7");
  });

  it("returns empty only when neither code nor name has an alphanumeric", () => {
    expect(normaliseStationCode("!!!", "###")).toBe("");
  });
});
