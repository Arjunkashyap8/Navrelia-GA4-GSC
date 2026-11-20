import { describe, expect, it } from "vitest";
import {
  addMonths,
  daysInclusive,
  formatRange,
  ga4DateToIso,
  isIsoDate,
  parsePeriodParams,
  resolveComparison,
  resolveRange,
  todayInTimeZone,
} from "./periods";

const TODAY = "2026-11-16";

describe("resolveRange", () => {
  it("last N days end yesterday", () => {
    expect(resolveRange("last7", TODAY)).toEqual({ start: "2026-11-09", end: "2026-11-15" });
    expect(daysInclusive(resolveRange("last28", TODAY))).toBe(28);
    expect(daysInclusive(resolveRange("last90", TODAY))).toBe(90);
  });

  it("calendar presets", () => {
    expect(resolveRange("thisMonth", TODAY)).toEqual({ start: "2026-11-01", end: TODAY });
    expect(resolveRange("lastMonth", TODAY)).toEqual({ start: "2026-10-01", end: "2026-10-31" });
    expect(resolveRange("thisQuarter", TODAY)).toEqual({ start: "2026-10-01", end: TODAY });
    expect(resolveRange("lastQuarter", TODAY)).toEqual({ start: "2026-07-01", end: "2026-09-30" });
    expect(resolveRange("ytd", TODAY)).toEqual({ start: "2026-01-01", end: TODAY });
  });

  it("last 12/16 months", () => {
    expect(resolveRange("last12m", TODAY)).toEqual({ start: "2025-11-16", end: "2026-11-15" });
    expect(resolveRange("last16m", TODAY)).toEqual({ start: "2025-07-16", end: "2026-11-15" });
  });

  it("custom ranges are validated, clamped and ordered", () => {
    expect(resolveRange("custom", TODAY, { start: "2026-10-10", end: "2026-10-01" })).toEqual({
      start: "2026-10-01",
      end: "2026-10-10",
    });
    expect(resolveRange("custom", TODAY, { start: "2026-11-01", end: "2027-01-01" }).end).toBe(TODAY);
    expect(resolveRange("custom", TODAY, { start: "garbage" })).toEqual(resolveRange("last28", TODAY));
  });
});

describe("resolveComparison", () => {
  it("previous period has the same length and ends the day before", () => {
    const range = { start: "2026-10-19", end: "2026-11-15" };
    const cmp = resolveComparison(range, "previous")!;
    expect(cmp).toEqual({ start: "2026-09-21", end: "2026-10-18" });
    expect(daysInclusive(cmp)).toBe(daysInclusive(range));
  });

  it("yoy shifts calendar dates and clamps leap day", () => {
    expect(resolveComparison({ start: "2024-02-29", end: "2024-03-05" }, "yoy")).toEqual({
      start: "2023-02-28",
      end: "2023-03-05",
    });
  });

  it("none returns null", () => {
    expect(resolveComparison({ start: TODAY, end: TODAY }, "none")).toBeNull();
  });
});

describe("helpers", () => {
  it("addMonths clamps to month end", () => {
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
  });
  it("isIsoDate rejects impossible dates", () => {
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-02-28")).toBe(true);
  });
  it("today in IST rolls over at IST midnight", () => {
    // 2026-11-15 18:45 UTC = 2026-11-16 00:15 IST
    expect(todayInTimeZone("Asia/Calcutta", new Date("2026-11-15T18:45:00Z"))).toBe("2026-11-16");
  });
  it("formats ranges", () => {
    expect(formatRange({ start: "2026-10-19", end: "2026-11-15" })).toBe("19 Oct – 15 Nov 2026");
    expect(formatRange({ start: "2025-12-20", end: "2026-01-05" })).toBe("20 Dec 2025 – 5 Jan 2026");
  });
  it("converts GA4 dates", () => {
    expect(ga4DateToIso("20261115")).toBe("2026-11-15");
  });
  it("parses URL params with fallbacks", () => {
    const p = parsePeriodParams(new URLSearchParams("range=nope&cmp=yoy"), TODAY);
    expect(p.preset).toBe("last28");
    expect(p.compare).toBe("yoy");
    expect(p.comparison).toEqual({ start: "2025-10-19", end: "2025-11-15" });
  });
});
