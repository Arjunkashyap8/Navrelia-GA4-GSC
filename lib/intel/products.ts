import { cleanProductName, contentTokens } from "./text";

/**
 * Product ↔ search demand matching. A query matches a product when it shares at least two of the
 * product's distinctive tokens, or any token that belongs to that product alone (e.g. "upma").
 * Score = shared tokens + 0.5 × unique shared tokens; the best score wins and ties split evenly.
 */

const GENERIC = new Set(["mix", "atta", "flour", "food", "foods", "healthy", "natural", "organic", "low", "high"]);

export function productTokens(name: string): string[] {
  const t = [...new Set(contentTokens(cleanProductName(name)))];
  const distinctive = t.filter((x) => !GENERIC.has(x));
  return distinctive.length ? distinctive : t;
}

export interface DemandQuery {
  query: string;
  clicks: number;
  impressions: number;
  impressionsPrev?: number;
}

export interface ProductDemand {
  product: string;
  tokens: string[];
  queries: number;
  impressions: number;
  impressionsPrev: number;
  clicks: number;
  topQueries: string[];
}

export function matchDemand(products: string[], queries: DemandQuery[]): Map<string, ProductDemand> {
  const toks = new Map(products.map((p) => [p, productTokens(p)]));
  const out = new Map<string, ProductDemand>(
    products.map((p) => [p, { product: p, tokens: toks.get(p)!, queries: 0, impressions: 0, impressionsPrev: 0, clicks: 0, topQueries: [] }]),
  );
  const freq = new Map<string, number>();
  for (const t of toks.values()) for (const x of t) freq.set(x, (freq.get(x) ?? 0) + 1);
  for (const q of queries) {
    const qt = new Set(contentTokens(q.query));
    let best = 0;
    let winners: string[] = [];
    for (const [p, t] of toks) {
      const shared = t.filter((x) => qt.has(x));
      const unique = shared.filter((x) => freq.get(x) === 1).length;
      if (shared.length < Math.min(2, t.length) && unique === 0) continue;
      const hit = shared.length + 0.5 * unique;
      if (hit > best) {
        best = hit;
        winners = [p];
      } else if (hit === best) winners.push(p);
    }
    for (const p of winners) {
      const e = out.get(p)!;
      const w = 1 / winners.length;
      e.queries++;
      e.impressions += q.impressions * w;
      e.impressionsPrev += (q.impressionsPrev ?? 0) * w;
      e.clicks += q.clicks * w;
      if (e.topQueries.length < 5) e.topQueries.push(q.query);
    }
  }
  return out;
}
