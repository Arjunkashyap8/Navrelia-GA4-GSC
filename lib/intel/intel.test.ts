import { describe, expect, it } from "vitest";
import { attributeToQueries } from "./attribution";
import { matchDemand, productTokens } from "./products";
import { cleanProductName, contentTokens } from "./text";
import { clusterQueries } from "./topics";

describe("text helpers", () => {
  it("normalises product names and tokens", () => {
    expect(cleanProductName("Varienty Box Ruby Roti mix Atta Pack - Default Title")).toBe("Varienty Box Ruby Roti mix Atta Pack");
    expect(contentTokens("Best diabetes atta price 5 kg")).toEqual(["diabetic", "atta"]);
    expect(productTokens("Classic Ruby Roti Mix | Low GI Flour 1kg")).toEqual(["classic", "ruby", "roti", "gi"]);
  });
});

describe("topic clustering", () => {
  const q = (query: string, impressions: number, position = 8, isBrand = false) => ({ query, clicks: Math.round(impressions / 50), impressions, position, isBrand });
  it("prefers specific bigram topics and keeps brand separate", () => {
    const { topics, assignment } = clusterQueries([
      q("ruby roti", 500),
      q("ruby roti price", 200),
      q("ruby roti online", 100),
      q("low gi atta", 300, 25),
      q("low gi atta for diabetes", 150, 30),
      q("best low gi atta", 120, 28),
      q("navrelia", 400, 1, true),
      q("random thing", 5),
    ]);
    expect(assignment.get("ruby roti price")).toBe("ruby roti");
    expect(assignment.get("best low gi atta")).toBe("low gi atta");
    expect(assignment.get("navrelia")).toBe("Brand");
    expect(assignment.get("random thing")).toBe("Other");
    const gi = topics.find((t) => t.topic === "low gi atta")!;
    expect(gi.queries).toBe(3);
    expect(gi.gap).toBe(true); // ranks > 15 with no page in the top 10
    expect(topics.find((t) => t.topic === "ruby roti")!.gap).toBe(false);
  });
});

describe("search → revenue attribution", () => {
  it("splits page revenue by click share and holds back the anonymized share", () => {
    const rows = [
      { query: "ruby roti", page: "/p/a", clicks: 30, impressions: 300, position: 3 },
      { query: "low gi roti", page: "/p/a", clicks: 10, impressions: 200, position: 6 },
      { query: "low gi roti", page: "/p/b", clicks: 5, impressions: 100, position: 9 },
    ];
    const value = new Map([
      ["/p/a", { revenue: 8000, conversions: 8, sessions: 50 }],
      ["/p/b", { revenue: 1000, conversions: 1, sessions: 10 }],
    ]);
    // /p/a had 80 total clicks, only 40 visible → half its revenue is attributable.
    const r = attributeToQueries(rows, value, new Map([["/p/a", 80], ["/p/b", 5]]));
    const ruby = r.queries.find((x) => x.query === "ruby roti")!;
    expect(ruby.revenue).toBeCloseTo(8000 * (30 / 40) * 0.5);
    const low = r.queries.find((x) => x.query === "low gi roti")!;
    expect(low.revenue).toBeCloseTo(8000 * (10 / 40) * 0.5 + 1000);
    expect(r.anonymizedRevenue).toBeCloseTo(4000);
    expect(low.topPage).toBe("/p/a");
  });
});

describe("product demand matching", () => {
  it("assigns queries to the product with the best token overlap, splitting ties", () => {
    const m = matchDemand(
      ["Classic Ruby Roti Mix - Default Title", "Pressed Ruby Roti - Default Title", "Pearl Upma Mix"],
      [
        { query: "ruby roti", clicks: 10, impressions: 100 },
        { query: "pressed ruby roti", clicks: 2, impressions: 40 },
        { query: "upma mix for diabetes", clicks: 1, impressions: 30 },
        { query: "ghee", clicks: 1, impressions: 50 },
      ],
    );
    expect(m.get("Pressed Ruby Roti - Default Title")!.impressions).toBeCloseTo(50 + 40);
    expect(m.get("Classic Ruby Roti Mix - Default Title")!.impressions).toBeCloseTo(50);
    expect(m.get("Pearl Upma Mix")!.impressions).toBe(30);
  });
});
