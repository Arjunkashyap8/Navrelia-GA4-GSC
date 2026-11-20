import "server-only";
import { Notices, type ViewContext } from "@/lib/data/context";
import { ga4Range } from "@/lib/data/ga4q";
import { countryName, gscCompare, gscRange, gscTotals, isBrandQuery } from "@/lib/data/gscq";
import { gscDaily, datesOf } from "@/lib/data/series";
import { getSqlite } from "@/lib/db/client";
import { changeWord, pctText, rankInsights, type Insight } from "@/lib/insights/types";
import { calibrationScale, expectedCtr, siteCurve } from "@/lib/metrics/ctr-curve";
import { computeDelta, ratio } from "@/lib/metrics/delta";
import { classifyIntent } from "@/lib/metrics/intent";
import { addDays } from "@/lib/metrics/periods";
import { normalizePath } from "@/lib/metrics/url";
import { safe } from "@/lib/safe";
import { listAnnotations } from "@/lib/settings-store";

const BUCKETS = [
  { name: "1–3", max: 3 },
  { name: "4–10", max: 10 },
  { name: "11–20", max: 20 },
  { name: "21–50", max: 50 },
  { name: "51+", max: Infinity },
];

/** Weekly count of queries per position bucket (impression-weighted avg position per query-week). */
async function positionDistribution(ctx: ViewContext) {
  const rows = await gscRange(ctx, { dimensions: ["date", "query"], maxRows: 200_000 }, ctx.period.range);
  const weekOf = (d: string) => {
    const dt = new Date(`${d}T00:00:00Z`);
    const dow = (dt.getUTCDay() + 6) % 7; // Monday start
    return addDays(d, -dow);
  };
  const agg = new Map<string, Map<string, { imp: number; posImp: number }>>();
  for (const r of rows) {
    const w = weekOf(r.keys.date!);
    const m = agg.get(w) ?? new Map();
    const q = m.get(r.keys.query!) ?? { imp: 0, posImp: 0 };
    q.imp += r.impressions;
    q.posImp += r.position * r.impressions;
    m.set(r.keys.query!, q);
    agg.set(w, m);
  }
  const weeks = [...agg.keys()].sort();
  const series = BUCKETS.map((b, bi) => ({
    name: b.name,
    data: weeks.map((w) => {
      let n = 0;
      for (const q of agg.get(w)!.values()) {
        const pos = q.posImp / q.imp;
        const lo = bi === 0 ? 0 : BUCKETS[bi - 1]!.max;
        if (pos > lo && pos <= b.max) n++;
      }
      return n;
    }),
  }));
  return { weeks, series };
}

