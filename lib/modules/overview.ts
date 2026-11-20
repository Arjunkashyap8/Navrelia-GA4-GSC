import "server-only";
import { Notices, type ViewContext } from "@/lib/data/context";
import { ga4Compare, ga4Range, ga4Totals } from "@/lib/data/ga4q";
import { countryName, gscCompare, gscTotals } from "@/lib/data/gscq";
import { ga4Daily, gscDaily } from "@/lib/data/series";
import { getTrackingChecks } from "@/lib/data/tracking";
import { getSqlite } from "@/lib/db/client";
import { healthScore } from "@/lib/insights/health";
import { changeWord, pctText, rankInsights, type Insight } from "@/lib/insights/types";
import { computeDelta, projectMonthEnd, ratio } from "@/lib/metrics/delta";
import { addDays, daysInclusive, formatRange } from "@/lib/metrics/periods";
import { safe, type Settled } from "@/lib/safe";
import { getTargets, listAnnotations } from "@/lib/settings-store";

const GA4_KPI_METRICS = ["totalUsers", "sessions", "engagedSessions", "keyEvents", "purchaseRevenue", "transactions"];

export interface Mover {
  kind: "Channel" | "Page" | "Query" | "Country";
  name: string;
  drill: { type: "channel" | "page" | "query" | "country"; id: string };
  metric: string;
  cur: number;
  prev: number;
  change: number;
}

function topMovers(movers: Mover[]) {
  const sorted = [...movers].sort((a, b) => b.change - a.change);
  return {
    up: sorted.filter((m) => m.change > 0).slice(0, 5),
    down: sorted.filter((m) => m.change < 0).reverse().slice(0, 5),
  };
}

/** Month-to-date actuals + run-rate projections for targets (always the current calendar month). */
async function targetProgress(ctx: ViewContext) {
  const month = ctx.today.slice(0, 7);
  const targets = getTargets(month);
  if (!Object.keys(targets).length) return { month, targets, actual: {}, projected: {} };
  const start = `${month}-01`;
  const yesterday = addDays(ctx.today, -1);
  const [y, m] = month.split("-").map(Number) as [number, number];
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const daysElapsed = yesterday >= start ? daysInclusive({ start, end: yesterday }) : 0;
  const ga4 = daysElapsed
    ? (await ga4Range({ ...ctx, filters: { searchType: "web" } }, { metrics: ["sessions", "keyEvents", "purchaseRevenue"] }, { start, end: yesterday }))[0]
    : undefined;
  // GSC lags 2–3 days: project from the days that have data.
  const gsc = getSqlite()
    .prepare("SELECT SUM(clicks) c, COUNT(*) n FROM gsc_daily WHERE search_type = 'web' AND date >= ? AND date <= ?")
    .get(start, yesterday) as { c: number | null; n: number };
  const actual = {
    sessions: Number(ga4?.sessions ?? 0),
    keyEvents: Number(ga4?.keyEvents ?? 0),
    revenue: Number(ga4?.purchaseRevenue ?? 0),
    organicClicks: gsc.c ?? 0,
  };
  const projected = {
    sessions: projectMonthEnd(actual.sessions, daysElapsed, daysInMonth),
    keyEvents: projectMonthEnd(actual.keyEvents, daysElapsed, daysInMonth),
    revenue: projectMonthEnd(actual.revenue, daysElapsed, daysInMonth),
    organicClicks: projectMonthEnd(actual.organicClicks, gsc.n, daysInMonth),
  };
  return { month, targets, actual, projected };
}

