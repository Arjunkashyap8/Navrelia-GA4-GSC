import { describe, expect, it } from "vitest";
import { formatCurrency, formatDuration, formatNumber, formatPercent, formatPosition } from "./format";

describe("formatNumber", () => {
  it("groups international and Indian styles", () => {
    expect(formatNumber(1234567)).toBe("1,234,567");
    expect(formatNumber(1234567, { system: "indian" })).toBe("12,34,567");
  });

  it("compacts in Indian units", () => {
    expect(formatNumber(1_234_567, { system: "indian", compact: true })).toBe("12.3 L");
    expect(formatNumber(12_345_678, { system: "indian", compact: true })).toBe("1.2 Cr");
    expect(formatNumber(4_500, { system: "indian", compact: true })).toBe("4.5K");
    expect(formatNumber(999, { system: "indian", compact: true })).toBe("999");
  });

  it("promotes to the next unit when rounding crosses a boundary", () => {
    expect(formatNumber(99_990, { system: "indian", compact: true })).toBe("1 L");
    expect(formatNumber(999_960, { compact: true })).toBe("1M");
  });

  it("compacts internationally", () => {
    expect(formatNumber(1_234_567, { compact: true })).toBe("1.2M");
    expect(formatNumber(-2_500, { compact: true })).toBe("-2.5K");
  });

  it("renders missing values as a dash", () => {
    expect(formatNumber(null)).toBe("—");
    expect(formatNumber(Number.NaN)).toBe("—");
  });
});

describe("other formatters", () => {
  it("currency", () => {
    expect(formatCurrency(1234567, { system: "indian" })).toBe("₹12,34,567");
    expect(formatCurrency(-500)).toBe("-₹500");
    expect(formatCurrency(12_345_678, { system: "indian", compact: true })).toBe("₹1.2 Cr");
  });
  it("percent and position", () => {
    expect(formatPercent(0.1234)).toBe("12.3%");
    expect(formatPosition(4.26)).toBe("4.3");
  });
  it("duration", () => {
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(83)).toBe("1m 23s");
    expect(formatDuration(3720)).toBe("1h 02m");
  });
});
