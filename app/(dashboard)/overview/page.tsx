import type { Metadata } from "next";
import { BarChart } from "@/components/charts/bar-chart";
import { TrendChart } from "@/components/charts/trend-chart";
import { KpiCard, KpiGrid, type KpiProps } from "@/components/kpi/kpi-card";
import { HealthScoreCard } from "@/components/overview/health-score";
import { MoversList } from "@/components/overview/lists";
import { Notice, Section, SectionError } from "@/components/section";
import { DataTable } from "@/components/table/data-table";
import { Card } from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";
import { getViewContext } from "@/lib/data/context";
import type { RawSearchParams } from "@/lib/filters";
import { ratio } from "@/lib/metrics/delta";
import { getOverview } from "@/lib/modules/overview";

export const metadata: Metadata = { title: "Executive Overview" };
export const dynamic = "force-dynamic";

const divide = (a: number[], b: number[]) => a.map((v, i) => (b[i] ? v / b[i]! : 0));

export default async function OverviewPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const sp = await searchParams;
  const ctx = getViewContext(sp);
  const d = await getOverview(ctx);
  const hasCmp = Boolean(ctx.period.comparison);

  const kpis: (KpiProps & { key: string })[] = [];
  const monthLabel = new Intl.DateTimeFormat("en-IN", { month: "short" }).format(new Date(`${ctx.today}T00:00:00Z`));
  const target = (metric: "sessions" | "keyEvents" | "revenue" | "organicClicks") => {
    if (!d.targets.ok) return null;
    const t = d.targets.data.targets[metric];
    if (!t) return null;
    return { value: t, projected: (d.targets.data.projected as Record<string, number | null>)[metric] ?? null, monthLabel };
  };

  if (d.ga4t.ok && d.ga4d.ok) {
    const c = d.ga4t.data.cur;
    const p = d.ga4t.data.prev;
    const s = d.ga4d.data;
    const ecommerce = (c.transactions ?? 0) > 0 || (p?.transactions ?? 0) > 0;
    const conv = (x: Record<string, number> | null) => (x ? ratio(ecommerce ? x.transactions : x.keyEvents, x.sessions) : null);
    const pv = (v: number | null | undefined) => (hasCmp ? (v ?? null) : undefined);
    kpis.push(
      { key: "users", label: "Users", glossary: "users", value: c.totalUsers!, previous: pv(p?.totalUsers), spark: s.cur.totalUsers, sparkPrev: s.prev?.totalUsers },
      { key: "sessions", label: "Sessions", glossary: "sessions", value: c.sessions!, previous: pv(p?.sessions), spark: s.cur.sessions, sparkPrev: s.prev?.sessions, target: target("sessions") },
      { key: "engaged", label: "Engaged sessions", glossary: "engagedSessions", value: c.engagedSessions!, previous: pv(p?.engagedSessions), spark: s.cur.engagedSessions, sparkPrev: s.prev?.engagedSessions },
      { key: "er", label: "Engagement rate", glossary: "engagementRate", value: ratio(c.engagedSessions, c.sessions), previous: hasCmp ? ratio(p?.engagedSessions, p?.sessions) : undefined, format: "percent", spark: divide(s.cur.engagedSessions!, s.cur.sessions!) },
      { key: "ke", label: "Key events", glossary: "keyEvents", value: c.keyEvents!, previous: pv(p?.keyEvents), spark: s.cur.keyEvents, sparkPrev: s.prev?.keyEvents, target: target("keyEvents") },
      { key: "cr", label: ecommerce ? "Purchase conv. rate" : "Key events / session", glossary: "conversionRate", value: conv(c), previous: hasCmp ? conv(p) : undefined, format: "percent", spark: divide(s.cur[ecommerce ? "transactions" : "keyEvents"]!, s.cur.sessions!) },
    );
    if (ecommerce)
      kpis.push(
        { key: "rev", label: "Revenue", glossary: "revenue", value: c.purchaseRevenue!, previous: pv(p?.purchaseRevenue), format: "currencyCompact", spark: s.cur.purchaseRevenue, sparkPrev: s.prev?.purchaseRevenue, target: target("revenue") },
        { key: "tx", label: "Transactions", glossary: "transactions", value: c.transactions!, previous: pv(p?.transactions), spark: s.cur.transactions, sparkPrev: s.prev?.transactions },
      );
  }
  if (d.gsct.ok && d.gscd.ok) {
    const c = d.gsct.data.cur;
    const p = d.gsct.data.prev;
    const s = d.gscd.data;
    kpis.push(
      { key: "clicks", label: "Organic clicks", glossary: "clicks", value: c.clicks, previous: hasCmp ? (p?.clicks ?? null) : undefined, spark: s.cur.clicks, sparkPrev: s.prev?.clicks, target: target("organicClicks") },
      { key: "impr", label: "Impressions", glossary: "impressions", value: c.impressions, previous: hasCmp ? (p?.impressions ?? null) : undefined, spark: s.cur.impressions, sparkPrev: s.prev?.impressions },
      { key: "ctr", label: "Average CTR", glossary: "ctr", value: c.ctr, previous: hasCmp ? (p?.ctr ?? null) : undefined, format: "percent", spark: s.cur.ctr },
      { key: "pos", label: "Average position", glossary: "position", value: c.position || null, previous: hasCmp ? p?.position || null : undefined, format: "position", polarity: "down_good", spark: s.cur.position!.map((v) => (v ? -v : 0)) },
    );
  }

  const channelRows = d.channels.ok
    ? d.channels.data
        .map((r) => ({
          channel: r.dims.sessionDefaultChannelGroup,
          sessions: r.cur.sessions,
          sessionsPrev: r.prev?.sessions ?? null,
          keyEvents: r.cur.keyEvents,
          revenue: r.cur.purchaseRevenue,
          revenuePrev: r.prev?.purchaseRevenue ?? null,
          transactions: r.cur.transactions,
          revShare: 0,
        }))
        .sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0))
    : [];
  const totalRev = channelRows.reduce((s, r) => s + (r.revenue ?? 0), 0);
  channelRows.forEach((r) => (r.revShare = totalRev ? (r.revenue ?? 0) / totalRev : 0));

  return (
    <div className="space-y-5">

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
        <KpiGrid className="2xl:grid-cols-4">
          {kpis.map(({ key, ...k }) => (
            <KpiCard key={key} {...k} />
          ))}
          {!d.ga4t.ok && <SectionError what="GA4 KPIs" error={d.ga4t.error} />}
          {!d.gsct.ok && <SectionError what="Search Console KPIs" error={d.gsct.error} />}
        </KpiGrid>
        <div className="space-y-3">
          {d.health && <HealthScoreCard {...d.health} />}
          <Card className="p-5">
            <p className="text-body leading-relaxed text-ink">{d.summary}</p>
          </Card>
        </div>
      </div>

      <Section title="Daily trend" description={hasCmp ? "One metric at a time. The dashed line is the comparison period." : "One metric at a time."}>
        {d.ga4d.ok && d.gscd.ok ? (
          <Tabs labels={["Sessions", "Organic clicks", "Key events"]}>
            {(
              [
                ["Sessions", d.ga4d.data.dates, d.ga4d.data.cur.sessions!, d.ga4d.data.prev?.sessions],
                ["Organic clicks", d.gscd.data.dates, d.gscd.data.cur.clicks!, d.gscd.data.prev?.clicks],
                ["Key events", d.ga4d.data.dates, d.ga4d.data.cur.keyEvents!, d.ga4d.data.prev?.keyEvents],
              ] as const
            ).map(([name, dates, data, compare]) => (
              <TrendChart key={name} label={`${name} over time`} dates={[...dates]} height={260} preliminaryFrom={d.preliminaryFrom} series={[{ name, data: [...data], compare: compare ? [...compare] : undefined, area: true }]} />
            ))}
          </Tabs>
        ) : (
          <SectionError what="the trend chart" error={!d.ga4d.ok ? d.ga4d.error : !d.gscd.ok ? d.gscd.error : null} />
        )}
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="What changed: biggest gains" description={hasCmp ? "Across channels, landing pages, queries and countries." : undefined}>
          {hasCmp ? <MoversList items={d.moverLists.up} direction="up" /> : <p className="text-body text-muted">Turn on a comparison to see movers.</p>}
        </Section>
        <Section title="What changed: biggest declines">
          {hasCmp ? <MoversList items={d.moverLists.down} direction="down" /> : <p className="text-body text-muted">Turn on a comparison to see movers.</p>}
        </Section>
      </div>

      <div>
        <Section title="Where results came from" description="Revenue and key events by channel (session attribution).">
          {d.channels.ok ? (
            <div className="space-y-4">
              <BarChart
                label="Revenue by channel"
                format="currencyCompact"
                categories={channelRows.slice(0, 8).map((r) => r.channel!)}
                series={[{ name: "Revenue", data: channelRows.slice(0, 8).map((r) => r.revenue ?? 0) }]}
              />
              <DataTable
                searchable={false}
                pageSize={10}
                exportName="channel-contribution"
                drill={{ type: "channel", idKey: "channel" }}
                columns={[
                  { key: "channel", label: "Channel" },
                  { key: "sessions", label: "Sessions", format: "number", delta: { prevKey: "sessionsPrev" } },
                  { key: "keyEvents", label: "Key events", format: "number" },
                  { key: "transactions", label: "Orders", format: "number" },
                  { key: "revenue", label: "Revenue", format: "currency", delta: { prevKey: "revenuePrev" } },
                  { key: "revShare", label: "Share of revenue", format: "percent", bar: true },
                ]}
                rows={channelRows}
              />
            </div>
          ) : (
            <SectionError what="channel contribution" error={d.channels.error} />
          )}
        </Section>
      </div>

      {d.notices.length > 0 && (
        <div className="space-y-2">
          {d.notices.map((n) => (
            <Notice key={n} tone="warning">
              {n}
            </Notice>
          ))}
        </div>
      )}
    </div>
  );
}