export async function getOverview(ctx: ViewContext) {
  const notices = new Notices();
  const { range, comparison } = ctx.period;

  const [ga4t, gsct, ga4d, gscd, channels, pages, countries, queries, tracking, targets] = await Promise.all([
    safe(() => ga4Totals(ctx, GA4_KPI_METRICS, notices)),
    safe(() => gscTotals(ctx)),
    safe(() => ga4Daily(ctx, GA4_KPI_METRICS, {}, notices)),
    safe(() => gscDaily(ctx)),
    safe(() => ga4Compare(ctx, { dimensions: ["sessionDefaultChannelGroup"], metrics: ["sessions", "keyEvents", "purchaseRevenue", "transactions"], ignore: ["channel"] }, notices)),
    safe(() => ga4Compare(ctx, { dimensions: ["landingPage"], metrics: ["sessions"], limit: 300, orderBy: { metric: "sessions" } }, notices)),
    safe(() => ga4Compare(ctx, { dimensions: ["countryId", "country"], metrics: ["sessions"], limit: 100, orderBy: { metric: "sessions" }, ignore: ["country"] }, notices)),
    safe(() => gscCompare(ctx, { dimensions: ["query"], maxRows: 5000 })),
    safe(() => getTrackingChecks(ctx, notices)),
    safe(() => targetProgress(ctx)),
  ]);

  // Movers across channels, pages, queries, countries.
  const movers: Mover[] = [];
  if (comparison) {
    if (channels.ok)
      for (const r of channels.data)
        movers.push({ kind: "Channel", name: r.dims.sessionDefaultChannelGroup!, drill: { type: "channel", id: r.dims.sessionDefaultChannelGroup! }, metric: "sessions", cur: r.cur.sessions!, prev: r.prev?.sessions ?? 0, change: r.cur.sessions! - (r.prev?.sessions ?? 0) });
    if (pages.ok)
      for (const r of pages.data)
        movers.push({ kind: "Page", name: r.dims.landingPage!, drill: { type: "page", id: r.dims.landingPage! }, metric: "sessions", cur: r.cur.sessions!, prev: r.prev?.sessions ?? 0, change: r.cur.sessions! - (r.prev?.sessions ?? 0) });
    if (countries.ok)
      for (const r of countries.data)
        movers.push({ kind: "Country", name: r.dims.country!, drill: { type: "country", id: r.dims.countryId! }, metric: "sessions", cur: r.cur.sessions!, prev: r.prev?.sessions ?? 0, change: r.cur.sessions! - (r.prev?.sessions ?? 0) });
    if (queries.ok)
      for (const r of queries.data)
        movers.push({ kind: "Query", name: r.keys.query!, drill: { type: "query", id: r.keys.query! }, metric: "organic clicks", cur: r.cur?.clicks ?? 0, prev: r.prev?.clicks ?? 0, change: (r.cur?.clicks ?? 0) - (r.prev?.clicks ?? 0) });
  }
  const moverLists = topMovers(movers.filter((m) => m.name && m.name !== "(not set)"));

  // Health score.
  const health =
    ga4t.ok && gsct.ok
      ? healthScore({
          sessions: { cur: ga4t.data.cur.sessions!, prev: ga4t.data.prev?.sessions ?? null },
          engagementRate: ratio(ga4t.data.cur.engagedSessions, ga4t.data.cur.sessions),
          conversionRate: {
            cur: ratio(ga4t.data.cur.transactions || ga4t.data.cur.keyEvents, ga4t.data.cur.sessions),
            prev: ga4t.data.prev ? ratio(ga4t.data.prev.transactions || ga4t.data.prev.keyEvents, ga4t.data.prev.sessions) : null,
          },
          organicClicks: { cur: gsct.data.cur.clicks, prev: gsct.data.prev?.clicks ?? null },
          impressions: { cur: gsct.data.cur.impressions, prev: gsct.data.prev?.impressions ?? null },
          trackingChecks: tracking.ok ? tracking.data.map((c) => ({ label: c.label, ok: c.ok })) : [],
        })
      : null;

  const insights = buildInsights(ctx, ga4t, gsct, channels, moverLists);
  const summary = buildSummary(ctx, ga4t, gsct, channels, moverLists);
  const preliminaryFrom = getSqlite().prepare("SELECT MAX(date) d FROM gsc_daily WHERE search_type='web'").get() as { d: string | null };

  return {
    ga4t,
    gsct,
    ga4d,
    gscd,
    channels,
    moverLists,
    tracking,
    targets,
    health,
    insights,
    summary,
    annotations: listAnnotations(range),
    notices: notices.list(),
    preliminaryFrom: preliminaryFrom.d ? addDays(preliminaryFrom.d, -2) : null,
  };
}

