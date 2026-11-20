import type { Metadata } from "next";
import { BarChart } from "@/components/charts/bar-chart";
import { TrendChart } from "@/components/charts/trend-chart";
import { KpiCard, KpiGrid } from "@/components/kpi/kpi-card";
import { Notice, Section, SectionError } from "@/components/section";
import { DataTable, type Column } from "@/components/table/data-table";
import { Tabs } from "@/components/ui/tabs";
import { getViewContext } from "@/lib/data/context";
import type { RawSearchParams } from "@/lib/filters";
import { INTENT_BADGE } from "@/lib/metrics/intent";
import { formatPercent } from "@/lib/metrics/format";
import { getOrganic } from "@/lib/modules/organic";

export const metadata: Metadata = { title: "Organic Search" };
export const dynamic = "force-dynamic";

const QUERY_COLS: Column[] = [
  { key: "query", label: "Query", wide: true },
  { key: "clicks", label: "Clicks", format: "number", bar: true, delta: { prevKey: "clicksPrev" }, glossary: "clicks" },
  { key: "impressions", label: "Impressions", format: "number", delta: { prevKey: "impressionsPrev" }, glossary: "impressions" },
  { key: "ctr", label: "CTR", format: "percent", delta: { prevKey: "ctrPrev" }, glossary: "ctr" },
  { key: "position", label: "Position", format: "position", delta: { prevKey: "positionPrev", polarity: "down_good" }, glossary: "position" },
  { key: "intent", label: "Intent", badge: INTENT_BADGE },
  { key: "brand", label: "Type", badge: { Brand: "neutral", "Non-brand": "info" }, hidden: true },
  { key: "urls", label: "Ranking URL(s)", wide: true },
  { key: "urlCount", label: "# URLs", format: "number", hidden: true },
];

const SEG_COLS = (label: string, key = "name"): Column[] => [
  { key, label },
  { key: "clicks", label: "Clicks", format: "number", bar: true, delta: { prevKey: "clicksPrev" } },
  { key: "impressions", label: "Impressions", format: "number" },
  { key: "ctr", label: "CTR", format: "percent" },
  { key: "position", label: "Position", format: "position" },
];

const segRows = (rows: { keys: Record<string, string>; cur: { clicks: number; impressions: number; ctr: number; position: number } | null; prev: { clicks: number } | null; name?: string }[], dim: string) =>
  rows.filter((r) => r.cur).map((r) => ({ name: r.name ?? r.keys[dim], ...r.cur, clicksPrev: r.prev?.clicks ?? null }));

