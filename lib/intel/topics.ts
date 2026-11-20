import { expectedCtr } from "@/lib/metrics/ctr-curve";
import { candidateTerms } from "./text";

/**
 * Data-driven topic clustering of search queries.
 * 1. Candidate terms = unigrams + bigrams of content tokens (stopwords, sizes, buy/price words removed).
 * 2. A term is a valid topic if ≥ minQueries queries contain it.
 * 3. Each query joins its MOST SPECIFIC valid term (trigram > bigram > unigram), ties broken by the
 *    term's total impressions — so "ruby roti price" joins "ruby roti", not the broad "roti".
 * 4. Brand queries form one "Brand" topic; queries matching no topic go to "Other".
 */

export interface TopicQuery {
  query: string;
  clicks: number;
  impressions: number;
  position: number;
  isBrand: boolean;
  revenue?: number;
  pages?: { page: string; clicks: number; impressions: number; position: number }[];
}

export interface Topic {
  topic: string;
  queries: number;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  revenue: number;
  pages: number;
  bestPage: string | null;
  bestPagePosition: number | null;
  /** Clicks ÷ clicks attainable at position 1 (calibrated CTR curve). */
  shareOfVoice: number;
  /** Extra clicks if the topic's average position became 3. */
  upside: number;
  gap: boolean;
  topQueries: string[];
}

export function clusterQueries(queries: TopicQuery[], opts: { minQueries?: number; ctrScale?: number } = {}): { topics: Topic[]; assignment: Map<string, string> } {
  const minQ = opts.minQueries ?? 3;
  const scale = opts.ctrScale ?? 1;
  const termStats = new Map<string, { n: number; imp: number }>();
  const nonBrand = queries.filter((q) => !q.isBrand);
  for (const q of nonBrand) {
    for (const t of candidateTerms(q.query)) {
      const s = termStats.get(t) ?? { n: 0, imp: 0 };
      s.n++;
      s.imp += q.impressions;
      termStats.set(t, s);
    }
  }
  const score = (t: string) => {
    const s = termStats.get(t);
    if (!s || s.n < minQ) return -1;
    // Specificity first (word count), then demand.
    return t.split(" ").length * 1e12 + s.imp;
  };

  const assignment = new Map<string, string>();
  for (const q of queries) {
    if (q.isBrand) {
      assignment.set(q.query, "Brand");
      continue;
    }
    let best = "Other";
    let bestScore = 0;
    for (const t of candidateTerms(q.query)) {
      const sc = score(t);
      if (sc > bestScore) {
        bestScore = sc;
        best = t;
      }
    }
    assignment.set(q.query, best);
  }

  const groups = new Map<string, TopicQuery[]>();
  for (const q of queries) {
    const k = assignment.get(q.query)!;
    groups.set(k, [...(groups.get(k) ?? []), q]);
  }

  const topics: Topic[] = [...groups.entries()].map(([topic, qs]) => {
    const clicks = qs.reduce((s, q) => s + q.clicks, 0);
    const impressions = qs.reduce((s, q) => s + q.impressions, 0);
    const position = impressions ? qs.reduce((s, q) => s + q.position * q.impressions, 0) / impressions : 0;
    const pageAgg = new Map<string, { clicks: number; imp: number; posImp: number }>();
    for (const q of qs)
      for (const p of q.pages ?? []) {
        const e = pageAgg.get(p.page) ?? { clicks: 0, imp: 0, posImp: 0 };
        e.clicks += p.clicks;
        e.imp += p.impressions;
        e.posImp += p.position * p.impressions;
        pageAgg.set(p.page, e);
      }
    const best = [...pageAgg.entries()].sort((a, b) => b[1].clicks - a[1].clicks || b[1].imp - a[1].imp)[0];
    const attainable = impressions * expectedCtr(1, scale);
    const at3 = impressions * expectedCtr(3, scale);
    const bestPagePosition = best && best[1].imp ? best[1].posImp / best[1].imp : null;
    return {
      topic,
      queries: qs.length,
      clicks,
      impressions,
      ctr: impressions ? clicks / impressions : 0,
      position,
      revenue: qs.reduce((s, q) => s + (q.revenue ?? 0), 0),
      pages: pageAgg.size,
      bestPage: best?.[0] ?? null,
      bestPagePosition,
      shareOfVoice: attainable ? Math.min(1, clicks / attainable) : 0,
      upside: position > 3 ? Math.max(0, at3 - clicks) : 0,
      gap: topic !== "Brand" && topic !== "Other" && impressions >= 100 && position > 15 && (bestPagePosition === null || bestPagePosition > 10),
      topQueries: [...qs].sort((a, b) => b.impressions - a.impressions).slice(0, 5).map((q) => q.query),
    };
  });
  return { topics: topics.sort((a, b) => b.impressions - a.impressions), assignment };
}
