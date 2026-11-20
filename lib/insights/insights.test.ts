import { describe, expect, it } from "vitest";
import { changeScore, healthScore } from "./health";

describe("health score", () => {
  it("maps change to 0–100 with flat = 50", () => {
    expect(changeScore(100, 100)).toBe(50);
    expect(changeScore(200, 100)).toBe(100);
    expect(changeScore(0, 100)).toBe(0);
    expect(changeScore(100, null)).toBe(50);
  });
  it("weights components and grades", () => {
    const h = healthScore({
      sessions: { cur: 120, prev: 100 },
      engagementRate: 0.6,
      conversionRate: { cur: 0.02, prev: 0.02 },
      organicClicks: { cur: 100, prev: 100 },
      impressions: { cur: 1000, prev: 1000 },
      trackingChecks: [{ label: "a", ok: true }, { label: "b", ok: false }],
    });
    expect(h.components.reduce((s, c) => s + c.weight, 0)).toBeCloseTo(1);
    // traffic 80, engagement 66.7, conversion 50, organic 50, tracking 50
    expect(h.score).toBe(Math.round(80 * 0.25 + 66.67 * 0.2 + 50 * 0.25 + 50 * 0.2 + 50 * 0.1));
  });
});
