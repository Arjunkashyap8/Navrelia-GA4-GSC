export type InsightTone = "positive" | "negative" | "warning" | "action" | "info";

export interface Insight {
  tone: InsightTone;
  text: string;
  action?: string;
  /** Higher = shown first. */
  weight?: number;
}

export function rankInsights(list: (Insight | null | undefined | false)[], max = 5): Insight[] {
  return list
    .filter((i): i is Insight => Boolean(i))
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
    .slice(0, max);
}

export function pctText(pct: number | null, digits = 0) {
  if (pct === null || !Number.isFinite(pct)) return "n/a";
  return `${Math.abs(pct * 100).toFixed(digits)}%`;
}

export function changeWord(pct: number | null, up = "rose", down = "fell") {
  if (pct === null) return "changed";
  if (Math.abs(pct) < 0.005) return "held steady";
  return pct > 0 ? up : down;
}