function buildInsights(
  ctx: ViewContext,
  ga4t: Settled<{ cur: Record<string, number>; prev: Record<string, number> | null }>,
  gsct: Settled<Awaited<ReturnType<typeof gscTotals>>>,
  channels: Settled<Awaited<ReturnType<typeof ga4Compare>>>,
  movers: ReturnType<typeof topMovers>,
): Insight[] {
  const out: (Insight | null)[] = [];
  const cmpLabel = ctx.period.compare === "yoy" ? "the same period last year" : "the previous period";
  if (ga4t.ok && ga4t.data.prev) {
    const d = computeDelta(ga4t.data.cur.sessions, ga4t.data.prev.sessions);
    out.push({
      tone: d.sentiment === "good" ? "positive" : d.sentiment === "bad" ? "negative" : "info",
      text: `Sessions ${changeWord(d.pct)} ${pctText(d.pct)} vs ${cmpLabel} (${Math.round(d.current ?? 0).toLocaleString("en-IN")}).`,
      weight: 10,
    });
    const r = computeDelta(ga4t.data.cur.purchaseRevenue, ga4t.data.prev.purchaseRevenue);
    if (ga4t.data.cur.purchaseRevenue || ga4t.data.prev.purchaseRevenue)
      out.push({
        tone: r.sentiment === "good" ? "positive" : r.sentiment === "bad" ? "negative" : "info",
        text: `Revenue ${changeWord(r.pct)} ${pctText(r.pct)} to ₹${Math.round(r.current ?? 0).toLocaleString("en-IN")} from ${Math.round(ga4t.data.cur.transactions ?? 0)} orders.`,
        weight: 9,
      });
  }
  if (gsct.ok && gsct.data.prev) {
    const d = computeDelta(gsct.data.cur.clicks, gsct.data.prev.clicks);
    out.push({
      tone: d.sentiment === "good" ? "positive" : d.sentiment === "bad" ? "negative" : "info",
      text: `Google organic clicks ${changeWord(d.pct)} ${pctText(d.pct)}; average position ${gsct.data.cur.position.toFixed(1)} (was ${gsct.data.prev.position.toFixed(1)}).`,
      weight: 8,
    });
  }
  const top = movers.down[0];
  if (top) out.push({ tone: "negative", text: `Biggest drop: ${top.kind.toLowerCase()} “${top.name}” lost ${Math.abs(Math.round(top.change)).toLocaleString("en-IN")} ${top.metric}.`, weight: 7 });
  const up = movers.up[0];
  if (up) out.push({ tone: "positive", text: `Biggest gain: ${up.kind.toLowerCase()} “${up.name}” added ${Math.round(up.change).toLocaleString("en-IN")} ${up.metric}.`, weight: 6 });
  if (channels.ok) {
    const best = [...channels.data].filter((c) => c.cur.sessions! >= 30).sort((a, b) => b.cur.purchaseRevenue! / b.cur.sessions! - a.cur.purchaseRevenue! / a.cur.sessions!)[0];
    if (best && best.cur.purchaseRevenue! > 0)
      out.push({ tone: "info", text: `${best.dims.sessionDefaultChannelGroup} earns the most per visit: ₹${(best.cur.purchaseRevenue! / best.cur.sessions!).toFixed(0)} revenue per session.`, weight: 5 });
  }
  return rankInsights(out);
}

function buildSummary(
  ctx: ViewContext,
  ga4t: Settled<{ cur: Record<string, number>; prev: Record<string, number> | null }>,
  gsct: Settled<Awaited<ReturnType<typeof gscTotals>>>,
  channels: Settled<Awaited<ReturnType<typeof ga4Compare>>>,
  movers: ReturnType<typeof topMovers>,
): string {
  const parts: string[] = [];
  const period = formatRange(ctx.period.range);
  if (ga4t.ok) {
    const c = ga4t.data.cur;
    const p = ga4t.data.prev;
    const s = p ? computeDelta(c.sessions, p.sessions) : null;
    parts.push(
      `Between ${period}, navreliafoods.com had ${Math.round(c.totalUsers!).toLocaleString("en-IN")} visitors across ${Math.round(c.sessions!).toLocaleString("en-IN")} visits${s && s.pct !== null ? ` (${s.pct >= 0 ? "up" : "down"} ${pctText(s.pct)} on ${ctx.period.compare === "yoy" ? "last year" : "the previous period"})` : ""}.`,
    );
    if (c.transactions)
      parts.push(`The site took ${Math.round(c.transactions).toLocaleString("en-IN")} orders worth ₹${Math.round(c.purchaseRevenue!).toLocaleString("en-IN")}, an average of ₹${Math.round(c.purchaseRevenue! / c.transactions).toLocaleString("en-IN")} per order.`);
  }
  if (gsct.ok) {
    const c = gsct.data.cur;
    const p = gsct.data.prev;
    const d = p ? computeDelta(c.clicks, p.clicks) : null;
    parts.push(
      `On Google Search, the site appeared ${Math.round(c.impressions).toLocaleString("en-IN")} times and received ${Math.round(c.clicks).toLocaleString("en-IN")} clicks${d && d.pct !== null ? ` (${d.pct >= 0 ? "up" : "down"} ${pctText(d.pct)})` : ""}.`,
    );
  }
  if (channels.ok) {
    const byRev = [...channels.data].sort((a, b) => b.cur.purchaseRevenue! - a.cur.purchaseRevenue!)[0];
    if (byRev && byRev.cur.purchaseRevenue! > 0) parts.push(`${byRev.dims.sessionDefaultChannelGroup} brought in the most revenue.`);
  }
  if (movers.down[0]) parts.push(`The main area to watch is ${movers.down[0].kind.toLowerCase()} “${movers.down[0].name}”, which declined.`);
  return parts.join(" ");
}

export { countryName };
