import { NextResponse } from "next/server";
import { getViewContext } from "@/lib/data/context";
import { ga4Range } from "@/lib/data/ga4q";
import { safe } from "@/lib/safe";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Options for the filter panel, with session counts for the selected period. Each list ignores its
 * own filter (so you can switch value) but respects the others, e.g. "Paid Social (632)".
 */
export async function GET(req: Request) {
  const ctx = getViewContext(Object.fromEntries(new URL(req.url).searchParams.entries()));
  const range = ctx.period.range;
  const india = { filter: { fieldName: "countryId", stringFilter: { matchType: "EXACT", value: "IN" } } };
  const [channels, states, countries] = await Promise.all([
    safe(() => ga4Range(ctx, { dimensions: ["sessionDefaultChannelGroup"], metrics: ["sessions"], ignore: ["channel"], orderBy: { metric: "sessions" } }, range)),
    safe(() => ga4Range(ctx, { dimensions: ["region"], metrics: ["sessions"], ignore: ["state", "country"], extraFilter: india, orderBy: { metric: "sessions" }, limit: 60 }, range)),
    safe(() => ga4Range(ctx, { dimensions: ["countryId", "country"], metrics: ["sessions"], ignore: ["country"], orderBy: { metric: "sessions" }, limit: 60 }, range)),
  ]);
  return NextResponse.json({
    channels: channels.ok ? channels.data.map((r) => ({ value: String(r.sessionDefaultChannelGroup), count: Number(r.sessions) })) : [],
    states: states.ok ? states.data.filter((r) => r.region && r.region !== "(not set)").map((r) => ({ value: String(r.region), count: Number(r.sessions) })) : [],
    countries: countries.ok ? countries.data.filter((r) => /^[A-Z]{2}$/.test(String(r.countryId))).map((r) => ({ value: String(r.countryId), label: String(r.country), count: Number(r.sessions) })) : [],
  });
}
