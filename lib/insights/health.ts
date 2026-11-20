/**
 * Business Health Score (0–100): weighted composite, each component scored 0–100.
 *   Traffic growth      25%  sessions change vs comparison (±33% maps to 0 / 100, flat = 50)
 *   Engagement          20%  engagement rate level (30% → 0, 75% → 100)
 *   Conversion trend    25%  conversion-rate change vs comparison (±33% → 0 / 100)
 *   Organic visibility  20%  average of clicks and impressions change (±33% → 0 / 100)
 *   Tracking health     10%  share of passed tracking checks
 * Without a comparison period, change-based components score a neutral 50.
 */

export interface HealthInput {
  sessions: { cur: number; prev: number | null };
  engagementRate: number | null;
  conversionRate: { cur: number | null; prev: number | null };
  organicClicks: { cur: number; prev: number | null };
  impressions: { cur: number; prev: number | null };
  trackingChecks: { label: string; ok: boolean }[];
}

export interface HealthComponent {
  key: string;
  label: string;
  weight: number;
  score: number;
  detail: string;
}

const clamp = (v: number) => Math.max(0, Math.min(100, v));

export function changeScore(cur: number | null, prev: number | null): number {
  if (cur === null || prev === null || prev === 0) return 50;
  const pct = (cur - prev) / prev;
  return clamp(50 + pct * 150);
}

function pct(cur: number | null, prev: number | null) {
  if (cur === null || prev === null || prev === 0) return "no comparison";
  const p = ((cur - prev) / prev) * 100;
  return `${p >= 0 ? "+" : ""}${p.toFixed(1)}% vs comparison`;
}

export function healthScore(i: HealthInput): { score: number; components: HealthComponent[]; grade: string } {
  const er = i.engagementRate;
  const passed = i.trackingChecks.filter((c) => c.ok).length;
  const components: HealthComponent[] = [
    {
      key: "traffic",
      label: "Traffic growth",
      weight: 0.25,
      score: changeScore(i.sessions.cur, i.sessions.prev),
      detail: `Sessions ${pct(i.sessions.cur, i.sessions.prev)}`,
    },
    {
      key: "engagement",
      label: "Engagement",
      weight: 0.2,
      score: er === null ? 50 : clamp(((er - 0.3) / 0.45) * 100),
      detail: er === null ? "No sessions" : `Engagement rate ${(er * 100).toFixed(1)}%`,
    },
    {
      key: "conversion",
      label: "Conversion trend",
      weight: 0.25,
      score: changeScore(i.conversionRate.cur, i.conversionRate.prev),
      detail: `Conversion rate ${pct(i.conversionRate.cur, i.conversionRate.prev)}`,
    },
    {
      key: "organic",
      label: "Organic visibility",
      weight: 0.2,
      score: (changeScore(i.organicClicks.cur, i.organicClicks.prev) + changeScore(i.impressions.cur, i.impressions.prev)) / 2,
      detail: `Clicks ${pct(i.organicClicks.cur, i.organicClicks.prev)}; impressions ${pct(i.impressions.cur, i.impressions.prev)}`,
    },
    {
      key: "tracking",
      label: "Tracking health",
      weight: 0.1,
      score: i.trackingChecks.length ? (passed / i.trackingChecks.length) * 100 : 50,
      detail: `${passed} of ${i.trackingChecks.length} checks passed`,
    },
  ];
  const score = Math.round(components.reduce((s, c) => s + c.score * c.weight, 0));
  const grade = score >= 75 ? "Strong" : score >= 55 ? "Healthy" : score >= 40 ? "Needs attention" : "At risk";
  return { score, components: components.map((c) => ({ ...c, score: Math.round(c.score) })), grade };
}
