import type { Metadata } from "next";
import { TrendChart } from "@/components/charts/trend-chart";
import { KpiCard, KpiGrid } from "@/components/kpi/kpi-card";
import { Notice, Section, SectionError } from "@/components/section";
import { ParamToggle } from "@/components/shell/param-toggle";
import { DataTable, type Column } from "@/components/table/data-table";
import { goalColumns } from "@/components/table/goal-columns";
import { Tabs } from "@/components/ui/tabs";
import { Donut } from "@/components/viz/donut";
import { RankedBars } from "@/components/viz/ranked-bars";
import { getViewContext } from "@/lib/data/context";
import { toParamReader, type RawSearchParams } from "@/lib/filters";
import { ratio } from "@/lib/metrics/delta";
import { getAcquisition } from "@/lib/modules/acquisition";

export const metadata: Metadata = { title: "Sessions & Sources" };
export const dynamic = "force-dynamic";

const cols = (label: string): Column[] =>
  goalColumns(
    { key: "name", label, wide: true },
    {
      compare: true,
      extra: [
        { key: "users", label: "Users", format: "number", glossary: "users", hidden: true },
        { key: "engagementRate", label: "Engagement rate", format: "percent", glossary: "engagementRate", hidden: true },
        { key: "revenue", label: "Revenue", format: "currency", delta: { prevKey: "revenuePrev" }, glossary: "revenue", hidden: true },
      ],
    },
  );

export default async function SessionsSourcesPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const sp = await searchParams;
  const ctx = getViewContext(sp);
  const attribution = toParamReader(sp).get("attr") === "first" ? "first" : "session";
  const d = await getAcquisition(ctx, attribution);
  const hasCmp = Boolean(ctx.period.comparison);
  const t = d.totals.ok ? d.totals.data : null;
  const pv = (v: number | null | undefined) => (hasCmp ? (v ?? null) : undefined);
  const s = d.daily.ok ? d.daily.data : null;

  return (
    <div className="space-y-5">
      {/* 1. Sessions */}
      {t ? (
        <KpiGrid>
          <KpiCard label="Sessions" glossary="sessions" value={t.cur.sessions!} previous={pv(t.prev?.sessions)} spark={s?.cur.sessions} sparkPrev={s?.prev?.sessions} />
          <KpiCard label="Users" glossary="users" value={t.cur.totalUsers!} previous={pv(t.prev?.totalUsers)} spark={s?.cur.totalUsers} />
          <KpiCard label="New users" glossary="newUsers" value={t.cur.newUsers!} previous={pv(t.prev?.newUsers)} />
          <KpiCard label="Engagement rate" glossary="engagementRate" value={ratio(t.cur.engagedSessions, t.cur.sessions)} previous={hasCmp ? ratio(t.prev?.engagedSessions, t.prev?.sessions) : undefined} format="percent" />
          <KpiCard label="Add to carts" value={t.cur.addToCarts!} previous={pv(t.prev?.addToCarts)} spark={s?.cur.addToCarts} />
          <KpiCard label="Purchases" glossary="transactions" value={t.cur.transactions!} previous={pv(t.prev?.transactions)} spark={s?.cur.transactions} />
        </KpiGrid>
      ) : (
        <SectionError what="session totals" error={d.totals.ok ? null : d.totals.error} />
      )}
      {s && (
        <Section title="Sessions over time" description={hasCmp ? "Dashed line = comparison period." : undefined}>
          <TrendChart
            label="Sessions and purchases over time"
            dates={s.dates}
            annotations={d.annotations}
            series={[
              { name: "Sessions", data: s.cur.sessions!, compare: s.prev?.sessions },
              { name: "Purchases", data: s.cur.transactions!, axis: 1, type: "bar" },
            ]}
          />
        </Section>
      )}

      {/* 2. New vs returning */}
      <Section title="New vs. returning: session → purchase" description="Share of sessions, then whether returning visitors add to cart and buy more often.">
        <div className="grid items-center gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
          <Donut label="New vs returning sessions" unit="sessions" items={d.visitorRows.map((r) => ({ label: r.name, value: r.sessions ?? 0 }))} />
          <DataTable searchable={false} exportName="new-vs-returning" defaultSort={{ key: "sessions" }} columns={goalColumns({ key: "name", label: "Visitor type" }, { compare: true })} rows={d.visitorRows} />
        </div>
      </Section>

      {/* 3. Sources */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Section title="Sources" description="Sessions by channel">
          <RankedBars items={d.channelRows.map((c) => ({ label: c.name, value: c.sessions ?? 0, drill: attribution === "session" ? { type: "channel" as const, id: c.name } : undefined }))} limit={10} multicolor />
        </Section>
        <Section title="Channel mix over time" description="Sessions by channel (top 6).">
          <TrendChart label="Sessions by channel over time, stacked" dates={d.dates} annotations={d.annotations} series={d.mixSeries.map((x) => ({ ...x, stack: "mix", area: true }))} />
        </Section>
      </div>

      {/* 4. Key events by source: add to cart → purchase */}
      <Section
        title="Key events by source: add to cart → purchase"
        description="For each channel: how many sessions add to cart, start checkout and buy."
        actions={<ParamToggle param="attr" label="Attribution" options={[{ id: "session", label: "Session channel" }, { id: "first", label: "First-user channel" }]} />}
        info="Session channel credits the channel that started each visit. First-user channel credits the channel that first acquired the user."
      >
        {d.channels.ok ? (
          <DataTable
            searchable={false}
            exportName="key-events-by-source"
            drill={attribution === "session" ? { type: "channel", idKey: "name" } : undefined}
            defaultSort={{ key: "sessions" }}
            columns={goalColumns({ key: "name", label: "Channel" }, { compare: true })}
            rows={d.channelRows}
          />
        ) : (
          <SectionError what="channels" error={d.channels.error} />
        )}
      </Section>

      <Section title="Source / medium, campaigns and referrals">
        <Tabs labels={["Source / medium", `Campaigns (${d.campaignRows.length})`, `Referral sites (${d.referralRows.length})`]}>
          <DataTable exportName="source-medium" columns={cols("Source / medium")} rows={d.smRows} />
          {d.campaigns.ok ? (
            <DataTable exportName="campaigns" emptyText="No tagged campaigns in this period." columns={[...cols("Campaign"), { key: "sourceMedium", label: "Source / medium" }, { key: "content", label: "UTM content", hidden: true }, { key: "term", label: "UTM term", hidden: true }]} rows={d.campaignRows} />
          ) : (
            <SectionError what="campaigns" error={d.campaigns.error} />
          )}
          <DataTable
            exportName="referrals"
            columns={goalColumns(
              { key: "source", label: "Referring site", wide: true },
              {
                compare: true,
                extra: [
                  { key: "flag", label: "Flag", badge: { OK: "neutral", "Self-referral": "warning", "Payment gateway": "negative", "Likely spam": "negative" } },
                  { key: "engagementRate", label: "Engagement rate", format: "percent", hidden: true },
                ],
              },
            )}
            rows={d.referralRows}
          />
        </Tabs>
      </Section>
      {d.notices.map((n) => (
        <Notice key={n} tone="warning">
          {n}
        </Notice>
      ))}
    </div>
  );
}
