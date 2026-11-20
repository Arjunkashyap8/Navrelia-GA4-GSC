import "server-only";
import { Notices, type ViewContext } from "@/lib/data/context";
import { cached, ttlForRangeEnd } from "@/lib/cache";
import { ga4FilterExpression, ga4Funnel, ga4Range, ga4Totals } from "@/lib/data/ga4q";
import { getEnv } from "@/lib/env";
import { runFunnelReport, type FunnelRequest } from "@/lib/google/ga4";
import type { DateRange } from "@/lib/metrics/periods";
import { pctText, rankInsights } from "@/lib/insights/types";
import { ratio } from "@/lib/metrics/delta";
import { safe } from "@/lib/safe";

/**
 * Checkout Funnel Lab — GA4 runFunnelReport (v1alpha):
 *  - closed (sequential) or open funnel over the e-commerce steps the property actually fires
 *  - breakdowns by device and channel, segments by entry page type
 *  - "next action" after each step (what people did instead of continuing)
 *  - ₹ at risk = checkout-stage abandonments × average order value
 */

const CORE_STEPS = ["view_item", "add_to_cart", "begin_checkout", "purchase"];
// Shopify fires shipping/payment events inconsistently, which wrongly drops buyers from a closed
// funnel; they are only included when the user asks for the detailed funnel.
const DETAILED_STEPS = ["view_item", "add_to_cart", "begin_checkout", "add_shipping_info", "add_payment_info", "purchase"];
export const STEP_LABEL: Record<string, string> = {
  view_item: "Viewed product",
  add_to_cart: "Added to cart",
  begin_checkout: "Started checkout",
  add_shipping_info: "Added shipping",
  add_payment_info: "Added payment",
  purchase: "Purchased",
};
const ENTRY_TYPES = [
  // GA4 FULL_REGEXP must match the whole landing page path.
  { id: "products", label: "Product pages", match: "/products/.*" },
  { id: "collections", label: "Collection pages", match: "/collections.*" },
  { id: "blogs", label: "Blog / content", match: "/blogs/.*" },
  { id: "home", label: "Home page", match: "/" },
];

