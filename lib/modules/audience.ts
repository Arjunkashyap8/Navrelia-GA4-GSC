import "server-only";
import countries from "i18n-iso-countries";
import { cached, ttlForRangeEnd } from "@/lib/cache";
import { Notices, type ViewContext } from "@/lib/data/context";
import { ga4Compare, ga4FilterExpression, ga4Range } from "@/lib/data/ga4q";
import { gscCompare } from "@/lib/data/gscq";
import { getEnv } from "@/lib/env";
import { reportRows, runReport } from "@/lib/google/ga4";
import { pctText, rankInsights } from "@/lib/insights/types";
import { ratio } from "@/lib/metrics/delta";
import { goalFields } from "@/lib/metrics/goal";
import { addDays } from "@/lib/metrics/periods";
import { safe } from "@/lib/safe";

const M = ["sessions", "totalUsers", "engagedSessions", "addToCarts", "checkouts", "transactions", "purchaseRevenue"];
const GOAL = ["sessions", "totalUsers", "addToCarts", "checkouts", "transactions"];

function seg(rows: Awaited<ReturnType<typeof ga4Compare>>, dim: string, label?: (d: Record<string, string>) => string) {
  return rows.map((r) => ({
    name: label ? label(r.dims) : r.dims[dim],
    id: r.dims[dim],
    ...goalFields(r.cur),
    sessionsPrev: r.prev?.sessions ?? null,
    conversionRatePrev: r.prev ? ratio(r.prev.transactions, r.prev.sessions) : null,
    users: r.cur.totalUsers,
    engagementRate: ratio(r.cur.engagedSessions, r.cur.sessions),
    revenue: r.cur.purchaseRevenue,
  }));
}

/** Weekly cohort retention: users by first-session week, active in weeks 0–5. */
async function cohorts(ctx: ViewContext) {
  const end = addDays(ctx.today, -1);
  // Six consecutive acquisition weeks; the newest started 7 weeks ago so every cohort has 6 full weeks.
  const weeks = Array.from({ length: 6 }, (_, i) => {
    const startDate = addDays(end, -7 * (12 - i) + 1);
    return { name: `wk_${i}`, startDate, endDate: addDays(startDate, 6) };
  });
  const req = {
    dimensions: [{ name: "cohort" }, { name: "cohortNthWeek" }],
    metrics: [{ name: "cohortActiveUsers" }],
    cohortSpec: {
      cohorts: weeks.map((w) => ({ name: w.name, dimension: "firstSessionDate", dateRange: { startDate: w.startDate, endDate: w.endDate } })),
      cohortsRange: { granularity: "WEEKLY", startOffset: 0, endOffset: 5 } },
    dimensionFilter: ga4FilterExpression(ctx.filters, {}),
  };
  const { value } = await cached("ga4", { p: getEnv().GA4_PROPERTY_ID, req }, ttlForRangeEnd(end), async () => reportRows(await runReport(req)));
  return weeks.map((w) => {
    const rows = value.filter((r) => r.cohort === w.name);
    const base = Number(rows.find((r) => Number(r.cohortNthWeek) === 0)?.cohortActiveUsers ?? 0);
    return {
      cohort: `${w.startDate} – ${w.endDate}`,
      users: base,
      ...Object.fromEntries(Array.from({ length: 6 }, (_, n) => [`w${n}`, base ? Number(rows.find((r) => Number(r.cohortNthWeek) === n)?.cohortActiveUsers ?? 0) / base : null])),
    };
  });
}

