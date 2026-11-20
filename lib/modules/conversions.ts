import "server-only";
import { cached, TTL } from "@/lib/cache";
import { Notices, type ViewContext } from "@/lib/data/context";
import { ga4Compare, ga4Range, ga4Totals } from "@/lib/data/ga4q";
import { ga4Daily } from "@/lib/data/series";
import { getEnv } from "@/lib/env";
import { listKeyEvents } from "@/lib/google/admin";
import { pctText, rankInsights } from "@/lib/insights/types";
import { ratio } from "@/lib/metrics/delta";
import { safe } from "@/lib/safe";
import { listAnnotations } from "@/lib/settings-store";

export const FUNNEL = ["view_item", "add_to_cart", "begin_checkout", "add_payment_info", "purchase"] as const;
const FUNNEL_LABEL: Record<string, string> = { view_item: "Viewed product", add_to_cart: "Added to cart", begin_checkout: "Started checkout", add_payment_info: "Added payment info", purchase: "Purchased" };
const ECOM_EVENTS = ["purchase", "add_to_cart", "begin_checkout"];

function funnelFrom(rows: Record<string, string | number>[], segDim?: string) {
  const bySeg = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const seg = segDim ? String(r[segDim]) : "All";
    const e = bySeg.get(seg) ?? {};
    e[String(r.eventName)] = Number(r.totalUsers);
    bySeg.set(seg, e);
  }
  return [...bySeg.entries()].map(([segment, e]) => ({
    segment,
    steps: FUNNEL.map((ev, i) => {
      const users = e[ev] ?? 0;
      const prev = i === 0 ? users : (e[FUNNEL[i - 1]!] ?? 0);
      return { event: ev, label: FUNNEL_LABEL[ev]!, users, fromPrev: i === 0 ? 1 : ratio(users, prev), fromStart: ratio(users, e[FUNNEL[0]] ?? 0) };
    }),
  }));
}

