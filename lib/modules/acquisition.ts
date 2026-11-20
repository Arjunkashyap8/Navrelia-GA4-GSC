import "server-only";
import { Notices, type ViewContext } from "@/lib/data/context";
import { ga4Compare, ga4Range, ga4Totals } from "@/lib/data/ga4q";
import { ga4Daily } from "@/lib/data/series";
import { datesOf } from "@/lib/data/series";
import { pctText, rankInsights } from "@/lib/insights/types";
import { ratio } from "@/lib/metrics/delta";
import { goalFields } from "@/lib/metrics/goal";
import { ga4DateToIso } from "@/lib/metrics/periods";
import { bucketSeries } from "@/lib/metrics/buckets";
import { safe } from "@/lib/safe";
import { listAnnotations } from "@/lib/settings-store";

const METRICS = ["sessions", "totalUsers", "engagedSessions", "keyEvents", "addToCarts", "checkouts", "transactions", "purchaseRevenue"];
const GATEWAYS = /razorpay|paytm|payu|phonepe|ccavenue|cashfree|billdesk|instamojo|stripe|paypal|juspay|checkout\.shopify/i;
const SPAM = /semalt|buttons-for|best-seo|seo-offer|free-traffic|traffic2|darodar|ilovevitaly|priceg|hulfingtonpost|\.xyz$|bot-traffic/i;

