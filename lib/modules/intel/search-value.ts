import "server-only";
import { Notices, type ViewContext } from "@/lib/data/context";
import { ga4Compare, ga4Range } from "@/lib/data/ga4q";
import { gscCompare, gscRange, isBrandQuery } from "@/lib/data/gscq";
import { attributeToQueries, type PageValue } from "@/lib/intel/attribution";
import { matchDemand } from "@/lib/intel/products";
import { cleanProductName } from "@/lib/intel/text";
import { clusterQueries } from "@/lib/intel/topics";
import { pctText, rankInsights } from "@/lib/insights/types";
import { calibrationScale, clickGainAtPosition } from "@/lib/metrics/ctr-curve";
import { computeDelta, ratio } from "@/lib/metrics/delta";
import { daysInclusive } from "@/lib/metrics/periods";
import { normalizePath } from "@/lib/metrics/url";
import { safe } from "@/lib/safe";

/**
 * Search Value & Topics — joins:
 *   GSC query × page clicks  +  GA4 organic landing-page revenue  → ₹ per query (attribution)
 *   GSC queries               →  topic clusters, share of voice, content gaps
 *   GA4 item metrics          +  GSC queries matched to products → product demand vs sales
 */
export async function getSearchValue(ctx: ViewContext) {
  const notices = new Notices();
  const range = ctx.period.range;
  const organicCtx: ViewContext = { ...ctx, filters: { ...ctx.filters, channel: "Organic Search" } };
  const [queries, queryPages, pageTotals, landing, items] = await Promise.all([
    safe(() => gscCompare(ctx, { dimensions: ["query"], maxRows: 25_000 })),
    safe(() => gscRange(ctx, { dimensions: ["query", "page"], maxRows: 50_000 }, range)),
    safe(() => gscRange(ctx, { dimensions: ["page"], aggregationType: "byPage", maxRows: 5000 }, range)),
    safe(() => ga4Range(organicCtx, { dimensions: ["landingPage"], metrics: ["sessions", "transactions", "keyEvents", "purchaseRevenue"], limit: 5000 }, range, notices)),
    safe(() => ga4Compare(ctx, { dimensions: ["itemName"], metrics: ["itemsViewed", "itemsAddedToCart", "itemsPurchased", "itemRevenue"], limit: 300, orderBy: { metric: "itemsViewed" } }, notices)),
  ]);
  if (!queries.ok) throw queries.error;

  const terms = ctx.settings.brandTerms;
  const month = 30 / daysInclusive(range);

  // Page value (GA4 organic landing pages) and total GSC clicks per page.
  const pageValue = new Map<string, PageValue>();
  if (landing.ok)
    for (const r of landing.data) {
      const k = normalizePath(String(r.landingPage), ctx.siteOrigin);
      const e = pageValue.get(k) ?? { revenue: 0, conversions: 0, sessions: 0 };
      e.revenue += Number(r.purchaseRevenue);
      e.conversions += Number(r.transactions);
      e.sessions += Number(r.sessions);
      pageValue.set(k, e);
    }
  const pageClicks = new Map<string, number>();
  if (pageTotals.ok) for (const r of pageTotals.data) pageClicks.set(normalizePath(r.keys.page, ctx.siteOrigin), (pageClicks.get(normalizePath(r.keys.page, ctx.siteOrigin)) ?? 0) + r.clicks);

  const qp = queryPages.ok
    ? queryPages.data.map((r) => ({ query: r.keys.query!, page: normalizePath(r.keys.page, ctx.siteOrigin), clicks: r.clicks, impressions: r.impressions, position: r.position }))
    : [];
  const attribution = attributeToQueries(qp, pageValue, pageClicks);
  const valueByQuery = new Map(attribution.queries.map((q) => [q.query, q]));

  // Query table with value, upside and value-weighted priority.
  const cur = queries.data.filter((q) => q.cur);
  const scale = calibrationScale(cur.filter((q) => !isBrandQuery(q.keys.query!, terms)).map((q) => q.cur!));
  const siteRpc = (() => {
    const rev = [...pageValue.values()].reduce((s, v) => s + v.revenue, 0);
    const clicks = [...pageClicks.values()].reduce((s, v) => s + v, 0);
    return clicks ? rev / clicks : 0;
  })();
  const pagesByQuery = new Map<string, typeof qp>();
  for (const r of qp) pagesByQuery.set(r.query, [...(pagesByQuery.get(r.query) ?? []), r]);

  const queryRows = cur.map((q) => {
    const query = q.keys.query!;
    const v = valueByQuery.get(query);
    const rpc = v && v.clicks ? v.revenuePerClick : 0;
    const upside = clickGainAtPosition(q.cur!, 3, scale) * month;
    // Value per click: the query's own ₹/click when it has history, else the site's organic ₹/click.
    const valuePerClick = rpc > 0 ? rpc : siteRpc;
    return {
      query,
      brand: isBrandQuery(query, terms) ? "Brand" : "Non-brand",
      clicks: q.cur!.clicks,
      clicksPrev: q.prev?.clicks ?? null,
      impressions: q.cur!.impressions,
      position: q.cur!.position,
      revenue: v?.revenue ?? 0,
      conversions: v?.conversions ?? 0,
      revenuePerClick: rpc || null,
      upsideClicks: upside,
      upsideInr: upside * valuePerClick,
      topPage: v?.topPage ?? pagesByQuery.get(query)?.[0]?.page ?? "",
    };
  });

  // Topics.
  const { topics } = clusterQueries(
    cur.map((q) => ({
      query: q.keys.query!,
      clicks: q.cur!.clicks,
      impressions: q.cur!.impressions,
      position: q.cur!.position,
      isBrand: isBrandQuery(q.keys.query!, terms),
      revenue: valueByQuery.get(q.keys.query!)?.revenue ?? 0,
      pages: pagesByQuery.get(q.keys.query!) ?? [],
    })),
    { ctrScale: scale },
  );
  const topicRows = topics.map((t) => ({ ...t, impressionsMonth: t.impressions * month, upsideMonth: t.upside * month, topQueries: t.topQueries.join(" · ") }));

  // Product demand vs sales.
  const productRows = (() => {
    if (!items.ok) return [];
    const names = items.data.map((i) => i.dims.itemName!).filter((n) => n && n !== "(not set)");
    const demand = matchDemand(
      names,
      queries.data.map((q) => ({ query: q.keys.query!, clicks: q.cur?.clicks ?? 0, impressions: q.cur?.impressions ?? 0, impressionsPrev: q.prev?.impressions ?? 0 })),
    );
    const totalDemand = [...demand.values()].reduce((s, d) => s + d.impressions, 0);
    const totalRev = items.data.reduce((s, i) => s + (i.cur.itemRevenue ?? 0), 0);
    return items.data
      .filter((i) => i.dims.itemName && i.dims.itemName !== "(not set)")
      .map((i) => {
        const d = demand.get(i.dims.itemName!)!;
        const demandShare = totalDemand ? d.impressions / totalDemand : 0;
        const revenueShare = totalRev ? (i.cur.itemRevenue ?? 0) / totalRev : 0;
        return {
          product: cleanProductName(i.dims.itemName!),
          searchImpressions: d.impressions,
          searchTrend: ctx.period.comparison && d.impressionsPrev ? computeDelta(d.impressions, d.impressionsPrev).pct : null,
          searchClicks: d.clicks,
          views: i.cur.itemsViewed,
          addToCarts: i.cur.itemsAddedToCart,
          purchased: i.cur.itemsPurchased,
          revenue: i.cur.itemRevenue,
          viewToCart: ratio(i.cur.itemsAddedToCart, i.cur.itemsViewed),
          cartToPurchase: ratio(i.cur.itemsPurchased, i.cur.itemsAddedToCart),
          demandShare,
          revenueShare,
          signal:
            demandShare > revenueShare * 1.5 && demandShare > 0.05
              ? "Demand > sales"
              : revenueShare > demandShare * 1.5 && revenueShare > 0.05
                ? "Sells beyond search"
                : "Balanced",
          topQueries: d.topQueries.join(" · "),
        };
      })
      .filter((p) => (p.views ?? 0) > 0 || p.searchImpressions > 0);
  })();

  const topRev = attribution.queries[0];
  const gaps = topicRows.filter((t) => t.gap);
  const topUpside = [...queryRows].filter((q) => q.brand === "Non-brand").sort((a, b) => b.upsideInr - a.upsideInr)[0];
  const demandGap = productRows.filter((p) => p.signal === "Demand > sales").sort((a, b) => b.demandShare - a.demandShare)[0];
  const bestTopic = topicRows.filter((t) => t.topic !== "Brand" && t.topic !== "Other").sort((a, b) => b.revenue - a.revenue)[0];
  const insights = rankInsights([
    topRev && topRev.revenue > 0 && { tone: "positive", text: `“${topRev.query}” is the most valuable search: about ₹${Math.round(topRev.revenue).toLocaleString("en-IN")} of organic revenue (₹${topRev.revenuePerClick.toFixed(0)} per click).`, weight: 10 },
    bestTopic && bestTopic.revenue > 0 && { tone: "info", text: `Top earning topic: “${bestTopic.topic}”, with ${bestTopic.queries} queries, ${pctText(bestTopic.shareOfVoice)} share of voice and ≈₹${Math.round(bestTopic.revenue).toLocaleString("en-IN")}.`, weight: 8 },
    topUpside && topUpside.upsideInr > 0 && { tone: "action", text: `Biggest ₹ upside: ranking “${topUpside.query}” in the top 3 is worth ≈₹${Math.round(topUpside.upsideInr).toLocaleString("en-IN")}/month (+${Math.round(topUpside.upsideClicks)} clicks).`, weight: 9 },
    gaps.length > 0 && { tone: "warning", text: `${gaps.length} ${gaps.length === 1 ? "topic has" : "topics have"} demand but no page in the top 10, e.g. “${gaps[0]!.topic}” (${Math.round(gaps[0]!.impressionsMonth).toLocaleString("en-IN")} impressions/month).`, action: "Create a dedicated page for each", weight: 7 },
    demandGap && { tone: "warning", text: `${demandGap.product} gets ${pctText(demandGap.demandShare)} of product search demand but only ${pctText(demandGap.revenueShare)} of product revenue.`, action: "Check its landing page, price and stock", weight: 6 },
    attribution.anonymizedRevenue > 0 && { tone: "info", text: `₹${Math.round(attribution.anonymizedRevenue).toLocaleString("en-IN")} of organic revenue came via anonymized queries Google doesn't reveal.`, weight: 2 },
  ]);

  return { queryRows, topicRows, productRows, attribution, scale, siteRpc, insights, notices: notices.list(), itemsOk: items.ok };
}
