import { describe, expect, it } from "vitest";
import {
  benchmarkCtr,
  calibrationScale,
  clickGainAtPosition,
  clickGainFromCtr,
  expectedCtr,
} from "./ctr-curve";
import { computeDelta, contributions, projectMonthEnd, ratio } from "./delta";
import { classifyIntent } from "./intent";
import { directoryOf, groupOf, normalizePath } from "./url";

describe("classifyIntent", () => {
  const brand = ["navrelia"];
  it("tags intents by rule priority", () => {
    expect(classifyIntent("navrelia ghee", brand)).toBe("navigational");
    expect(classifyIntent("a2 ghee price 1 kg", brand)).toBe("transactional");
    expect(classifyIntent("best a2 ghee brand in india", brand)).toBe("commercial");
    expect(classifyIntent("ghee ke fayde", brand)).toBe("informational");
    expect(classifyIntent("how to make ghee at home", brand)).toBe("informational");
    expect(classifyIntent("bilona ghee", brand)).toBe("informational");
  });
});

describe("computeDelta", () => {
  it("computes abs and pct", () => {
    const d = computeDelta(120, 100);
    expect(d.abs).toBe(20);
    expect(d.pct).toBeCloseTo(0.2);
    expect(d.direction).toBe("up");
    expect(d.sentiment).toBe("good");
  });
  it("is direction-aware for down_good metrics", () => {
    expect(computeDelta(8.2, 9.1, "down_good").sentiment).toBe("good"); // position improved
    expect(computeDelta(0.6, 0.5, "down_good").sentiment).toBe("bad"); // bounce rate rose
  });
  it("treats tiny changes as flat and handles zero / missing baselines", () => {
    expect(computeDelta(100.2, 100).direction).toBe("flat");
    expect(computeDelta(5, 0).pct).toBeNull();
    expect(computeDelta(5, 0).direction).toBe("up");
    expect(computeDelta(null, 3).sentiment).toBe("neutral");
  });
  it("ratio and projection", () => {
    expect(ratio(1, 0)).toBeNull();
    expect(ratio(1, 4)).toBe(0.25);
    expect(projectMonthEnd(300, 10, 30)).toBe(900);
    expect(projectMonthEnd(300, 0, 30)).toBeNull();
  });
  it("contributions sum to 1 and sort by impact", () => {
    const c = contributions([
      { key: "a", current: 50, previous: 100 },
      { key: "b", current: 90, previous: 100 },
    ]);
    expect(c[0]!.key).toBe("a");
    expect(c.reduce((s, r) => s + r.share, 0)).toBeCloseTo(1);
    expect(c[0]!.share).toBeCloseTo(50 / 60);
  });
});

describe("normalizePath", () => {
  it("joins GSC URLs and GA4 paths to the same key", () => {
    const keys = [
      "https://www.navreliafoods.com/products/Ghee/?utm_source=x#reviews",
      "http://navreliafoods.com/products/ghee",
      "/products/ghee/",
      "/products//ghee?variant=1",
    ].map((u) => normalizePath(u));
    expect(new Set(keys)).toEqual(new Set(["/products/ghee"]));
  });
  it("keeps root and handles (not set)", () => {
    expect(normalizePath("https://navreliafoods.com/")).toBe("/");
    expect(normalizePath("")).toBe("(not set)");
    expect(normalizePath("(not set)")).toBe("(not set)");
  });
  it("decodes percent-encoding", () => {
    expect(normalizePath("/blogs/news/a%20b")).toBe("/blogs/news/a b");
  });
  it("groups by directory or rule", () => {
    expect(directoryOf("/products/ghee")).toBe("/products/");
    expect(directoryOf("/")).toBe("/");
    expect(groupOf("/blogs/recipes/x", [{ name: "Recipes", pattern: "/blogs/recipes" }])).toBe("Recipes");
    expect(groupOf("/collections/all", [{ name: "Shop", pattern: "/^\\/(collections|products)/" }])).toBe("Shop");
  });
});

describe("CTR curve", () => {
  it("interpolates the benchmark", () => {
    expect(benchmarkCtr(1)).toBeCloseTo(0.28);
    expect(benchmarkCtr(2.5)).toBeCloseTo((0.155 + 0.11) / 2);
    expect(benchmarkCtr(500)).toBeCloseTo(0.0005);
  });
  it("calibrates to the site and clamps", () => {
    const samples = Array.from({ length: 10 }, (_, i) => ({
      position: 5,
      impressions: 1000,
      clicks: Math.round(1000 * benchmarkCtr(5) * 0.5) + i,
    }));
    expect(calibrationScale(samples)).toBeGreaterThan(0.45);
    expect(calibrationScale(samples)).toBeLessThan(0.6);
    expect(calibrationScale([])).toBe(1);
    const tiny = samples.map((s) => ({ ...s, clicks: 0 }));
    expect(calibrationScale(tiny)).toBe(0.25);
  });
  it("estimates striking-distance and CTR gains", () => {
    const s = { position: 8, impressions: 1000, clicks: 10 };
    expect(clickGainAtPosition(s, 3)).toBeCloseTo(1000 * (0.11 - 0.01));
    expect(clickGainAtPosition({ ...s, position: 2 }, 3)).toBe(0);
    expect(clickGainFromCtr(s)).toBeCloseTo(1000 * (0.03 - 0.01));
    expect(expectedCtr(3, 0.5)).toBeCloseTo(0.055);
  });
});