export async function getFunnelLab(ctx: ViewContext, open: boolean, detailed = false) {
  const notices = new Notices();
  const range = ctx.period.range;
  const events = await ga4Range(ctx, { dimensions: ["eventName"], metrics: ["eventCount"], limit: 500 }, range, notices);
  const present = new Set(events.map((e) => String(e.eventName)));
  const steps = (detailed ? DETAILED_STEPS : CORE_STEPS).filter((s) => present.has(s));
  if (steps.length < 2) return { steps, empty: true as const };

  const [main, device, channel, totals, cmp, ...entries] = await Promise.all([
    ga4Funnel(ctx, { steps, open, nextAction: true }, range),
    safe(() => ga4Funnel(ctx, { steps, open, breakdown: "deviceCategory", ignore: ["device"] }, range)),
    safe(() => ga4Funnel(ctx, { steps, open, breakdown: "sessionDefaultChannelGroup", ignore: ["channel"] }, range)),
    ga4Totals(ctx, ["purchaseRevenue", "transactions"], notices),
    ctx.period.comparison ? safe(() => ga4Funnel(ctx, { steps, open }, ctx.period.comparison!)) : Promise.resolve(null),
    ...ENTRY_TYPES.map((t) => safe(() => ga4FunnelWithLanding(ctx, steps, open, t.match, range))),
  ]);

  const total = main.table.filter((r) => r.segment === "RESERVED_TOTAL").sort((a, b) => a.index - b.index);
  const first = total[0]?.activeUsers ?? 0;
  const stepRows = total.map((r, i) => ({
    step: STEP_LABEL[r.step] ?? r.step,
    event: r.step,
    users: r.activeUsers,
    ofStart: ratio(r.activeUsers, first),
    toNext: i < total.length - 1 ? r.completionRate : null,
    abandonments: i < total.length - 1 ? r.abandonments : null,
    abandonmentRate: i < total.length - 1 ? r.abandonmentRate : null,
  }));

  const segmentRows = (rows: typeof main.table) => {
    const segs = [...new Set(rows.map((r) => r.segment))].filter((s) => s !== "RESERVED_TOTAL");
    return segs
      .map((seg) => {
        const rs = rows.filter((r) => r.segment === seg).sort((a, b) => a.index - b.index);
        const start = rs[0]?.activeUsers ?? 0;
        const end = rs[rs.length - 1]?.activeUsers ?? 0;
        const o: Record<string, string | number | null> = { segment: seg, starters: start, completed: end, conversion: ratio(end, start) };
        rs.slice(0, -1).forEach((r) => (o[`c_${r.step}`] = r.completionRate));
        return o;
      })
      .filter((o) => Number(o.starters) >= 10)
      .sort((a, b) => Number(b.starters) - Number(a.starters));
  };

  const aov = ratio(totals.cur.purchaseRevenue, totals.cur.transactions) ?? 0;
  const checkoutIdx = total.findIndex((r) => r.step === "begin_checkout");
  const lastIdx = total.length - 1;
  const checkoutAbandons = checkoutIdx >= 0 ? total.slice(checkoutIdx, lastIdx).reduce((s, r) => s + r.abandonments, 0) : 0;
  const cartIdx = total.findIndex((r) => r.step === "add_to_cart");
  const cartAbandons = cartIdx >= 0 ? total.slice(cartIdx, lastIdx).reduce((s, r) => s + r.abandonments, 0) : 0;
  const atRisk = checkoutAbandons * aov;

  const next = main.nextActions
    .filter((n) => n.index < total.length && n.action !== "(no next action)")
    .map((n) => ({ step: STEP_LABEL[n.step] ?? n.step, action: n.action, users: n.users }));
  const exits = main.nextActions.filter((n) => n.action === "(no next action)").map((n) => ({ step: STEP_LABEL[n.step] ?? n.step, users: n.users }));

  const cmpTotal = cmp && cmp.ok ? cmp.data.table.filter((r) => r.segment === "RESERVED_TOTAL").sort((a, b) => a.index - b.index) : null;
  const overall = ratio(total[lastIdx]?.activeUsers, first);
  const overallPrev = cmpTotal ? ratio(cmpTotal[cmpTotal.length - 1]?.activeUsers, cmpTotal[0]?.activeUsers) : null;

  const entryRows = ENTRY_TYPES.map((t, i) => {
    const e = entries[i];
    if (!e || !e.ok) return null;
    const rs = e.data.table.filter((r) => r.segment === "RESERVED_TOTAL").sort((a, b) => a.index - b.index);
    const start = rs[0]?.activeUsers ?? 0;
    const o: Record<string, string | number | null> = { segment: t.label, starters: start, completed: rs[rs.length - 1]?.activeUsers ?? 0, conversion: ratio(rs[rs.length - 1]?.activeUsers, start) };
    rs.slice(0, -1).forEach((r) => (o[`c_${r.step}`] = r.completionRate));
    return o;
  }).filter((x): x is Record<string, string | number | null> => x !== null && Number(x.starters) > 0);

  const worst = stepRows.slice(0, -1).filter((s) => s.toNext !== null).sort((a, b) => (a.toNext ?? 1) - (b.toNext ?? 1))[0];
  const devRows = device.ok ? segmentRows(device.data.table) : [];
  const mob = devRows.find((d) => d.segment === "mobile");
  const desk = devRows.find((d) => d.segment === "desktop");
  const chRows = channel.ok ? segmentRows(channel.data.table) : [];
  const bestCh = [...chRows].filter((c) => Number(c.starters) >= 30).sort((a, b) => Number(b.conversion) - Number(a.conversion))[0];
  const topNext = next.filter((n) => n.step === stepRows[0]?.step).sort((a, b) => b.users - a.users)[0];

  const insights = rankInsights([
    { tone: overallPrev !== null && overall !== null ? (overall >= overallPrev ? "positive" : "negative") : "info", text: `${pctText(overall, 1)} of product viewers complete a purchase${overallPrev !== null ? ` (was ${pctText(overallPrev, 1)})` : ""} in this ${open ? "open" : "step-by-step"} funnel.`, weight: 10 },
    worst && { tone: "warning", text: `Biggest leak: only ${pctText(worst.toNext, 1)} go from “${worst.step.toLowerCase()}” to the next step (${(worst.abandonments ?? 0).toLocaleString("en-IN")} people drop out).`, action: "Fix this step first", weight: 9 },
    atRisk > 0 && { tone: "action", text: `${checkoutAbandons.toLocaleString("en-IN")} shoppers started checkout but didn't buy, carts worth ≈₹${Math.round(atRisk).toLocaleString("en-IN")} at the average order of ₹${Math.round(aov).toLocaleString("en-IN")}.`, action: "Recover with cart/checkout reminders (WhatsApp, email)", weight: 8 },
    mob && desk && { tone: Number(mob.conversion) < Number(desk.conversion) * 0.7 ? "warning" : "info", text: `Mobile completes at ${pctText(Number(mob.conversion), 1)} vs desktop ${pctText(Number(desk.conversion), 1)}.`, weight: 7 },
    bestCh && { tone: "positive", text: `${bestCh.segment} shoppers convert best through the funnel (${pctText(Number(bestCh.conversion), 1)}).`, weight: 6 },
    topNext && { tone: "info", text: `After viewing a product, the most common next action other than leaving is “${topNext.action}”.`, weight: 4 },
  ]);

  return { empty: false as const, steps, stepRows, devRows, chRows, entryRows, next, exits, aov, atRisk, checkoutAbandons, cartAbandons, overall, overallPrev, insights, notices: notices.list() };
}

/** Funnel restricted to sessions whose landing page fully matches a regex. */
async function ga4FunnelWithLanding(ctx: ViewContext, steps: string[], open: boolean, regex: string, range: DateRange) {
  const req: FunnelRequest = {
    dateRanges: [{ startDate: range.start, endDate: range.end }],
    funnel: { isOpenFunnel: open, steps: steps.map((e) => ({ name: e, filterExpression: { funnelEventFilter: { eventName: e } } })) },
    dimensionFilter: ga4FilterExpression(ctx.filters, {
      ignore: ["page"],
      extraFilter: { filter: { fieldName: "landingPage", stringFilter: { matchType: "FULL_REGEXP", value: regex } } },
    }),
  };
  const { value } = await cached("ga4-funnel", { p: getEnv().GA4_PROPERTY_ID, req }, ttlForRangeEnd(range.end), () => runFunnelReport(req));
  return value;
}
