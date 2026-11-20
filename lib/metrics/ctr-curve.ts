/**
 * CTR curve: expected click-through rate by average position.
 *
 * BENCHMARK is a typical organic web CTR curve for desktop+mobile (non-brand), in line with
 * public industry studies. Real CTR varies a lot by SERP features, so we CALIBRATE it to this
 * site: scale = median(actual / benchmark) across non-brand queries with enough impressions,
 * clamped to [0.25, 1.5]. "Expected CTR" everywhere means benchmark × site scale.
 */

const BENCHMARK: [number, number][] = [
  [1, 0.28],
  [2, 0.155],
  [3, 0.11],
  [4, 0.08],
  [5, 0.061],
  [6, 0.047],
  [7, 0.037],
  [8, 0.03],
  [9, 0.025],
  [10, 0.021],
  [11, 0.012],
  [15, 0.009],
  [20, 0.006],
  [30, 0.003],
  [50, 0.0015],
  [100, 0.0005],
];

/** Benchmark CTR at a (fractional) position, linear interpolation between anchor points. */
export function benchmarkCtr(position: number): number {
  if (!Number.isFinite(position) || position <= 1) return BENCHMARK[0]![1];
  for (let i = 1; i < BENCHMARK.length; i++) {
    const [p1, c1] = BENCHMARK[i - 1]!;
    const [p2, c2] = BENCHMARK[i]!;
    if (position <= p2) return c1 + ((c2 - c1) * (position - p1)) / (p2 - p1);
  }
  return BENCHMARK[BENCHMARK.length - 1]![1];
}

export interface CtrSample {
  impressions: number;
  clicks: number;
  position: number;
}

export function calibrationScale(samples: CtrSample[], minImpressions = 50): number {
  const ratios = samples
    .filter((s) => s.impressions >= minImpressions && s.position > 0 && s.position <= 20)
    .map((s) => s.clicks / s.impressions / benchmarkCtr(s.position))
    .sort((a, b) => a - b);
  if (ratios.length < 5) return 1;
  const mid = Math.floor(ratios.length / 2);
  const median = ratios.length % 2 ? ratios[mid]! : (ratios[mid - 1]! + ratios[mid]!) / 2;
  return Math.min(1.5, Math.max(0.25, median));
}

export function expectedCtr(position: number, scale = 1): number {
  return benchmarkCtr(position) * scale;
}

/** Extra monthly clicks if a query moved from its current position/CTR to `targetPosition`. */
export function clickGainAtPosition(s: CtrSample, targetPosition: number, scale = 1): number {
  if (s.position <= targetPosition) return 0;
  const target = expectedCtr(targetPosition, scale);
  const current = s.impressions > 0 ? s.clicks / s.impressions : 0;
  return Math.max(0, s.impressions * (target - current));
}

/** Extra clicks if CTR rose to the expected CTR for its current position (title/meta rewrite). */
export function clickGainFromCtr(s: CtrSample, scale = 1): number {
  const current = s.impressions > 0 ? s.clicks / s.impressions : 0;
  return Math.max(0, s.impressions * (expectedCtr(s.position, scale) - current));
}

/** Site's actual CTR by rounded position bucket (1..20), impression-weighted. */
export function siteCurve(samples: CtrSample[]) {
  const buckets = new Map<number, { clicks: number; impressions: number }>();
  for (const s of samples) {
    const p = Math.round(s.position);
    if (p < 1 || p > 20) continue;
    const b = buckets.get(p) ?? { clicks: 0, impressions: 0 };
    b.clicks += s.clicks;
    b.impressions += s.impressions;
    buckets.set(p, b);
  }
  return Array.from({ length: 20 }, (_, i) => {
    const p = i + 1;
    const b = buckets.get(p);
    return {
      position: p,
      actual: b && b.impressions >= 20 ? b.clicks / b.impressions : null,
      impressions: b?.impressions ?? 0,
      benchmark: benchmarkCtr(p),
    };
  });
}
