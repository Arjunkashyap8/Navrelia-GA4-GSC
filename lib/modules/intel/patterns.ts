import "server-only";
import { cached, ttlForRangeEnd } from "@/lib/cache";
import type { ViewContext } from "@/lib/data/context";
import { ga4FilterExpression, withFilterDimensions } from "@/lib/data/ga4q";
import { getEnv } from "@/lib/env";
import { batchRunPivotReports, pivotRows, type PivotRequest } from "@/lib/google/ga4";
import { cleanProductName } from "@/lib/intel/text";
import { pctText, rankInsights } from "@/lib/insights/types";
import { ratio } from "@/lib/metrics/delta";

/**
 * Buying Patterns — three GA4 pivot reports in ONE batchRunPivotReports call:
 *   1. day of week × hour   (sessions, purchases, revenue)   → when people browse vs buy
 *   2. channel × device     (sessions, purchases, revenue)   → which combinations convert
 *   3. product × Indian state (items purchased, item revenue) → where each product sells
 */

export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"));

export async function getPatterns(ctx: ViewContext) {
  const range = ctx.period.range;
  const dr = [{ startDate: range.start, endDate: range.end }];
  const base = ga4FilterExpression(ctx.filters, {});
  const india = { filter: { fieldName: "countryId", stringFilter: { matchType: "EXACT", value: "IN" } } };
  const reqs: PivotRequest[] = ([
    {
      dateRanges: dr,
      dimensions: [{ name: "dayOfWeekName" }, { name: "hour" }],
      metrics: [{ name: "sessions" }, { name: "transactions" }, { name: "purchaseRevenue" }],
      pivots: [{ fieldNames: ["dayOfWeekName"], limit: 7 }, { fieldNames: ["hour"], limit: 24 }],
      dimensionFilter: base,
    },
    {
      dateRanges: dr,
      dimensions: [{ name: "sessionDefaultChannelGroup" }, { name: "deviceCategory" }],
      metrics: [{ name: "sessions" }, { name: "transactions" }, { name: "purchaseRevenue" }],
      pivots: [{ fieldNames: ["sessionDefaultChannelGroup"], limit: 10 }, { fieldNames: ["deviceCategory"], limit: 4 }],
      dimensionFilter: ga4FilterExpression(ctx.filters, { ignore: ["channel", "device"] }),
    },
    {
      dateRanges: dr,
      dimensions: [{ name: "itemName" }, { name: "region" }],
      metrics: [{ name: "itemsPurchased" }, { name: "itemRevenue" }],
      pivots: [
        { fieldNames: ["itemName"], limit: 10, orderBys: [{ metric: { metricName: "itemRevenue" }, desc: true }] },
        { fieldNames: ["region"], limit: 10, orderBys: [{ metric: { metricName: "itemRevenue" }, desc: true }] },
      ],
      dimensionFilter: ga4FilterExpression(ctx.filters, { ignore: ["country"], extraFilter: india }),
    },
  ] as PivotRequest[]).map(withFilterDimensions);
  const { value } = await cached("ga4-pivot-batch", { p: getEnv().GA4_PROPERTY_ID, reqs }, ttlForRangeEnd(range.end), async () => {
    const res = await batchRunPivotReports(reqs);
    return [
      pivotRows(res[0]!, ["dayOfWeekName", "hour"]),
      pivotRows(res[1]!, ["sessionDefaultChannelGroup", "deviceCategory"]),
      pivotRows(res[2]!, ["itemName", "region"]),
    ];
  });
  const [dh, cd, pr] = value as [Record<string, string | number>[], Record<string, string | number>[], Record<string, string | number>[]];

  // 1. Day × hour matrices.
  // Sum rows: extra filter dimensions (e.g. landing page) can split one day × hour cell into several rows.
  const sum = (rows: Record<string, string | number>[], pred: (r: Record<string, string | number>) => boolean, metric: string) => rows.filter(pred).reduce((s, r) => s + Number(r[metric] ?? 0), 0);
  const grid = (metric: string) => DAYS.map((d) => HOURS.map((h) => sum(dh, (r) => r.dayOfWeekName === d && String(r.hour).padStart(2, "0") === h, metric)));
  const sessions = grid("sessions");
  const purchases = grid("transactions");
  const revenue = grid("purchaseRevenue");
  const convRate = sessions.map((row, di) => row.map((s, hi) => (s >= 15 ? purchases[di]![hi]! / s : null)));
  const byDay = DAYS.map((d, i) => ({ day: d, sessions: sessions[i]!.reduce((a, b) => a + b, 0), purchases: purchases[i]!.reduce((a, b) => a + b, 0), revenue: revenue[i]!.reduce((a, b) => a + b, 0) }));
  const byHour = HOURS.map((h, i) => ({ hour: `${h}:00`, sessions: DAYS.reduce((s, _, d) => s + sessions[d]![i]!, 0), purchases: DAYS.reduce((s, _, d) => s + purchases[d]![i]!, 0), revenue: DAYS.reduce((s, _, d) => s + revenue[d]![i]!, 0) }));
  // 3-hour windows for a stable "best time to buy".
  const windows = Array.from({ length: 8 }, (_, w) => {
    const hs = byHour.slice(w * 3, w * 3 + 3);
    const s = hs.reduce((a, b) => a + b.sessions, 0);
    const p = hs.reduce((a, b) => a + b.purchases, 0);
    return { window: `${String(w * 3).padStart(2, "0")}:00–${String(w * 3 + 3).padStart(2, "0")}:00`, sessions: s, purchases: p, conversionRate: ratio(p, s) };
  });

  // 2. Channel × device matrix.
  const channels = [...new Set(cd.map((r) => String(r.sessionDefaultChannelGroup)))];
  const devices = ["mobile", "desktop", "tablet"].filter((d) => cd.some((r) => r.deviceCategory === d));
  const cdRows = channels
    .map((ch) => {
      const o: Record<string, string | number | null> = { channel: ch };
      let s = 0;
      let p = 0;
      for (const dv of devices) {
        const pred = (x: Record<string, string | number>) => x.sessionDefaultChannelGroup === ch && x.deviceCategory === dv;
        const rs = sum(cd, pred, "sessions");
        const rt = sum(cd, pred, "transactions");
        const rr = sum(cd, pred, "purchaseRevenue");
        o[`s_${dv}`] = rs;
        o[`cr_${dv}`] = rs >= 10 ? rt / rs : null;
        o[`rps_${dv}`] = rs >= 10 ? rr / rs : null;
        s += rs;
        p += rt;
      }
      o.sessions = s;
      o.conversionRate = ratio(p, s);
      return o;
    })
    .sort((a, b) => Number(b.sessions) - Number(a.sessions));
  const cdHeat = cdRows.slice(0, 8).map((r) => devices.map((d) => r[`cr_${d}`] as number | null));

  // 3. Product × state.
  const products = [...new Set(pr.map((r) => String(r.itemName)))].filter((p) => p !== "(not set)");
  const states = [...new Set(pr.map((r) => String(r.region)))].filter((s) => s && s !== "(not set)");
  const prHeat = products.map((p) => states.map((s) => sum(pr, (r) => r.itemName === p && r.region === s, "itemRevenue")));
  const productTopState = products.map((p, i) => {
    const row = prHeat[i]!;
    const total = row.reduce((a, b) => a + b, 0);
    const top = row.indexOf(Math.max(...row));
    return { product: cleanProductName(p), revenue: total, topState: states[top] ?? "—", topShare: ratio(row[top], total) };
  });

  // Insights.
  const peakDay = [...byDay].sort((a, b) => b.purchases - a.purchases)[0]!;
  const quietDay = [...byDay].sort((a, b) => a.purchases - b.purchases)[0]!;
  const bestWindow = [...windows].filter((w) => w.sessions >= 50).sort((a, b) => (b.conversionRate ?? 0) - (a.conversionRate ?? 0))[0];
  const busiestWindow = [...windows].sort((a, b) => b.sessions - a.sessions)[0]!;
  const bestCombo = cdRows
    .flatMap((r) => devices.map((d) => ({ name: `${r.channel} on ${d}`, cr: r[`cr_${d}`] as number | null, s: Number(r[`s_${d}`]) })))
    .filter((x) => x.cr !== null && x.s >= 30)
    .sort((a, b) => (b.cr ?? 0) - (a.cr ?? 0))[0];
  const insights = rankInsights([
    { tone: "info", text: `Most orders land on ${peakDay.day}s (${peakDay.purchases}); ${quietDay.day} is the quietest (${quietDay.purchases}).`, weight: 9 },
    bestWindow && { tone: "action", text: `Shoppers convert best between ${bestWindow.window} IST (${pctText(bestWindow.conversionRate, 1)}), while traffic peaks ${busiestWindow.window}.`, action: "Schedule ads, emails and WhatsApp pushes for the converting window", weight: 10 },
    bestCombo && { tone: "positive", text: `Best-converting combination: ${bestCombo.name} (${pctText(bestCombo.cr, 1)}).`, weight: 8 },
    productTopState[0] && { tone: "info", text: `${productTopState[0].product} sells most in ${productTopState[0].topState} (${pctText(productTopState[0].topShare)} of its revenue).`, weight: 6 },
  ]);

  return { sessions, purchases, convRate, revenue, byDay, byHour, windows, cdRows, cdHeat, devices, channels: cdRows.slice(0, 8).map((r) => String(r.channel)), products: products.map(cleanProductName), states, prHeat, productTopState, insights, hours: HOURS };
}
