import "server-only";
import { Notices, type ViewContext } from "@/lib/data/context";
import { ga4Compare, ga4Range } from "@/lib/data/ga4q";
import { gscRange } from "@/lib/data/gscq";
import { decayFromSnapshots } from "@/lib/data/decay";
import { pctText, rankInsights } from "@/lib/insights/types";
import { ratio } from "@/lib/metrics/delta";
import { groupOf, normalizePath } from "@/lib/metrics/url";
import { safe } from "@/lib/safe";

export async function getContent(ctx: ViewContext) {
  const notices = new Notices();
  const [landing, scroll, gsc] = await Promise.all([
    safe(() =>
      ga4Compare(ctx, { dimensions: ["landingPage"], metrics: ["sessions", "engagedSessions", "userEngagementDuration", "keyEvents", "transactions", "purchaseRevenue", "screenPageViews"], limit: 3000, orderBy: { metric: "sessions" } }, notices),
    ),
    safe(() =>
      ga4Range(ctx, { dimensions: ["pagePath"], metrics: ["eventCount"], pageDimension: "pagePath", extraFilter: { filter: { fieldName: "eventName", stringFilter: { matchType: "EXACT", value: "scroll" } } }, limit: 5000 }, ctx.period.range, notices),
    ),
    safe(() => gscRange(ctx, { dimensions: ["page"], aggregationType: "byPage", maxRows: 5000 }, ctx.period.range)),
  ]);

  const scrollBy = new Map<string, number>();
  if (scroll.ok) for (const r of scroll.data) scrollBy.set(normalizePath(String(r.pagePath), ctx.siteOrigin), (scrollBy.get(normalizePath(String(r.pagePath), ctx.siteOrigin)) ?? 0) + Number(r.eventCount));
  const clicksBy = new Map<string, number>();
  if (gsc.ok) for (const r of gsc.data) clicksBy.set(normalizePath(r.keys.page, ctx.siteOrigin), (clicksBy.get(normalizePath(r.keys.page, ctx.siteOrigin)) ?? 0) + r.clicks);

  const merged = new Map<string, Record<string, number>>();
  if (landing.ok)
    for (const r of landing.data) {
      const k = normalizePath(r.dims.landingPage, ctx.siteOrigin);
      const e = merged.get(k) ?? { sessions: 0, sessionsPrev: 0, engagedSessions: 0, dur: 0, keyEvents: 0, transactions: 0, revenue: 0, views: 0 };
      e.sessions! += r.cur.sessions!;
      e.sessionsPrev! += r.prev?.sessions ?? 0;
      e.engagedSessions! += r.cur.engagedSessions!;
      e.dur! += r.cur.userEngagementDuration!;
      e.keyEvents! += r.cur.keyEvents!;
      e.transactions! += r.cur.transactions!;
      e.revenue! += r.cur.purchaseRevenue!;
      e.views! += r.cur.screenPageViews!;
      merged.set(k, e);
    }
  const hasCmp = Boolean(ctx.period.comparison);
  const ecommerce = [...merged.values()].some((e) => e.transactions! > 0);
  const pages = [...merged.entries()]
    .filter(([, e]) => e.sessions! > 0)
    .map(([page, e]) => ({
      page,
      group: groupOf(page, ctx.settings.groupRules),
      organicClicks: clicksBy.get(page) ?? 0,
      sessions: e.sessions!,
      sessionsPrev: hasCmp ? e.sessionsPrev! : null,
      engagementRate: ratio(e.engagedSessions, e.sessions),
      engagementTime: ratio(e.dur, e.sessions),
      scrolls: scrollBy.get(page) ?? 0,
      keyEvents: e.keyEvents!,
      transactions: e.transactions!,
      conversionRate: ratio(ecommerce ? e.transactions : e.keyEvents, e.sessions),
      revenue: e.revenue!,
      entrances: e.sessions!,
    }));

  // Quadrant: median split of pages with ≥10 sessions.
  const q = pages.filter((p) => p.sessions >= 10 && p.page !== "(not set)");
  const med = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length ? s[Math.floor(s.length / 2)]! : 0;
  };
  const xMid = med(q.map((p) => p.sessions));
  const totalS = q.reduce((s, p) => s + p.sessions, 0);
  const totalC = q.reduce((s, p) => s + (p.conversionRate ?? 0) * p.sessions, 0);
  const yMid = totalS ? totalC / totalS : 0; // site-average conversion rate
  const quadrant = (p: (typeof q)[number]) => (p.sessions >= xMid ? ((p.conversionRate ?? 0) >= yMid ? "Stars" : "Fix conversion") : (p.conversionRate ?? 0) >= yMid ? "Promote" : "Review");
  const quadRows = q.map((p) => ({ ...p, quadrant: quadrant(p) }));

  // Groups.
  const groups = new Map<string, { group: string; pages: number; sessions: number; organicClicks: number; keyEvents: number; transactions: number; revenue: number; engaged: number }>();
  for (const p of pages) {
    const g = groups.get(p.group) ?? { group: p.group, pages: 0, sessions: 0, organicClicks: 0, keyEvents: 0, transactions: 0, revenue: 0, engaged: 0 };
    g.pages++;
    g.sessions += p.sessions;
    g.organicClicks += p.organicClicks;
    g.keyEvents += p.keyEvents;
    g.transactions += p.transactions;
    g.revenue += p.revenue;
    g.engaged += (p.engagementRate ?? 0) * p.sessions;
    groups.set(p.group, g);
  }
  const groupRows = [...groups.values()].map((g) => ({ ...g, engagementRate: ratio(g.engaged, g.sessions), conversionRate: ratio(ecommerce ? g.transactions : g.keyEvents, g.sessions) }));

  // Decay (3 months vs prior 3 months) from snapshots.
  const decay = decayFromSnapshots(ctx.filters.page);
  const decayRows = decay.rows
    .filter((r) => r.clicksBefore >= 10 && r.clicksNow < r.clicksBefore * 0.8)
    .map((r) => {
      const impChange = r.impBefore ? (r.impNow - r.impBefore) / r.impBefore : null;
      const posChange = r.posNow - r.posBefore;
      return {
        page: r.path,
        clicksBefore: r.clicksBefore,
        clicksNow: r.clicksNow,
        clickChange: (r.clicksNow - r.clicksBefore) / r.clicksBefore,
        impChange,
        posBefore: r.posBefore,
        posNow: r.posNow,
        diagnosis: posChange >= 1 ? "Lost rankings" : impChange !== null && impChange < -0.15 ? "Lost demand" : "Lower CTR",
      };
    })
    .sort((a, b) => b.clicksBefore - b.clicksNow - (a.clicksBefore - a.clicksNow));

  const counts = { Stars: 0, "Fix conversion": 0, Promote: 0, Review: 0 } as Record<string, number>;
  quadRows.forEach((r) => counts[r.quadrant]!++);
  const fix = quadRows.filter((r) => r.quadrant === "Fix conversion").sort((a, b) => b.sessions - a.sessions)[0];
  const promote = quadRows.filter((r) => r.quadrant === "Promote").sort((a, b) => (b.conversionRate ?? 0) - (a.conversionRate ?? 0))[0];
  const top = [...pages].sort((a, b) => b.sessions - a.sessions)[0];
  const insights = rankInsights([
    top && { tone: "info", text: `${top.page} is the top landing page with ${top.sessions.toLocaleString("en-IN")} sessions (${pctText(ratio(top.sessions, pages.reduce((s, p) => s + p.sessions, 0)))} of all).`, weight: 6 },
    fix && { tone: "warning", text: `${fix.page} brings ${fix.sessions.toLocaleString("en-IN")} sessions but converts at ${pctText(fix.conversionRate, 1)} (site ${pctText(yMid, 1)}).`, action: "CRO review", weight: 9 },
    promote && { tone: "action", text: `${promote.page} converts at ${pctText(promote.conversionRate, 1)} but gets few visits.`, action: "Link to it from top pages", weight: 8 },
    decayRows.length > 0 && { tone: "negative", text: `${decayRows.length} pages lost 20%+ of organic clicks over the last 3 months; worst: ${decayRows[0]!.page} (${decayRows[0]!.diagnosis.toLowerCase()}).`, weight: 7 },
    { tone: "info", text: `Quadrants: ${counts.Stars} stars, ${counts["Fix conversion"]} to fix, ${counts.Promote} to promote, ${counts.Review} to review.`, weight: 3 },
  ]);

  return { landing, pages, quadRows, xMid, yMid, groupRows, decayRows, decayWindow: decay.window, ecommerce, insights, notices: notices.list(), scrollOk: scroll.ok };
}