export async function getAcquisition(ctx: ViewContext, attribution: "session" | "first") {
  const notices = new Notices();
  const chDim = attribution === "first" ? "firstUserDefaultChannelGroup" : "sessionDefaultChannelGroup";
  const smDim = attribution === "first" ? "firstUserSourceMedium" : "sessionSourceMedium";
  const host = new URL(ctx.siteOrigin).hostname.replace(/^www\./, "");

  const [totals, daily, visitorType, channels, sourceMedium, campaigns, mix, newRet, referrals] = await Promise.all([
    safe(() => ga4Totals(ctx, ["sessions", "totalUsers", "newUsers", "engagedSessions", "addToCarts", "checkouts", "transactions", "purchaseRevenue"], notices)),
    safe(() => ga4Daily(ctx, ["sessions", "totalUsers", "addToCarts", "transactions"], {}, notices)),
    safe(() => ga4Compare(ctx, { dimensions: ["newVsReturning"], metrics: METRICS, ignore: ["customer"] }, notices)),
    safe(() => ga4Compare(ctx, { dimensions: [chDim], metrics: METRICS, ignore: ["channel"] }, notices)),
    safe(() => ga4Compare(ctx, { dimensions: [smDim], metrics: METRICS, limit: 500, orderBy: { metric: "sessions" } }, notices)),
    safe(() =>
      ga4Compare(ctx, { dimensions: ["sessionCampaignName", "sessionSourceMedium", "sessionManualAdContent", "sessionManualTerm"], metrics: METRICS, limit: 500, orderBy: { metric: "sessions" } }, notices),
    ),
    safe(() => ga4Range(ctx, { dimensions: ["date", "sessionDefaultChannelGroup"], metrics: ["sessions"], limit: 20_000, ignore: ["channel"] }, ctx.period.range, notices)),
    safe(() => ga4Range(ctx, { dimensions: ["sessionDefaultChannelGroup", "newVsReturning"], metrics: ["sessions", "transactions"], ignore: ["channel"] }, ctx.period.range, notices)),
    safe(() =>
      ga4Compare(ctx, { dimensions: ["sessionSource"], metrics: ["sessions", "engagedSessions", "keyEvents", "addToCarts", "checkouts", "transactions", "purchaseRevenue"], extraFilter: { filter: { fieldName: "sessionMedium", stringFilter: { matchType: "EXACT", value: "referral" } } }, limit: 300, orderBy: { metric: "sessions" } }, notices),
    ),
  ]);

  const row = (name: string, c: Record<string, number>, p: Record<string, number> | null) => ({
    name,
    ...goalFields(c),
    sessionsPrev: p?.sessions ?? null,
    conversionRatePrev: p ? ratio(p.transactions, p.sessions) : null,
    users: c.totalUsers,
    engagementRate: ratio(c.engagedSessions, c.sessions),
    keyEvents: c.keyEvents,
    revenue: c.purchaseRevenue,
    revenuePrev: p?.purchaseRevenue ?? null,
    revenuePerSession: ratio(c.purchaseRevenue, c.sessions),
  });

  const channelRows = channels.ok ? channels.data.map((r) => row(r.dims[chDim]!, r.cur, r.prev)) : [];
  const smRows = sourceMedium.ok ? sourceMedium.data.map((r) => row(r.dims[smDim]!, r.cur, r.prev)) : [];
  const campaignRows = campaigns.ok
    ? campaigns.data
        .filter((r) => r.dims.sessionCampaignName !== "(not set)" && r.dims.sessionCampaignName !== "(organic)" && r.dims.sessionCampaignName !== "(direct)" && r.dims.sessionCampaignName !== "(referral)")
        .map((r) => ({ ...row(r.dims.sessionCampaignName!, r.cur, r.prev), sourceMedium: r.dims.sessionSourceMedium, content: r.dims.sessionManualAdContent, term: r.dims.sessionManualTerm }))
    : [];

  // Channel mix over time (top 6 channels + Other).
  const dates = datesOf(ctx.period.range);
  let mixSeries: { name: string; data: number[] }[] = [];
  let mixDates = dates;
  if (mix.ok) {
    const totals = new Map<string, number>();
    mix.data.forEach((r) => totals.set(String(r.sessionDefaultChannelGroup), (totals.get(String(r.sessionDefaultChannelGroup)) ?? 0) + Number(r.sessions)));
    const top = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k]) => k);
    const idx = new Map(dates.map((d, i) => [d, i]));
    const series = new Map<string, number[]>([...top, "Other"].map((k) => [k, dates.map(() => 0)]));
    for (const r of mix.data) {
      const i = idx.get(ga4DateToIso(String(r.date)));
      if (i === undefined) continue;
      const k = top.includes(String(r.sessionDefaultChannelGroup)) ? String(r.sessionDefaultChannelGroup) : "Other";
      series.get(k)![i]! += Number(r.sessions);
    }
    const kept = [...series.entries()].filter(([, d]) => d.some((v) => v > 0));
    const grouped = bucketSeries({ dates, cur: Object.fromEntries(kept), prev: null }, ctx.filters.view ?? "day");
    mixDates = grouped.dates;
    mixSeries = kept.map(([name]) => ({ name, data: grouped.cur[name]! }));
  }

  const nr = new Map<string, { new: number; returning: number; newTx: number; retTx: number }>();
  if (newRet.ok)
    for (const r of newRet.data) {
      const k = String(r.sessionDefaultChannelGroup);
      const e = nr.get(k) ?? { new: 0, returning: 0, newTx: 0, retTx: 0 };
      if (r.newVsReturning === "new") {
        e.new += Number(r.sessions);
        e.newTx += Number(r.transactions);
      } else if (r.newVsReturning === "returning") {
        e.returning += Number(r.sessions);
        e.retTx += Number(r.transactions);
      }
      nr.set(k, e);
    }
  const newRetRows = [...nr.entries()].map(([channel, e]) => ({ channel, ...e })).sort((a, b) => b.new + b.returning - (a.new + a.returning));

  const referralRows = referrals.ok
    ? referrals.data.map((r) => {
        const src = r.dims.sessionSource!;
        const er = ratio(r.cur.engagedSessions, r.cur.sessions);
        const flag = src.includes(host) ? "Self-referral" : GATEWAYS.test(src) ? "Payment gateway" : SPAM.test(src) || (r.cur.sessions! >= 5 && (er ?? 0) === 0) ? "Likely spam" : "OK";
        return { source: src, ...goalFields(r.cur), sessionsPrev: r.prev?.sessions ?? null, conversionRatePrev: r.prev ? ratio(r.prev.transactions, r.prev.sessions) : null, engagementRate: er, keyEvents: r.cur.keyEvents, revenue: r.cur.purchaseRevenue, flag };
      })
    : [];

  const eligible = channelRows.filter((c) => (c.sessions ?? 0) >= 30);
  const bestRps = [...eligible].sort((a, b) => (b.revenuePerSession ?? 0) - (a.revenuePerSession ?? 0))[0];
  const bestCr = [...eligible].sort((a, b) => (b.conversionRate ?? 0) - (a.conversionRate ?? 0))[0];
  const biggest = [...channelRows].sort((a, b) => (b.sessions ?? 0) - (a.sessions ?? 0))[0];
  const flagged = referralRows.filter((r) => r.flag !== "OK");
  const insights = rankInsights([
    biggest && { tone: "info", text: `${biggest.name} brings the most visits (${(biggest.sessions ?? 0).toLocaleString("en-IN")} sessions).`, weight: 5 },
    bestRps && (bestRps.revenuePerSession ?? 0) > 0 && { tone: "positive", text: `Best customers come from ${bestRps.name}: ₹${(bestRps.revenuePerSession ?? 0).toFixed(0)} revenue per session and ${pctText(bestRps.conversionRate, 1)} conversion.`, weight: 10 },
    bestCr && bestCr !== bestRps && (bestCr.conversionRate ?? 0) > 0 && { tone: "positive", text: `${bestCr.name} has the highest conversion rate (${pctText(bestCr.conversionRate, 1)}).`, weight: 8 },
    biggest && bestRps && biggest !== bestRps && (biggest.revenuePerSession ?? 0) < (bestRps.revenuePerSession ?? 0) / 2 && { tone: "warning", text: `${biggest.name} drives volume but earns under half the revenue per visit of ${bestRps.name}.`, action: "Check targeting and landing pages for this channel", weight: 7 },
    flagged.length > 0 && { tone: "warning", text: `${flagged.length} referral sources look like self-referrals, payment gateways or spam.`, action: "Add them to GA4's unwanted referrals list", weight: 6 },
  ]);

  const visitorRows = visitorType.ok
    ? visitorType.data
        .filter((r) => r.dims.newVsReturning === "new" || r.dims.newVsReturning === "returning")
        .map((r) => row(r.dims.newVsReturning === "new" ? "New" : "Returning", r.cur, r.prev))
    : [];
  return { totals, daily, visitorRows, channels, channelRows, smRows, campaignRows, campaigns, dates: mixDates, mixSeries, newRetRows, referralRows, insights, annotations: listAnnotations(ctx.period.range), notices: notices.list() };
}