export async function getAudience(ctx: ViewContext) {
  const notices = new Notices();
  const india = { filter: { fieldName: "countryId", stringFilter: { matchType: "EXACT", value: "IN" } } };
  const [ctry, gscCtry, states, cities, device, os, browser, screen, loyalty, age, gender, interests, cohort, languages, stateChannel] = await Promise.all([
    safe(() => ga4Compare(ctx, { dimensions: ["countryId", "country"], metrics: M, limit: 200, orderBy: { metric: "sessions" }, ignore: ["country"] }, notices)),
    safe(() => gscCompare(ctx, { dimensions: ["country"], ignore: ["country"], maxRows: 300 })),
    safe(() => ga4Compare(ctx, { dimensions: ["region"], metrics: M, limit: 60, orderBy: { metric: "sessions" }, extraFilter: india, ignore: ["country"] }, notices)),
    safe(() => ga4Compare(ctx, { dimensions: ["city", "region"], metrics: M, limit: 300, orderBy: { metric: "sessions" }, extraFilter: india, ignore: ["country"] }, notices)),
    safe(() => ga4Compare(ctx, { dimensions: ["deviceCategory"], metrics: M, ignore: ["device"] }, notices)),
    safe(() => ga4Compare(ctx, { dimensions: ["operatingSystem"], metrics: M, limit: 30, orderBy: { metric: "sessions" } }, notices)),
    safe(() => ga4Compare(ctx, { dimensions: ["browser"], metrics: M, limit: 30, orderBy: { metric: "sessions" } }, notices)),
    safe(() => ga4Compare(ctx, { dimensions: ["screenResolution"], metrics: M, limit: 30, orderBy: { metric: "sessions" } }, notices)),
    safe(() => ga4Compare(ctx, { dimensions: ["newVsReturning"], metrics: M }, notices)),
    safe(() => ga4Range(ctx, { dimensions: ["userAgeBracket"], metrics: GOAL }, ctx.period.range, notices)),
    safe(() => ga4Range(ctx, { dimensions: ["userGender"], metrics: GOAL }, ctx.period.range, notices)),
    safe(() => ga4Range(ctx, { dimensions: ["brandingInterest"], metrics: ["totalUsers"], limit: 20, orderBy: { metric: "totalUsers" } }, ctx.period.range, notices)),
    safe(() => cohorts(ctx)),
    safe(() => ga4Range(ctx, { dimensions: ["language"], metrics: GOAL, limit: 30, orderBy: { metric: "sessions" } }, ctx.period.range, notices)),
    safe(() =>
      ga4Range(ctx, { dimensions: ["region", "sessionDefaultChannelGroup"], metrics: ["sessions", "addToCarts", "checkouts", "transactions"], extraFilter: india, ignore: ["country", "channel"], limit: 2000 }, ctx.period.range, notices),
    ),
  ]);

  const gscBy = new Map<string, { clicks: number; impressions: number }>();
  if (gscCtry.ok) for (const r of gscCtry.data) if (r.cur) gscBy.set((countries.alpha3ToAlpha2(r.keys.country!.toUpperCase()) ?? "").toUpperCase(), r.cur);
  const countryRows = ctry.ok
    ? seg(ctry.data, "countryId", (d) => d.country!).map((r) => ({ ...r, gscClicks: gscBy.get(String(r.id))?.clicks ?? 0, gscImpressions: gscBy.get(String(r.id))?.impressions ?? 0 }))
    : [];

  const known = (rows: Record<string, string | number>[] | null, dim: string) => (rows ?? []).filter((r) => r[dim] && r[dim] !== "unknown" && r[dim] !== "(not set)");
  const ageRows = age.ok ? known(age.data, "userAgeBracket") : [];
  const genderRows = gender.ok ? known(gender.data, "userGender") : [];
  const interestRows = interests.ok ? known(interests.data, "brandingInterest") : [];
  const demographicsAvailable = ageRows.length + genderRows.length > 0;
  // Share of users GA4 can attribute an age to (Google Signals coverage; the rest are "unknown").
  const ageTotal = age.ok ? age.data.reduce((s, r) => s + Number(r.totalUsers), 0) : 0;
  const ageKnown = ageRows.reduce((s, r) => s + Number(r.totalUsers), 0);
  const demoCoverage = ageTotal ? ageKnown / ageTotal : null;
  const goalRows = (rows: Record<string, string | number>[], dim: string, label: (v: string) => string = (v) => v) =>
    rows.map((r) => ({ name: label(String(r[dim] || "(not set)")), users: Number(r.totalUsers), ...goalFields(r) })).sort((a, b) => b.sessions - a.sessions);
  const cap = (v: string) => (v ? v[0]!.toUpperCase() + v.slice(1) : v);
  const ageGoal = goalRows(ageRows, "userAgeBracket").sort((a, b) => a.name.localeCompare(b.name));
  const genderGoal = goalRows(genderRows, "userGender", cap);
  const languageGoal = languages.ok ? goalRows(languages.data, "language") : [];
  const languageRows = languages.ok ? languages.data.map((r) => ({ label: String(r.language || "(not set)"), value: Number(r.sessions) })) : [];

  // Sources × locations: top states × top channels (sessions and purchases).
  const sc = stateChannel.ok ? stateChannel.data.filter((r) => r.region && r.region !== "(not set)") : [];
  const stateTot = new Map<string, number>();
  const chTot = new Map<string, number>();
  for (const r of sc) {
    stateTot.set(String(r.region), (stateTot.get(String(r.region)) ?? 0) + Number(r.sessions));
    chTot.set(String(r.sessionDefaultChannelGroup), (chTot.get(String(r.sessionDefaultChannelGroup)) ?? 0) + Number(r.sessions));
  }
  const topStates = [...stateTot.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k]) => k);
  const topChannels = [...chTot.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k]) => k);
  const cell = (st: string, ch: string, m: string) => sc.filter((r) => r.region === st && r.sessionDefaultChannelGroup === ch).reduce((s, r) => s + Number(r[m]), 0);
  // Every state × channel pair (India) with the session → purchase chain.
  const pairs = new Map<string, { name: string; state: string; channel: string; sessions: number; addToCarts: number; checkouts: number; transactions: number }>();
  for (const r of sc) {
    const k = `${r.region}|${r.sessionDefaultChannelGroup}`;
    const e = pairs.get(k) ?? { name: `${r.region} · ${r.sessionDefaultChannelGroup}`, state: String(r.region), channel: String(r.sessionDefaultChannelGroup), sessions: 0, addToCarts: 0, checkouts: 0, transactions: 0 };
    e.sessions += Number(r.sessions);
    e.addToCarts += Number(r.addToCarts);
    e.checkouts += Number(r.checkouts);
    e.transactions += Number(r.transactions);
    pairs.set(k, e);
  }
  const stateSourceRows = [...pairs.values()].map((e) => ({ state: e.state, channel: e.channel, ...goalFields(e) })).sort((a, b) => b.sessions - a.sessions);
  const sourceLocation = {
    states: topStates,
    channels: topChannels,
    sessions: topStates.map((st) => topChannels.map((ch) => cell(st, ch, "sessions"))),
    rows: topStates.map((st) => ({
      state: st,
      ...Object.fromEntries(topChannels.map((ch) => [`s_${ch}`, cell(st, ch, "sessions")])),
      topChannel: [...topChannels].sort((a, b) => cell(st, b, "sessions") - cell(st, a, "sessions"))[0] ?? "—",
      purchases: topChannels.reduce((t, ch) => t + cell(st, ch, "transactions"), 0),
    })),
  };

  const devRows = device.ok ? seg(device.data, "deviceCategory") : [];
  const mob = devRows.find((d) => d.name === "mobile");
  const desk = devRows.find((d) => d.name === "desktop");
  const stateRows = states.ok ? seg(states.data, "region") : [];
  const loyaltyRows = loyalty.ok ? seg(loyalty.data, "newVsReturning").filter((r) => r.name === "new" || r.name === "returning") : [];
  const ret = loyaltyRows.find((r) => r.name === "returning");
  const neu = loyaltyRows.find((r) => r.name === "new");
  const totalSessions = devRows.reduce((s, d) => s + (d.sessions ?? 0), 0);

  const insights = rankInsights([
    stateRows[0] && { tone: "info", text: `Top Indian state: ${stateRows[0].name} with ${(stateRows[0].sessions ?? 0).toLocaleString("en-IN")} sessions${stateRows[1] ? `, then ${stateRows[1].name}` : ""}.`, weight: 8 },
    mob && { tone: "info", text: `${pctText(ratio(mob.sessions, totalSessions))} of sessions are on mobile.`, weight: 6 },
    mob && desk && (desk.conversionRate ?? 0) > 0 && { tone: (mob.conversionRate ?? 0) < (desk.conversionRate ?? 0) * 0.7 ? "warning" : "positive", text: `Mobile converts at ${pctText(mob.conversionRate, 1)} vs desktop ${pctText(desk.conversionRate, 1)}.`, action: (mob.conversionRate ?? 0) < (desk.conversionRate ?? 0) * 0.7 ? "Audit the mobile checkout" : undefined, weight: 9 },
    ret && neu && { tone: "info", text: `Returning visitors convert at ${pctText(ret.conversionRate, 1)} vs ${pctText(neu.conversionRate, 1)} for new visitors.`, weight: 7 },
    !demographicsAvailable && { tone: "info", text: "Age, gender and interests aren't available. Google Signals is off or thresholding hides small groups.", weight: 2 },
  ]);

  return { countryRows, ctry, stateRows, cityRows: cities.ok ? seg(cities.data, "city", (d) => `${d.city}, ${d.region}`) : [], devRows, osRows: os.ok ? seg(os.data, "operatingSystem") : [], browserRows: browser.ok ? seg(browser.data, "browser") : [], screenRows: screen.ok ? seg(screen.data, "screenResolution") : [], loyaltyRows, ageRows, genderRows, interestRows, demographicsAvailable, demoCoverage, languageRows, sourceLocation, stateSourceRows, ageGoal, genderGoal, languageGoal, cohort, insights, notices: notices.list() };
}