export async function getConversions(ctx: ViewContext) {
  const notices = new Notices();
  const eventFilter = { filter: { fieldName: "eventName", inListFilter: { values: [...FUNNEL] } } };
  const [keyEventDefs, eventCounts, totals, daily, funnel, funnelDevice, funnelChannel, products, byChannel, byLanding, byCity] = await Promise.all([
    safe(() => cached("admin-keyevents", { p: getEnv().GA4_PROPERTY_ID }, TTL.closed, () => listKeyEvents()).then((r) => r.value)),
    safe(() => ga4Compare(ctx, { dimensions: ["eventName"], metrics: ["eventCount", "keyEvents", "totalUsers"], limit: 500, orderBy: { metric: "eventCount" } }, notices)),
    safe(() => ga4Totals(ctx, ["purchaseRevenue", "transactions", "itemsPurchased", "sessions", "keyEvents", "totalPurchasers"], notices)),
    safe(() => ga4Daily(ctx, ["purchaseRevenue", "transactions"], {}, notices)),
    safe(() => ga4Range(ctx, { dimensions: ["eventName"], metrics: ["totalUsers"], extraFilter: eventFilter }, ctx.period.range, notices)),
    safe(() => ga4Range(ctx, { dimensions: ["eventName", "deviceCategory"], metrics: ["totalUsers"], extraFilter: eventFilter }, ctx.period.range, notices)),
    safe(() => ga4Range(ctx, { dimensions: ["eventName", "sessionDefaultChannelGroup"], metrics: ["totalUsers"], extraFilter: eventFilter, ignore: ["channel"] }, ctx.period.range, notices)),
    safe(() => ga4Compare(ctx, { dimensions: ["itemName"], metrics: ["itemRevenue", "itemsPurchased", "itemsViewed", "itemsAddedToCart"], limit: 500, orderBy: { metric: "itemRevenue" } }, notices)),
    safe(() => ga4Compare(ctx, { dimensions: ["sessionDefaultChannelGroup"], metrics: ["purchaseRevenue", "transactions", "sessions"], ignore: ["channel"] }, notices)),
    safe(() => ga4Compare(ctx, { dimensions: ["landingPage"], metrics: ["purchaseRevenue", "transactions", "sessions"], limit: 300, orderBy: { metric: "purchaseRevenue" } }, notices)),
    safe(() => ga4Compare(ctx, { dimensions: ["city", "region"], metrics: ["purchaseRevenue", "transactions", "sessions"], limit: 300, orderBy: { metric: "purchaseRevenue" } }, notices)),
  ]);

  const names = new Set(eventCounts.ok ? eventCounts.data.map((e) => e.dims.eventName) : []);
  const ecommerce = ECOM_EVENTS.some((e) => names.has(e));
  const keySet = new Set(keyEventDefs.ok ? keyEventDefs.data.map((k) => k.eventName) : []);
  const keyEventRows = eventCounts.ok
    ? eventCounts.data
        .filter((e) => keySet.has(e.dims.eventName!))
        .map((e) => ({ event: e.dims.eventName, count: e.cur.keyEvents || e.cur.eventCount, countPrev: e.prev ? e.prev.keyEvents || e.prev.eventCount : null, users: e.cur.totalUsers, perUser: ratio(e.cur.eventCount, e.cur.totalUsers) }))
    : [];

  const t = totals.ok ? totals.data : null;
  const aov = t ? ratio(t.cur.purchaseRevenue, t.cur.transactions) : null;
  const productRows = products.ok
    ? products.data
        .filter((p) => p.dims.itemName !== "(not set)")
        .map((p) => ({ product: p.dims.itemName, revenue: p.cur.itemRevenue, revenuePrev: p.prev?.itemRevenue ?? null, quantity: p.cur.itemsPurchased, views: p.cur.itemsViewed, addToCarts: p.cur.itemsAddedToCart, viewToPurchase: ratio(p.cur.itemsPurchased, p.cur.itemsViewed) }))
    : [];
  const rev = (rows: Awaited<ReturnType<typeof ga4Compare>>, dim: string, label = (r: (typeof rows)[number]) => r.dims[dim]!) =>
    rows.filter((r) => r.cur.purchaseRevenue! > 0 || (r.prev?.purchaseRevenue ?? 0) > 0).map((r) => ({ name: label(r), revenue: r.cur.purchaseRevenue, revenuePrev: r.prev?.purchaseRevenue ?? null, transactions: r.cur.transactions, sessions: r.cur.sessions, conversionRate: ratio(r.cur.transactions, r.cur.sessions), aov: ratio(r.cur.purchaseRevenue, r.cur.transactions) }));

  const f = funnel.ok ? funnelFrom(funnel.data)[0] : undefined;
  const worst = f?.steps.slice(1).filter((s) => s.fromPrev !== null).sort((a, b) => (a.fromPrev ?? 1) - (b.fromPrev ?? 1))[0];
  const fd = funnelDevice.ok ? funnelFrom(funnelDevice.data, "deviceCategory") : [];
  const mob = fd.find((s) => s.segment === "mobile");
  const desk = fd.find((s) => s.segment === "desktop");
  const topProduct = productRows[0];

  const insights = rankInsights([
    t && t.prev && { tone: (t.cur.purchaseRevenue ?? 0) >= (t.prev.purchaseRevenue ?? 0) ? "positive" : "negative", text: `Revenue ₹${Math.round(t.cur.purchaseRevenue!).toLocaleString("en-IN")} from ${t.cur.transactions} orders (was ₹${Math.round(t.prev.purchaseRevenue!).toLocaleString("en-IN")} from ${t.prev.transactions}).`, weight: 10 },
    aov !== null && aov > 0 && { tone: "info", text: `Average order value is ₹${Math.round(aov).toLocaleString("en-IN")}, with ${(ratio(t?.cur.itemsPurchased, t?.cur.transactions) ?? 0).toFixed(1)} items per order.`, weight: 6 },
    worst && { tone: "warning", text: `Biggest funnel leak: only ${pctText(worst.fromPrev)} of users move on to “${worst.label.toLowerCase()}”.`, action: "Investigate that step first", weight: 9 },
    mob && desk && mob.steps[4]!.fromStart !== null && desk.steps[4]!.fromStart !== null && { tone: (mob.steps[4]!.fromStart ?? 0) < (desk.steps[4]!.fromStart ?? 0) * 0.7 ? "warning" : "info", text: `Mobile view-to-purchase rate is ${pctText(mob.steps[4]!.fromStart, 1)} vs desktop ${pctText(desk.steps[4]!.fromStart, 1)}.`, weight: 7 },
    topProduct && { tone: "positive", text: `Top product: ${topProduct.product} with ₹${Math.round(topProduct.revenue ?? 0).toLocaleString("en-IN")} revenue (${topProduct.quantity} units).`, weight: 8 },
  ]);

  return {
    ecommerce,
    keyEventDefs,
    keyEventRows,
    totals,
    daily,
    aov,
    funnel: f,
    funnelDevice: fd,
    funnelChannel: funnelChannel.ok ? funnelFrom(funnelChannel.data, "sessionDefaultChannelGroup") : [],
    productRows,
    products,
    byChannel: byChannel.ok ? rev(byChannel.data, "sessionDefaultChannelGroup") : [],
    byLanding: byLanding.ok ? rev(byLanding.data, "landingPage") : [],
    byCity: byCity.ok ? rev(byCity.data, "city", (r) => `${r.dims.city}, ${r.dims.region}`) : [],
    insights,
    annotations: listAnnotations(ctx.period.range),
    notices: notices.list(),
  };
}
