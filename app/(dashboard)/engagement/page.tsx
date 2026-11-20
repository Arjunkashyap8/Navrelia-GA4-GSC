import type { Metadata } from "next";
import { TrendChart } from "@/components/charts/trend-chart";
import { KpiCard, KpiGrid } from "@/components/kpi/kpi-card";
import { Notice, Section, SectionError } from "@/components/section";
import { DataTable, type Column } from "@/components/table/data-table";
import { goalColumns } from "@/components/table/goal-columns";
import { getViewContext } from "@/lib/data/context";
import type { RawSearchParams } from "@/lib/filters";
import { ratio } from "@/lib/metrics/delta";
import { getEngagement } from "@/lib/modules/engagement";

export const metadata: Metadata = { title: "Engagement & Behaviour" };
export const dynamic = "force-dynamic";

const simpleCols = (label: string, key: string) => [
  { key, label, wide: true },
  { key: "eventCount", label: "Count", format: "number" as const, bar: true },
  { key: "totalUsers", label: "Users", format: "number" as const },
];

/** Entry page → engagement → the shared session → purchase chain. */
const ENTRY_COLS: Column[] = (() => {
  const [page, sessions, ...chain] = goalColumns({ key: "page", label: "Entry page", wide: true });
  return [
    page!,
    sessions!,
    { key: "engagementRate", label: "Engagement", format: "percent" },
    { key: "engagementTime", label: "Avg. time", format: "duration" },
    { key: "pagesPerSession", label: "Pages / session", format: "decimal", hidden: true },
    { key: "keyEvents", label: "Key events", format: "number", hidden: true },
    ...chain,
  ];
})();

export default async function EngagementPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const ctx = getViewContext(await searchParams);
  const d = await getEngagement(ctx);
  const hasCmp = Boolean(ctx.period.comparison);
  const t = d.totals.ok ? d.totals.data : null;
  const daily = d.daily.ok ? d.daily.data : null;
  const div = (a?: number[], b?: number[]) => (a && b ? a.map((v, i) => (b[i] ? v / b[i]! : 0)) : undefined);

  return (
    <div className="space-y-5">
      <KpiGrid className="xl:grid-cols-4 2xl:grid-cols-4">
        {t ? (
          <>
            <KpiCard label="Engagement rate" glossary="engagementRate" value={ratio(t.cur.engagedSessions, t.cur.sessions)} previous={hasCmp ? ratio(t.prev?.engagedSessions, t.prev?.sessions) : undefined} format="percent" spark={div(daily?.cur.engagedSessions, daily?.cur.sessions)} />
            <KpiCard label="Bounce rate" glossary="bounceRate" value={1 - (ratio(t.cur.engagedSessions, t.cur.sessions) ?? 0)} previous={hasCmp && t.prev ? 1 - (ratio(t.prev.engagedSessions, t.prev.sessions) ?? 0) : undefined} format="percent" polarity="down_good" />
            <KpiCard label="Avg. engagement time" glossary="engagementTime" value={ratio(t.cur.userEngagementDuration, t.cur.sessions)} previous={hasCmp ? ratio(t.prev?.userEngagementDuration, t.prev?.sessions) : undefined} format="duration" spark={div(daily?.cur.userEngagementDuration, daily?.cur.sessions)} />
            <KpiCard label="Pages / session" glossary="pagesPerSession" value={ratio(t.cur.screenPageViews, t.cur.sessions)} previous={hasCmp ? ratio(t.prev?.screenPageViews, t.prev?.sessions) : undefined} format="decimal" />
          </>
        ) : (
          <SectionError what="engagement totals" error={!d.totals.ok ? d.totals.error : null} />
        )}
      </KpiGrid>

      {daily && (
        <Section title="Engagement rate over time">
          <TrendChart label="Daily engagement rate" dates={daily.dates} series={[{ name: "Engagement rate", data: div(daily.cur.engagedSessions, daily.cur.sessions)!, compare: div(daily.prev?.engagedSessions, daily.prev?.sessions), format: "percent" }]} />
        </Section>
      )}

      <Section
        title="Entry pages and what happens next"
        description="Where sessions start, how engaged visitors are, then the chain to the end goal: add to cart → checkout → purchase."
        info="Entry page = GA4 landing page. Key events are counted in sessions that started on the page."
      >
        {d.entryOk ? (
          <DataTable
            exportName="entry-pages"
            drill={{ type: "page", idKey: "page" }}
            defaultSort={{ key: "sessions" }}
            columns={ENTRY_COLS}
            rows={d.entryRows}
          />
        ) : (
          <p className="text-body text-muted">Entry pages couldn&apos;t be loaded.</p>
        )}
        <p className="mt-3 text-caption text-muted">
          Exit pages aren&apos;t shown: GA4&apos;s reporting API doesn&apos;t provide exits. Use the Ecommerce Journey to see the step where shoppers stopped.
        </p>
      </Section>

      <Section title="Events" description="Every event in the property this period.">
        {d.events.ok ? (
          <DataTable
            exportName="events"
            columns={[
              { key: "event", label: "Event name" },
              { key: "count", label: "Count", format: "number", bar: true, delta: { prevKey: "countPrev" }, glossary: "eventCount" },
              { key: "users", label: "Users", format: "number" },
              { key: "perUser", label: "Per user", format: "decimal" },
            ]}
            rows={d.eventRows}
          />
        ) : (
          <SectionError what="events" error={d.events.error} />
        )}
      </Section>

      {(d.downloads || d.outbound) && (
        <div className="grid gap-4 xl:grid-cols-2">
          {d.downloads && (
            <Section title="File downloads">
              {d.downloads.ok ? <DataTable pageSize={10} exportName="downloads" columns={simpleCols("File", "fileName")} rows={d.downloads.data} /> : <SectionError what="downloads" error={d.downloads.error} />}
            </Section>
          )}
          {d.outbound && (
            <Section title="Outbound clicks">
              {d.outbound.ok ? <DataTable pageSize={10} exportName="outbound" columns={simpleCols("Link", "linkUrl")} rows={d.outbound.data} /> : <SectionError what="outbound clicks" error={d.outbound.error} />}
            </Section>
          )}
        </div>
      )}
      {d.notices.map((n) => (
        <Notice key={n} tone="warning">
          {n}
        </Notice>
      ))}
    </div>
  );
}
