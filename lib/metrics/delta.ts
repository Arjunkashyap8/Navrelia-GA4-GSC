/**
 * Period-over-period change with direction-aware sentiment.
 * polarity "up_good": a rise is good (sessions). "down_good": a fall is good (bounce rate, position).
 */

export type Polarity = "up_good" | "down_good" | "neutral";

export interface Delta {
  current: number | null;
  previous: number | null;
  abs: number | null;
  /** Relative change as a ratio (0.12 = +12%). Null when previous is 0 / missing. */
  pct: number | null;
  direction: "up" | "down" | "flat";
  sentiment: "good" | "bad" | "neutral";
}

const FLAT_THRESHOLD = 0.005; // ±0.5% counts as flat

export function computeDelta(
  current: number | null | undefined,
  previous: number | null | undefined,
  polarity: Polarity = "up_good",
): Delta {
  const cur = Number.isFinite(current) ? (current as number) : null;
  const prev = Number.isFinite(previous) ? (previous as number) : null;
  if (cur === null || prev === null) {
    return { current: cur, previous: prev, abs: null, pct: null, direction: "flat", sentiment: "neutral" };
  }
  const abs = cur - prev;
  const pct = prev === 0 ? null : abs / Math.abs(prev);
  const rel = pct ?? (abs === 0 ? 0 : Math.sign(abs));
  const direction = Math.abs(rel) < FLAT_THRESHOLD ? "flat" : abs > 0 ? "up" : "down";
  let sentiment: Delta["sentiment"] = "neutral";
  if (direction !== "flat" && polarity !== "neutral") {
    const good = (direction === "up") === (polarity === "up_good");
    sentiment = good ? "good" : "bad";
  }
  return { current: cur, previous: prev, abs, pct, direction, sentiment };
}

/** Safe ratio: null when the denominator is 0. */
export function ratio(n: number | null | undefined, d: number | null | undefined): number | null {
  if (!Number.isFinite(n) || !Number.isFinite(d) || !d) return null;
  return (n as number) / (d as number);
}

/**
 * Run-rate projection for the current month: value so far ÷ days elapsed × days in month.
 * `daysElapsed` counts complete days (exclude today when today's data is partial).
 */
export function projectMonthEnd(valueSoFar: number, daysElapsed: number, daysInMonth: number): number | null {
  if (daysElapsed <= 0) return null;
  return (valueSoFar / daysElapsed) * daysInMonth;
}

/** Contribution of each segment to a total change (for root-cause / "what changed"). */
export function contributions<T extends { key: string; current: number; previous: number }>(rows: T[]) {
  const totalChange = rows.reduce((s, r) => s + (r.current - r.previous), 0);
  return rows
    .map((r) => {
      const change = r.current - r.previous;
      return { ...r, change, share: totalChange === 0 ? 0 : change / totalChange };
    })
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
}
