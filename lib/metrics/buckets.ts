import type { Granularity } from "@/lib/filters";
import { addDays } from "./periods";

/**
 * Day → week / month / quarter grouping for trend charts ("View by").
 * Weeks start on Monday (IST calendar). The first bucket is labelled with the range start when the
 * week/month/quarter began before it, so labels never point outside the selected period.
 */

export function bucketStart(iso: string, g: Granularity): string {
  if (g === "day") return iso;
  if (g === "week") {
    const dow = (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7; // 0 = Monday
    return addDays(iso, -dow);
  }
  if (g === "month") return `${iso.slice(0, 7)}-01`;
  const m = Number(iso.slice(5, 7));
  return `${iso.slice(0, 4)}-${String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, "0")}-01`;
}

export interface SeriesLike {
  dates: string[];
  cur: Record<string, number[]>;
  prev: Record<string, number[]> | null;
}

export interface BucketOptions {
  /** metric → [numerator, denominator]; recomputed from bucket sums (e.g. ctr = clicks ÷ impressions). */
  ratios?: Record<string, [string, string]>;
  /** metric → weight metric; weighted average over days with a non-zero value (e.g. position by impressions). */
  weighted?: Record<string, string>;
}

/** Group a daily series into buckets. Comparison values are grouped by the same day indices. */
export function bucketSeries<T extends SeriesLike>(s: T, g: Granularity, opts: BucketOptions = {}): T {
  if (g === "day" || s.dates.length === 0) return s;
  const groups: number[][] = [];
  const labels: string[] = [];
  let last = "";
  s.dates.forEach((d, i) => {
    const b = bucketStart(d, g);
    if (b !== last) {
      groups.push([]);
      labels.push(groups.length === 1 && b < s.dates[0]! ? s.dates[0]! : b);
      last = b;
    }
    groups[groups.length - 1]!.push(i);
  });
  const agg = (values: Record<string, number[]>) =>
    Object.fromEntries(
      Object.keys(values).map((m) => {
        const series = values[m]!;
        const out = groups.map((idx) => {
          const ratio = opts.ratios?.[m];
          if (ratio) {
            const num = idx.reduce((t, i) => t + (values[ratio[0]]?.[i] ?? 0), 0);
            const den = idx.reduce((t, i) => t + (values[ratio[1]]?.[i] ?? 0), 0);
            return den ? num / den : 0;
          }
          const w = opts.weighted?.[m];
          if (w) {
            let num = 0;
            let den = 0;
            for (const i of idx) {
              const v = series[i] ?? 0;
              const wt = values[w]?.[i] ?? 0;
              if (v > 0 && wt > 0) {
                num += v * wt;
                den += wt;
              }
            }
            return den ? num / den : 0;
          }
          return idx.reduce((t, i) => t + (series[i] ?? 0), 0);
        });
        return [m, out];
      }),
    );
  return { ...s, dates: labels, cur: agg(s.cur), prev: s.prev ? agg(s.prev) : null };
}