export default async function OrganicPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const ctx = getViewContext(await searchParams);
  const d = await getOrganic(ctx);
  const hasCmp = Boolean(ctx.period.comparison);
  const pv = <T,>(v: T) => (hasCmp ? v : undefined);

  return (
    <div className="space-y-5">

      <KpiGrid className="2xl:grid-cols-7">
        {d.totals.ok ? (
          <>
            <KpiCard label="Clicks" glossary="clicks" value={d.totals.data.cur.clicks} previous={pv(d.totals.data.prev?.clicks ?? null)} spark={d.daily.ok ? d.daily.data.cur.clicks : undefined} sparkPrev={d.daily.ok ? d.daily.data.prev?.clicks : undefined} />
            <KpiCard label="Impressions" glossary="impressions" value={d.totals.data.cur.impressions} previous={pv(d.totals.data.prev?.impressions ?? null)} spark={d.daily.ok ? d.daily.data.cur.impressions : undefined} />
            <KpiCard label="CTR" glossary="ctr" value={d.totals.data.cur.ctr} previous={pv(d.totals.data.prev?.ctr ?? null)} format="percent" />
            <KpiCard label="Avg. position" glossary="position" value={d.totals.data.cur.position || null} previous={pv(d.totals.data.prev?.position || null)} format="position" polarity="down_good" />
          </>
        ) : (
          <SectionError what="Search Console totals" error={d.totals.error} />
        )}
        {d.brand.ok && <KpiCard label="Brand clicks" glossary="clicks" value={d.brand.data.cur.clicks} previous={pv(d.brand.data.prev?.clicks ?? null)} note={`Terms: ${ctx.settings.brandTerms.join(", ")}`} />}
        {d.nonbrand.ok && <KpiCard label="Non-brand clicks" glossary="clicks" value={d.nonbrand.data.cur.clicks} previous={pv(d.nonbrand.data.prev?.clicks ?? null)} />}
        <KpiCard label="Anonymized clicks" glossary="anonymized" value={d.anonymized} format="percent" polarity="neutral" note={d.anonymizedImpr !== null ? `${formatPercent(d.anonymizedImpr)} of impressions` : undefined} />
      </KpiGrid>

      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="Clicks and impressions" description="Days after the last final date are preliminary (shaded).">
          {d.daily.ok ? (
            <TrendChart
              label="Daily organic clicks and impressions"
              dates={d.daily.data.dates}
              annotations={d.annotations}
              preliminaryFrom={d.preliminaryFrom}
              series={[
                { name: "Clicks", data: d.daily.data.cur.clicks!, compare: d.daily.data.prev?.clicks },
                { name: "Impressions", data: d.daily.data.cur.impressions!, compare: d.daily.data.prev?.impressions, axis: 1 },
              ]}
            />
          ) : (
            <SectionError what="the click trend" error={d.daily.error} />
          )}
        </Section>
        <Section title="Brand vs non-brand clicks" description="Is non-brand growth real? Non-brand = queries without your brand terms.">
          {d.brandDaily.ok && d.nonbrandDaily.ok ? (
            <TrendChart
              label="Brand vs non-brand daily clicks"
              dates={d.dates}
              annotations={d.annotations}
              series={[
                { name: "Non-brand", data: d.nonbrandDaily.data.cur.clicks!, compare: d.nonbrandDaily.data.prev?.clicks, color: "#0F766E" },
                { name: "Brand", data: d.brandDaily.data.cur.clicks!, compare: d.brandDaily.data.prev?.clicks, color: "#E69F00" },
              ]}
            />
          ) : (
            <SectionError what="the brand split" error={!d.brandDaily.ok ? d.brandDaily.error : !d.nonbrandDaily.ok ? d.nonbrandDaily.error : null} />
          )}
        </Section>
      </div>

      <Section title="Search keywords" description="What people typed into Google to find the site, split into brand and non-brand searches. Click a row for its trend and ranking pages.">
        <Tabs labels={[`Non-brand (${d.queryRows.filter((q) => q.brand === "Non-brand").length})`, `Brand (${d.queryRows.filter((q) => q.brand === "Brand").length})`, `All (${d.queryRows.length})`]}>
          <DataTable exportName="keywords-non-brand" drill={{ type: "query", idKey: "query" }} defaultSort={{ key: "clicks", desc: true }} columns={QUERY_COLS} rows={d.queryRows.filter((q) => q.brand === "Non-brand")} />
          <DataTable exportName="keywords-brand" drill={{ type: "query", idKey: "query" }} defaultSort={{ key: "clicks", desc: true }} columns={QUERY_COLS} rows={d.queryRows.filter((q) => q.brand === "Brand")} />
          <DataTable exportName="keywords-all" drill={{ type: "query", idKey: "query" }} defaultSort={{ key: "clicks", desc: true }} columns={QUERY_COLS} rows={d.queryRows} />
        </Tabs>
      </Section>

      <Section title="Keywords & landing pages" description="Which page Google shows for each keyword. One keyword on several pages can split clicks.">
        <DataTable
          exportName="keywords-landing-pages"
          drill={{ type: "query", idKey: "query" }}
          defaultSort={{ key: "clicks", desc: true }}
          columns={[
            { key: "query", label: "Keyword", wide: true },
            { key: "brand", label: "Type", badge: { Brand: "neutral", "Non-brand": "info" } },
            { key: "page", label: "Landing page", wide: true },
            { key: "clicks", label: "Clicks", format: "number", bar: true },
            { key: "impressions", label: "Impressions", format: "number" },
            { key: "ctr", label: "CTR", format: "percent" },
            { key: "position", label: "Position", format: "position" },
          ]}
          rows={d.keywordPageRows}
        />
      </Section>

      <Section
        title="Landing pages: Search Console + GA4"
        info="Joined per landing page. GSC URLs and GA4 landing pages are normalised to a lowercase path: host, protocol, query string, #fragment and trailing slash are removed. GA4 columns count Organic Search sessions only."
        description="Search visibility and what visitors did after the click, side by side."
      >
        <DataTable
          exportName="organic-pages"
          drill={{ type: "page", idKey: "page" }}
          defaultSort={{ key: "clicks", desc: true }}
          columns={[
            { key: "page", label: "Page", wide: true },
            { key: "clicks", label: "Clicks", format: "number", bar: true, delta: { prevKey: "clicksPrev" } },
            { key: "impressions", label: "Impressions", format: "number" },
            { key: "ctr", label: "CTR", format: "percent" },
            { key: "position", label: "Position", format: "position" },
            { key: "sessions", label: "GA4 organic sessions", format: "number" },
            { key: "engagementRate", label: "Engagement rate", format: "percent" },
            { key: "keyEvents", label: "Key events", format: "number" },
            { key: "transactions", label: "Orders", format: "number", hidden: true },
            { key: "revenue", label: "Revenue", format: "currency" },
          ]}
          rows={d.pageRows}
        />
      </Section>

      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="Position distribution" description="Number of queries per ranking band, by week.">
          {d.dist.ok ? (
            <TrendChart
              categorical
              label="Weekly queries per position band"
              dates={d.dist.data.weeks.map((w) => `wk ${w.slice(5)}`)}
              series={d.dist.data.series.map((s, i) => ({ ...s, type: "bar" as const, stack: "pos", color: ["#0F766E", "#56B4E9", "#E69F00", "#CC79A7", "#94A3B8"][i] }))}
            />
          ) : (
            <SectionError what="position distribution" error={d.dist.error} />
          )}
        </Section>
        <Section
          title="CTR curve: this site vs expected"
          info="Expected = an industry CTR-by-position curve, scaled to this site's own CTR level. Points far below it are title/meta rewrite candidates."
          description={`Calibration factor ${d.scale.toFixed(2)}× the benchmark (based on non-brand queries).`}
        >
          <TrendChart
            categorical
            label="Actual vs expected CTR by position"
            dates={d.curve.map((c) => String(c.position))}
            series={[
              { name: "This site", data: d.curve.map((c) => c.actual), format: "percent", type: "bar" },
              { name: "Expected (calibrated)", data: d.curve.map((c) => c.benchmark * d.scale), format: "percent", color: "#E69F00" },
            ]}
          />
        </Section>
      </div>

      <Section title="CTR below expected" description="Top-20 queries with 30+ impressions, sorted by clicks missed against the expected CTR.">
        <DataTable
          exportName="ctr-underperformers"
          drill={{ type: "query", idKey: "query" }}
          defaultSort={{ key: "missedClicks", desc: true }}
          pageSize={10}
          columns={[
            { key: "query", label: "Query", wide: true },
            { key: "position", label: "Position", format: "position" },
            { key: "impressions", label: "Impressions", format: "number" },
            { key: "ctr", label: "Actual CTR", format: "percent" },
            { key: "expectedCtr", label: "Expected CTR", format: "percent", glossary: "expectedCtr" },
            { key: "missedClicks", label: "Clicks missed", format: "number", bar: true },
            { key: "urls", label: "Ranking URL(s)", wide: true },
          ]}
          rows={d.ctrRows}
        />
      </Section>

      <Section title="What changed in search" description={hasCmp ? "Compared with the comparison period." : "Turn on a comparison to track new, lost, rising and falling queries."}>
        <Tabs labels={[`New (${d.newQueries.length})`, `Lost (${d.lostQueries.length})`, `Rising (${d.rising.length})`, `Falling (${d.falling.length})`, `Impressions, no clicks (${d.noClickPages.length})`]}>
          <DataTable exportName="new-queries" pageSize={10} drill={{ type: "query", idKey: "query" }} columns={QUERY_COLS.slice(0, 6)} rows={d.newQueries} defaultSort={{ key: "impressions" }} />
          <DataTable
            exportName="lost-queries"
            pageSize={10}
            drill={{ type: "query", idKey: "query" }}
            columns={[
              { key: "query", label: "Query", wide: true },
              { key: "impressionsPrev", label: "Impressions before", format: "number" },
              { key: "clicksPrev", label: "Clicks before", format: "number" },
              { key: "positionPrev", label: "Position before", format: "position" },
            ]}
            rows={d.lostQueries}
            defaultSort={{ key: "impressionsPrev" }}
          />
          <DataTable exportName="rising-queries" pageSize={10} drill={{ type: "query", idKey: "query" }} columns={[...QUERY_COLS.slice(0, 5), { key: "clickChange", label: "Click change", format: "number" }]} rows={d.rising} defaultSort={{ key: "clickChange" }} />
          <DataTable exportName="falling-queries" pageSize={10} drill={{ type: "query", idKey: "query" }} columns={[...QUERY_COLS.slice(0, 5), { key: "clickChange", label: "Click change", format: "number" }]} rows={d.falling} defaultSort={{ key: "clickChange", desc: false }} />
          <DataTable
            exportName="no-click-pages"
            pageSize={10}
            drill={{ type: "page", idKey: "page" }}
            columns={[
              { key: "page", label: "Page", wide: true },
              { key: "impressions", label: "Impressions", format: "number", bar: true },
              { key: "position", label: "Position", format: "position" },
            ]}
            rows={d.noClickPages}
          />
        </Tabs>
      </Section>

      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="Search appearance" info="Rich results and other SERP features. Compare their CTR with plain results.">
          {d.appearance.ok ? (
            d.appearance.data.length ? (
              <DataTable searchable={false} pageSize={10} exportName="search-appearance" columns={SEG_COLS("Appearance")} rows={segRows(d.appearance.data, "searchAppearance")} />
            ) : (
              <p className="text-body text-muted">No rich-result appearances recorded in this period.</p>
            )
          ) : (
            <SectionError what="search appearance" error={d.appearance.error} />
          )}
        </Section>
        <Section title="Search type" description="Clicks and impressions per Google search surface (all queries).">
          <BarChart
            label="Impressions by search type"
            categories={d.searchTypes.map((s) => s.t)}
            series={[
              { name: "Impressions", data: d.searchTypes.map((s) => s.i) },
              { name: "Clicks", data: d.searchTypes.map((s) => s.c) },
            ]}
          />
        </Section>
        <Section title="Countries">
          {d.countries.ok ? <DataTable pageSize={10} exportName="gsc-countries" columns={SEG_COLS("Country")} rows={segRows(d.countries.data, "country")} /> : <SectionError what="countries" error={d.countries.error} />}
        </Section>
        <Section title="Devices">
          {d.devices.ok ? (
            <DataTable searchable={false} exportName="gsc-devices" drill={{ type: "device", idKey: "name" }} columns={SEG_COLS("Device")} rows={segRows(d.devices.data, "device").map((r) => ({ ...r, name: String(r.name).toLowerCase() }))} />
          ) : (
            <SectionError what="devices" error={d.devices.error} />
          )}
        </Section>
      </div>

      <Notice>
        <strong>About accuracy:</strong> Google hides rare queries for privacy (&ldquo;anonymized queries&rdquo;), so query-level tables add up to less than the property totals. In this period about{" "}
        {d.anonymized !== null ? formatPercent(d.anonymized) : "—"} of clicks are anonymized. Search Console data lags 2–3 days, and the freshest days are preliminary and can still change. Average position is impression-weighted.
      </Notice>
    </div>
  );
}