export async function getOrganic(ctx: ViewContext) {
  const notices = new Notices();
  const terms = ctx.settings.brandTerms;
  const brandCtx = (b: "brand" | "nonbrand"): ViewContext => ({ ...ctx, filters: { ...ctx.filters, brand: b } });

  const [totals, brand, nonbrand, daily, brandDaily, nonbrandDaily, queries, queryPages, pages, ga4Pages, appearance, countries, devices, dist] =
    await Promise.all([
      safe(() => gscTotals(ctx)),
      safe(() => gscTotals(brandCtx("brand"))),
      safe(() => gscTotals(brandCtx("nonbrand"))),
      safe(() => gscDaily(ctx)),
      safe(() => gscDaily(brandCtx("brand"))),
      safe(() => gscDaily(brandCtx("nonbrand"))),
      safe(() => gscCompare(ctx, { dimensions: ["query"], maxRows: 25_000 })),
      safe(() => gscRange(ctx, { dimensions: ["query", "page"], maxRows: 50_000 }, ctx.period.range)),
      safe(() => gscCompare(ctx, { dimensions: ["page"], aggregationType: "byPage", maxRows: 5000 })),
      safe(() =>
        ga4Range(
          { ...ctx, filters: { ...ctx.filters, channel: "Organic Search" } },
          { dimensions: ["landingPage"], metrics: ["sessions", "engagedSessions", "keyEvents", "transactions", "purchaseRevenue"], limit: 5000, orderBy: { metric: "sessions" } },
          ctx.period.range,
          notices,
        ),
      ),
      safe(() => gscCompare(ctx, { dimensions: ["searchAppearance"] })),
      safe(() => gscCompare(ctx, { dimensions: ["country"], maxRows: 300, ignore: ["country"] })),
      safe(() => gscCompare(ctx, { dimensions: ["device"], ignore: ["device"] })),
      safe(() => positionDistribution(ctx)),
    ]);

  // Ranking URLs per query.
  const urlsByQuery = new Map<string, { page: string; impressions: number }[]>();
  if (queryPages.ok)
    for (const r of queryPages.data) {
      const list = urlsByQuery.get(r.keys.query!) ?? [];
      list.push({ page: normalizePath(r.keys.page, ctx.siteOrigin), impressions: r.impressions });
      urlsByQuery.set(r.keys.query!, list);
    }

  // Keyword × landing page pairs (which page ranks for which search).
  const keywordPageRows = queryPages.ok
    ? queryPages.data.map((r) => ({
        query: r.keys.query!,
        page: normalizePath(r.keys.page, ctx.siteOrigin),
        brand: isBrandQuery(r.keys.query!, terms) ? "Brand" : "Non-brand",
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: r.ctr,
        position: r.position,
      }))
    : [];

  const queryRows = queries.ok
    ? queries.data.map((r) => {
        const q = r.keys.query!;
        const urls = (urlsByQuery.get(q) ?? []).sort((a, b) => b.impressions - a.impressions);
        return {
          query: q,
          clicks: r.cur?.clicks ?? 0,
          clicksPrev: r.prev?.clicks ?? null,
          impressions: r.cur?.impressions ?? 0,
          impressionsPrev: r.prev?.impressions ?? null,
          ctr: r.cur?.ctr ?? 0,
          ctrPrev: r.prev?.ctr ?? null,
          position: r.cur?.position ?? null,
          positionPrev: r.prev?.position ?? null,
          urls: urls.map((u) => u.page).slice(0, 3).join("  ·  "),
          urlCount: urls.length,
          intent: classifyIntent(q, terms),
          brand: isBrandQuery(q, terms) ? "Brand" : "Non-brand",
          inCurrent: Boolean(r.cur),
          inPrev: Boolean(r.prev),
        };
      })
    : [];
  const current = queryRows.filter((q) => q.inCurrent);
  const scale = calibrationScale(current.filter((q) => q.brand === "Non-brand").map((q) => ({ ...q, position: q.position ?? 0 })));
  const ctrRows = current
    .filter((q) => q.position && q.position <= 20 && q.impressions >= 30)
    .map((q) => {
      const exp = expectedCtr(q.position!, scale);
      return { ...q, expectedCtr: exp, ctrGap: q.ctr - exp, missedClicks: Math.max(0, (exp - q.ctr) * q.impressions) };
    });
  const curve = siteCurve(current.map((q) => ({ clicks: q.clicks, impressions: q.impressions, position: q.position ?? 0 })));

  // Blended page table: GSC page metrics joined with GA4 organic landing-page behaviour.
  const ga4ByPath = new Map<string, Record<string, number>>();
  if (ga4Pages.ok)
    for (const r of ga4Pages.data) {
      const k = normalizePath(String(r.landingPage), ctx.siteOrigin);
      const e = ga4ByPath.get(k) ?? { sessions: 0, engagedSessions: 0, keyEvents: 0, transactions: 0, revenue: 0 };
      e.sessions! += Number(r.sessions);
      e.engagedSessions! += Number(r.engagedSessions);
      e.keyEvents! += Number(r.keyEvents);
      e.transactions! += Number(r.transactions);
      e.revenue! += Number(r.purchaseRevenue);
      ga4ByPath.set(k, e);
    }
  const pageAgg = new Map<string, { clicks: number; clicksPrev: number; impressions: number; posImp: number; hasPrev: boolean }>();
  if (pages.ok)
    for (const r of pages.data) {
      const k = normalizePath(r.keys.page, ctx.siteOrigin);
      const e = pageAgg.get(k) ?? { clicks: 0, clicksPrev: 0, impressions: 0, posImp: 0, hasPrev: false };
      e.clicks += r.cur?.clicks ?? 0;
      e.impressions += r.cur?.impressions ?? 0;
      e.posImp += (r.cur?.position ?? 0) * (r.cur?.impressions ?? 0);
      if (r.prev) {
        e.clicksPrev += r.prev.clicks;
        e.hasPrev = true;
      }
      pageAgg.set(k, e);
    }
  const pageRows = [...pageAgg.entries()].map(([path, g]) => {
    const a = ga4ByPath.get(path);
    return {
      page: path,
      clicks: g.clicks,
      clicksPrev: g.hasPrev ? g.clicksPrev : null,
      impressions: g.impressions,
      ctr: ratio(g.clicks, g.impressions),
      position: g.impressions ? g.posImp / g.impressions : null,
      sessions: a?.sessions ?? 0,
      engagementRate: a ? ratio(a.engagedSessions, a.sessions) : null,
      keyEvents: a?.keyEvents ?? 0,
      transactions: a?.transactions ?? 0,
      revenue: a?.revenue ?? 0,
    };
  });
  const noClickPages = pageRows.filter((p) => p.impressions >= 100 && p.clicks === 0).sort((a, b) => b.impressions - a.impressions);

  // Anonymized share = 1 − (sum of query-level clicks ÷ property total clicks).
  const queryClicks = current.reduce((s, q) => s + q.clicks, 0);
  const anonymized = totals.ok && totals.data.cur.clicks ? Math.max(0, 1 - queryClicks / totals.data.cur.clicks) : null;
  const queryImpr = current.reduce((s, q) => s + q.impressions, 0);
  const anonymizedImpr = totals.ok && totals.data.cur.impressions ? Math.max(0, 1 - queryImpr / totals.data.cur.impressions) : null;

  // Change tracking.
  const hasCmp = Boolean(ctx.period.comparison);
  const newQueries = hasCmp ? queryRows.filter((q) => q.inCurrent && !q.inPrev).sort((a, b) => b.impressions - a.impressions) : [];
  const lostQueries = hasCmp ? queryRows.filter((q) => !q.inCurrent && q.inPrev).sort((a, b) => (b.impressionsPrev ?? 0) - (a.impressionsPrev ?? 0)) : [];
  const both = queryRows.filter((q) => q.inCurrent && q.inPrev).map((q) => ({ ...q, clickChange: q.clicks - (q.clicksPrev ?? 0) }));
  const rising = [...both].sort((a, b) => b.clickChange - a.clickChange).filter((q) => q.clickChange > 0).slice(0, 50);
  const falling = [...both].sort((a, b) => a.clickChange - b.clickChange).filter((q) => q.clickChange < 0).slice(0, 50);

  // Search types from local snapshots (respects range, not other filters).
  const searchTypes = getSqlite()
    .prepare("SELECT search_type t, SUM(clicks) c, SUM(impressions) i FROM gsc_daily WHERE date BETWEEN ? AND ? GROUP BY search_type ORDER BY i DESC")
    .all(ctx.period.range.start, ctx.period.range.end) as { t: string; c: number; i: number }[];

  const latestFinal = getSqlite().prepare("SELECT MAX(date) d FROM gsc_daily WHERE search_type='web'").get() as { d: string | null };

  // Insights.
  const ins: (Insight | null)[] = [];
  if (totals.ok && totals.data.prev) {
    const c = computeDelta(totals.data.cur.clicks, totals.data.prev.clicks);
    const i = computeDelta(totals.data.cur.impressions, totals.data.prev.impressions);
    const pos = totals.data.cur.position - totals.data.prev.position;
    const why = i.pct !== null && Math.abs(i.pct) > 0.1 && Math.abs(pos) < 0.5 ? "mostly because search demand (impressions) changed" : Math.abs(pos) >= 0.5 ? `with average position ${pos < 0 ? "improving" : "slipping"} ${Math.abs(pos).toFixed(1)} places` : "with rankings and demand broadly stable";
    ins.push({ tone: c.sentiment === "good" ? "positive" : c.sentiment === "bad" ? "negative" : "info", text: `Organic clicks ${changeWord(c.pct)} ${pctText(c.pct)}, ${why}.`, weight: 10 });
  }
  if (nonbrand.ok && nonbrand.data.prev && brand.ok) {
    const nb = computeDelta(nonbrand.data.cur.clicks, nonbrand.data.prev.clicks);
    const share = ratio(nonbrand.data.cur.clicks, (brand.data.cur.clicks ?? 0) + nonbrand.data.cur.clicks);
    ins.push({ tone: nb.sentiment === "good" ? "positive" : nb.sentiment === "bad" ? "negative" : "info", text: `Non-brand clicks ${changeWord(nb.pct)} ${pctText(nb.pct)}; non-brand is ${pctText(share)} of query-level clicks.`, weight: 9 });
  }
  const under = ctrRows.filter((q) => q.position! <= 10 && q.ctr < q.expectedCtr * 0.6).length;
  if (under) ins.push({ tone: "action", text: `${under} top-10 queries get well under the expected CTR for their position.`, action: "Rewrite their titles and meta descriptions", weight: 8 });
  const striking = current.filter((q) => q.position && q.position >= 4 && q.position <= 20 && q.impressions >= 50).length;
  if (striking) ins.push({ tone: "action", text: `${striking} queries sit in striking distance (positions 4–20) with meaningful impressions.`, action: "See the Opportunities list", weight: 7 });
  if (anonymized !== null) ins.push({ tone: "info", text: `${pctText(anonymized)} of clicks come from anonymized queries Google doesn't show, so query tables add up to less than the totals.`, weight: 3 });
  if (noClickPages.length) ins.push({ tone: "warning", text: `${noClickPages.length} pages get 100+ impressions but zero clicks.`, action: "Check their snippets and intent match", weight: 5 });

  return {
    totals,
    brand,
    nonbrand,
    daily,
    brandDaily,
    nonbrandDaily,
    queryRows: current,
    keywordPageRows,
    ctrRows,
    curve,
    scale,
    pageRows,
    noClickPages,
    appearance,
    countries: countries.ok ? { ok: true as const, data: countries.data.map((c) => ({ ...c, name: countryName(c.keys.country ?? "") })) } : countries,
    devices,
    dist,
    anonymized,
    anonymizedImpr,
    newQueries,
    lostQueries,
    rising,
    falling,
    searchTypes,
    insights: rankInsights(ins),
    annotations: listAnnotations(ctx.period.range),
    preliminaryFrom: latestFinal.d ? addDays(latestFinal.d, -2) : null,
    notices: notices.list(),
    dates: daily.ok ? daily.data.dates : datesOf(ctx.period.range),
  };
}
