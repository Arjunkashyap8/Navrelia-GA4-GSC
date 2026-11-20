import "server-only";
import { Notices, type ViewContext } from "@/lib/data/context";
import { ga4Range } from "@/lib/data/ga4q";
import { gscRange } from "@/lib/data/gscq";
import { pctText, rankInsights } from "@/lib/insights/types";
import { ratio } from "@/lib/metrics/delta";
import { normalizePath } from "@/lib/metrics/url";
import { safe } from "@/lib/safe";

/**
 * Content → Commerce — joins, per blog post:
 *   GSC page clicks/impressions/position (search reach)
 *   GA4 landing sessions, engagement, purchases, revenue (what blog entrances buy)
 *   GA4 page_view transitions with a blog page as referrer (blog → product clicks)
 * and classifies each post: Converter · Feeder · Dead end · Hidden (reach without clicks).
 */

const CONTENT = "/blogs/";
const PRODUCT = /^\/(products|collections)\//;
const ARTICLE = /^\/blogs\/[^/]+\/[^/]+/;
const contains = (field: string, value: string) => ({ filter: { fieldName: field, stringFilter: { matchType: "CONTAINS", value, caseSensitive: false } } });

export async function getContentCommerce(ctx: ViewContext) {
  const notices = new Notices();
  const range = ctx.period.range;
  const [gsc, landing, views, transitions] = await Promise.all([
    safe(() => gscRange(ctx, { dimensions: ["page"], aggregationType: "byPage", maxRows: 5000, extraFilters: [{ dimension: "page", operator: "contains", expression: CONTENT }] }, range)),
    ga4Range(ctx, { dimensions: ["landingPage"], metrics: ["sessions", "engagedSessions", "userEngagementDuration", "transactions", "purchaseRevenue", "keyEvents"], extraFilter: contains("landingPage", CONTENT), limit: 2000 }, range, notices),
    ga4Range(ctx, { dimensions: ["pagePath"], metrics: ["screenPageViews", "totalUsers"], pageDimension: "pagePath", extraFilter: contains("pagePath", CONTENT), limit: 2000 }, range, notices),
    safe(() =>
      ga4Range(
        ctx,
        {
          dimensions: ["pageReferrer", "pagePath"],
          metrics: ["eventCount"],
          pageDimension: "pagePath",
          extraFilter: { andGroup: { expressions: [{ filter: { fieldName: "eventName", stringFilter: { matchType: "EXACT", value: "page_view" } } }, contains("pageReferrer", CONTENT)] } },
          limit: 10_000,
        },
        range,
        notices,
      ),
    ),
  ]);

  type Post = { page: string; impressions: number; clicks: number; position: number | null; sessions: number; engaged: number; duration: number; purchases: number; revenue: number; views: number; productClicks: number; destinations: Map<string, number> };
  const posts = new Map<string, Post>();
  const get = (raw: string) => {
    const page = normalizePath(raw, ctx.siteOrigin);
    // Shopify article URLs: /blogs/{blog}/{article}. Blog index pages are excluded.
    if (!ARTICLE.test(page)) return null;
    let p = posts.get(page);
    if (!p) {
      p = { page, impressions: 0, clicks: 0, position: null, sessions: 0, engaged: 0, duration: 0, purchases: 0, revenue: 0, views: 0, productClicks: 0, destinations: new Map() };
      posts.set(page, p);
    }
    return p;
  };
  if (gsc.ok)
    for (const r of gsc.data) {
      const p = get(r.keys.page!);
      if (!p) continue;
      p.position = p.impressions + r.impressions ? ((p.position ?? 0) * p.impressions + r.position * r.impressions) / (p.impressions + r.impressions) : null;
      p.impressions += r.impressions;
      p.clicks += r.clicks;
    }
  for (const r of landing) {
    const p = get(String(r.landingPage));
    if (!p) continue;
    p.sessions += Number(r.sessions);
    p.engaged += Number(r.engagedSessions);
    p.duration += Number(r.userEngagementDuration);
    p.purchases += Number(r.transactions);
    p.revenue += Number(r.purchaseRevenue);
  }
  for (const r of views) {
    const p = get(String(r.pagePath));
    if (p) p.views += Number(r.screenPageViews);
  }
  const productTraffic = new Map<string, number>();
  if (transitions.ok)
    for (const r of transitions.data) {
      const p = get(String(r.pageReferrer));
      const dest = normalizePath(String(r.pagePath), ctx.siteOrigin);
      if (!p || !PRODUCT.test(dest)) continue;
      const n = Number(r.eventCount);
      p.productClicks += n;
      p.destinations.set(dest, (p.destinations.get(dest) ?? 0) + n);
      productTraffic.set(dest, (productTraffic.get(dest) ?? 0) + n);
    }

  const rows = [...posts.values()]
    .filter((p) => p.views + p.impressions > 0)
    .map((p) => {
      const productClickRate = ratio(p.productClicks, p.views);
      const top = [...p.destinations.entries()].sort((a, b) => b[1] - a[1])[0];
      return {
        page: p.page,
        impressions: p.impressions,
        clicks: p.clicks,
        position: p.position,
        views: p.views,
        sessions: p.sessions,
        engagementRate: ratio(p.engaged, p.sessions),
        engagementTime: ratio(p.duration, p.sessions),
        productClicks: p.productClicks,
        productClickRate,
        purchases: p.purchases,
        revenue: p.revenue,
        topDestination: top?.[0] ?? "—",
        role: "",
      };
    });
  const rates = rows.filter((r) => r.views >= 20).map((r) => r.productClickRate ?? 0).sort((a, b) => a - b);
  const medianRate = rates[Math.floor(rates.length / 2)] ?? 0;
  for (const r of rows) {
    r.role =
      r.revenue > 0 || r.purchases > 0
        ? "Converter"
        : (r.productClickRate ?? 0) >= Math.max(medianRate, 0.05) && r.views >= 20
          ? "Feeder"
          : r.views >= 30 && (r.productClickRate ?? 0) < 0.02
            ? "Dead end"
            : r.impressions >= 200 && r.clicks <= 2
              ? "Hidden"
              : "Building";
  }

  const totals = {
    impressions: rows.reduce((s, r) => s + r.impressions, 0),
    clicks: rows.reduce((s, r) => s + r.clicks, 0),
    views: rows.reduce((s, r) => s + r.views, 0),
    productClicks: rows.reduce((s, r) => s + r.productClicks, 0),
    purchases: rows.reduce((s, r) => s + r.purchases, 0),
    revenue: rows.reduce((s, r) => s + r.revenue, 0),
  };
  const destinations = [...productTraffic.entries()].map(([page, clicks]) => ({ page, clicks })).sort((a, b) => b.clicks - a.clicks);
  const deadEnds = rows.filter((r) => r.role === "Dead end").sort((a, b) => b.views - a.views);
  const hidden = rows.filter((r) => r.role === "Hidden").sort((a, b) => b.impressions - a.impressions);
  const bestFeeder = [...rows].filter((r) => r.views >= 20).sort((a, b) => (b.productClickRate ?? 0) - (a.productClickRate ?? 0))[0];

  const insights = rankInsights([
    { tone: "info", text: `Blog content earned ${totals.impressions.toLocaleString("en-IN")} Google impressions, ${totals.views.toLocaleString("en-IN")} page views and sent ${totals.productClicks.toLocaleString("en-IN")} ${totals.productClicks === 1 ? "click" : "clicks"} to product pages (${pctText(ratio(totals.productClicks, totals.views), 1)}).`, weight: 10 },
    totals.revenue > 0 && { tone: "positive", text: `Visits that started on a blog post produced ${totals.purchases} orders worth ₹${Math.round(totals.revenue).toLocaleString("en-IN")}.`, weight: 9 },
    deadEnds[0] && { tone: "warning", text: `${deadEnds.length} ${deadEnds.length === 1 ? "post is a dead end" : "posts are dead ends"}: readers rarely click to a product. Biggest: ${deadEnds[0].page} (${deadEnds[0].views} views).`, action: "Add product cards and in-text links", weight: 8 },
    hidden[0] && { tone: "action", text: `${hidden.length} ${hidden.length === 1 ? "post shows" : "posts show"} in Google but get almost no clicks, e.g. ${hidden[0].page} (${hidden[0].impressions.toLocaleString("en-IN")} impressions).`, action: "Rewrite their titles and meta descriptions", weight: 7 },
    bestFeeder && (bestFeeder.productClickRate ?? 0) > 0 && { tone: "positive", text: `Best feeder: ${bestFeeder.page} sends ${pctText(bestFeeder.productClickRate, 1)} of its readers to products (mostly ${bestFeeder.topDestination}).`, action: "Copy its format", weight: 6 },
  ]);

  return { rows, totals, destinations, insights, transitionsOk: transitions.ok, notices: notices.list() };
}
