import { NextResponse } from "next/server";
import { ga4Realtime } from "@/lib/data/ga4q";
import { toSafeError } from "@/lib/google/errors";
import { safe } from "@/lib/safe";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const q = (dim: string, limit = 20) => ({
  dimensions: [{ name: dim }],
  metrics: [{ name: "activeUsers" }],
  orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
  limit,
});

/** GA4 realtime (last 30 minutes), cached 60 s. Each breakdown fails independently. */
export async function GET() {
  const [total, pages, sources, countries, cities, devices, events, minutes] = await Promise.all([
    safe(() => ga4Realtime({ metrics: [{ name: "activeUsers" }] })),
    safe(() => ga4Realtime(q("unifiedScreenName"))),
    safe(() => ga4Realtime(q("firstUserSource"))),
    safe(() => ga4Realtime(q("country"))),
    safe(() => ga4Realtime(q("city"))),
    safe(() => ga4Realtime(q("deviceCategory"))),
    safe(() => ga4Realtime({ dimensions: [{ name: "eventName" }], metrics: [{ name: "eventCount" }], orderBys: [{ metric: { metricName: "eventCount" }, desc: true }], limit: 25 })),
    safe(() => ga4Realtime({ dimensions: [{ name: "minutesAgo" }], metrics: [{ name: "activeUsers" }], limit: 30 })),
  ]);
  const out = (r: typeof pages) => (r.ok ? { rows: r.data.rows } : { error: toSafeError(r.error).message });
  return NextResponse.json({
    activeUsers: total.ok ? Number(total.data.rows[0]?.activeUsers ?? 0) : null,
    fetchedAt: total.ok ? total.data.fetchedAt : Date.now(),
    pages: out(pages),
    sources: out(sources),
    countries: out(countries),
    cities: out(cities),
    devices: out(devices),
    events: out(events),
    minutes: out(minutes),
    error: total.ok ? null : toSafeError(total.error).message,
  });
}
