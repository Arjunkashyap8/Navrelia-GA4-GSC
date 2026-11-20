import { describe, expect, it } from "vitest";
import { bucketSeries, bucketStart } from "./buckets";

describe("bucketStart", () => {
  it("weeks start Monday, months and quarters start on the 1st", () => {
    expect(bucketStart("2026-11-18", "week")).toBe("2026-11-16"); // Wed → Mon
    expect(bucketStart("2026-11-16", "week")).toBe("2026-11-16");
    expect(bucketStart("2026-11-22", "week")).toBe("2026-11-16"); // Sun → Mon
    expect(bucketStart("2026-11-18", "month")).toBe("2026-11-01");
    expect(bucketStart("2026-11-18", "quarter")).toBe("2026-10-01");
    expect(bucketStart("2026-02-10", "quarter")).toBe("2026-01-01");
  });
});

describe("bucketSeries", () => {
  const s = {
    dates: ["2026-11-14", "2026-11-15", "2026-11-16", "2026-11-17"], // Sat, Sun, Mon, Tue
    cur: { clicks: [1, 2, 3, 4], impressions: [10, 10, 100, 0], ctr: [0.1, 0.2, 0.03, 0], position: [5, 7, 2, 0] },
    prev: { clicks: [0, 1, 1, 1], impressions: [5, 5, 5, 5], ctr: [0, 0.2, 0.2, 0.2], position: [3, 3, 3, 3] },
  };
  it("sums, recomputes ratios and impression-weights positions", () => {
    const b = bucketSeries(s, "week", { ratios: { ctr: ["clicks", "impressions"] }, weighted: { position: "impressions" } });
    expect(b.dates).toEqual(["2026-11-14", "2026-11-16"]); // first bucket labelled with the range start
    expect(b.cur.clicks).toEqual([3, 7]);
    expect(b.cur.ctr[0]).toBeCloseTo(3 / 20);
    expect(b.cur.ctr[1]).toBeCloseTo(7 / 100);
    expect(b.cur.position[0]).toBeCloseTo((5 * 10 + 7 * 10) / 20);
    expect(b.cur.position[1]).toBeCloseTo(2); // zero-position day ignored
    expect(b.prev!.clicks).toEqual([1, 2]); // comparison grouped by the same indices
  });
  it("leaves daily series untouched", () => {
    expect(bucketSeries(s, "day")).toBe(s);
  });
});
