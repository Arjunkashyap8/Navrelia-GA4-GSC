import "server-only";
import { Notices, type ViewContext } from "@/lib/data/context";
import { ga4Compare, ga4Range, ga4Totals } from "@/lib/data/ga4q";
import { ga4Daily } from "@/lib/data/series";
import { pctText, rankInsights } from "@/lib/insights/types";
import { ratio } from "@/lib/metrics/delta";
import { goalFields } from "@/lib/metrics/goal";
import { normalizePath } from "@/lib/metrics/url";
import { safe } from "@/lib/safe";

const evFilter = (name: string) => ({ filter: { fieldName: "eventName", stringFilter: { matchType: "EXACT", value: name } } });

/** Detectors only run for events that exist in the property (from the events report). */
export async function getEngagement(ctx: ViewContext) {
  const notices = new Notices();
  const r = ctx.period.range;
  const [events, totals, daily, entry] = await Promise.all([
    safe(() => ga4Compare(ctx, { dimensions: ["eventName"], metrics: ["eventCount", "totalUsers", "eventCountPerUser"], limit: 500, orderBy: { metric: "eventCount" } }, notices)),
    safe(() => ga4Totals(ctx, ["sessions", "engagedSessions", "userEngagementDuration", "screenPageViews", "eventCount"], notices)),
    safe(() => ga4Daily(ctx, ["engagedSessions", "sessions", "userEngagementDuration"], {}, notices)),
    safe(() =>
      ga4Range(ctx, { dimensions: ["landingPage"], metrics: ["sessions", "engagementRate", "userEngagementDuration", "screenPageViews", "keyEvents", "addToCarts", "checkouts", "transactions"], limit: 1000, orderBy: { metric: "sessions" } }, r, notices),
    ),
  ]);
  // Entry pages (where sessions start) with what happened next: engagement and key events.
  const entryAgg = new Map<string, { sessions: number; engaged: number; dur: number; views: number; keyEvents: number; addToCarts: number; checkouts: number; transactions: number }>();
  if (entry.ok)
    for (const row of entry.data) {
      const k = normalizePath(String(row.landingPage), ctx.siteOrigin);
      const e = entryAgg.get(k) ?? { sessions: 0, engaged: 0, dur: 0, views: 0, keyEvents: 0, addToCarts: 0, checkouts: 0, transactions: 0 };
      const ses = Number(row.sessions);
      e.sessions += ses;
      e.engaged += Number(row.engagementRate) * ses;
      e.dur += Number(row.userEngagementDuration);
      e.views += Number(row.screenPageViews);
      e.keyEvents += Number(row.keyEvents);
      e.addToCarts += Number(row.addToCarts);
      e.checkouts += Number(row.checkouts);
      e.transactions += Number(row.transactions);
      entryAgg.set(k, e);
    }
  const entryRows = [...entryAgg.entries()].map(([page, e]) => ({
    page,
    ...goalFields(e),
    engagementRate: ratio(e.engaged, e.sessions),
    engagementTime: ratio(e.dur, e.sessions),
    pagesPerSession: ratio(e.views, e.sessions),
    keyEvents: e.keyEvents,
  }));
  const names = new Set(events.ok ? events.data.map((e) => e.dims.eventName) : []);
  const has = (n: string) => names.has(n);

  const [downloads, outbound] = await Promise.all([
    has("file_download") ? safe(() => ga4Range(ctx, { dimensions: ["fileName"], metrics: ["eventCount", "totalUsers"], extraFilter: evFilter("file_download"), limit: 200, orderBy: { metric: "eventCount" } }, r, notices)) : null,
    has("click") ? safe(() => ga4Range(ctx, { dimensions: ["linkUrl"], metrics: ["eventCount", "totalUsers"], extraFilter: { andGroup: { expressions: [evFilter("click"), { filter: { fieldName: "outbound", stringFilter: { matchType: "EXACT", value: "true" } } }] } }, limit: 200, orderBy: { metric: "eventCount" } }, r, notices)) : null,
  ]);

  const t = totals.ok ? totals.data : null;
  const er = t ? ratio(t.cur.engagedSessions, t.cur.sessions) : null;
  const erPrev = t?.prev ? ratio(t.prev.engagedSessions, t.prev.sessions) : null;
  const scrollUsers = events.ok ? events.data.find((e) => e.dims.eventName === "scroll")?.cur.totalUsers : undefined;
  const pvUsers = events.ok ? events.data.find((e) => e.dims.eventName === "page_view")?.cur.totalUsers : undefined;

  const insights = rankInsights([
    er !== null && { tone: erPrev !== null ? (er >= erPrev ? "positive" : "negative") : "info", text: `Engagement rate is ${pctText(er, 1)}${erPrev !== null ? ` (was ${pctText(erPrev, 1)})` : ""}.`, weight: 9 },
    t && { tone: "info", text: `Visitors spend ${Math.round((ratio(t.cur.userEngagementDuration, t.cur.sessions) ?? 0))}s engaged per session and view ${(ratio(t.cur.screenPageViews, t.cur.sessions) ?? 0).toFixed(1)} pages.`, weight: 7 },
    scrollUsers && pvUsers ? { tone: "info", text: `${pctText(ratio(scrollUsers, pvUsers))} of users scroll 90% down at least one page.`, weight: 5 } : null,
  ]);

  return {
    events,
    eventRows: events.ok ? events.data.map((e) => ({ event: e.dims.eventName, count: e.cur.eventCount, countPrev: e.prev?.eventCount ?? null, users: e.cur.totalUsers, perUser: e.cur.eventCountPerUser })) : [],
    totals,
    daily,
    downloads,
    outbound,
    entryRows,
    entryOk: entry.ok,
    insights,
    notices: notices.list(),
  };
}
