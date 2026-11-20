import type { Metadata } from "next";
import { BarChart } from "@/components/charts/bar-chart";
import { KpiCard, KpiGrid } from "@/components/kpi/kpi-card";
import { Notice, Section, SectionError } from "@/components/section";
import { DataTable } from "@/components/table/data-table";
import { Tabs } from "@/components/ui/tabs";
import { getViewContext } from "@/lib/data/context";
import type { RawSearchParams } from "@/lib/filters";
import { getSearchValue } from "@/lib/modules/intel/search-value";
import { safe } from "@/lib/safe";

export const metadata: Metadata = { title: "Search Value & Topics" };
export const dynamic = "force-dynamic";

export default async function SearchValuePage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const ctx = getViewContext(await searchParams);
  const r = await safe(() => getSearchValue(ctx));
  if (!r.ok) return <SectionError what="search value" error={r.error} />;
  const d = r.data;
  const valued = d.queryRows.filter((q) => q.revenue > 0).length;
  const named = d.topicRows.filter((t) => t.topic !== "Other" && t.topic !== "Brand");

  return (
    <div className="space-y-5">
      <KpiGrid className="xl:grid-cols-4 2xl:grid-cols-4">
        <KpiCard label="Organic revenue traced to queries" value={d.attribution.attributed} format="currencyCompact" note={`${valued} queries with revenue`} />
        <KpiCard label="Revenue via anonymized queries" value={d.attribution.anonymizedRevenue} format="currencyCompact" polarity="neutral" />
        <KpiCard label="Organic ₹ per click (site)" value={d.siteRpc} format="currency" />
        <KpiCard label="Topics found" value={named.length} note={`${named.filter((t) => t.gap).length} content gaps`} />
      </KpiGrid>

      <Section
        title="Keyword value"
        description="Each organic landing page's GA4 revenue is split across the Search Console queries that sent its clicks. Upside = extra clicks and ₹ per month if the query ranked #3."
        info="Revenue per query = page organic revenue × (query clicks ÷ visible clicks to the page) × (visible ÷ total page clicks). The anonymized remainder is not assigned. ₹ upside uses the query's own ₹/click, or the site's organic ₹/click when it has no sales yet."
      >
        <DataTable
          exportName="keyword-value"
          drill={{ type: "query", idKey: "query" }}
          defaultSort={{ key: "revenue" }}
          columns={[
            { key: "query", label: "Query", wide: true },
            { key: "brand", label: "Type", badge: { Brand: "neutral", "Non-brand": "info" } },
            { key: "clicks", label: "Clicks", format: "number", delta: { prevKey: "clicksPrev" } },
            { key: "impressions", label: "Impressions", format: "number" },
            { key: "position", label: "Position", format: "position" },
            { key: "revenue", label: "Attributed revenue", format: "currency", bar: true },
            { key: "conversions", label: "Orders", format: "decimal", hidden: true },
            { key: "revenuePerClick", label: "₹ / click", format: "currency" },
            { key: "upsideClicks", label: "Upside clicks/mo", format: "number" },
            { key: "upsideInr", label: "Upside ₹/mo", format: "currency" },
            { key: "topPage", label: "Main landing page", wide: true, hidden: true },
          ]}
          rows={d.queryRows}
        />
      </Section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Section title="Topics by search demand" description="Impressions per topic (data-driven clusters of related queries).">
          <BarChart
            label="Impressions by topic"
            categories={named.slice(0, 12).map((t) => t.topic)}
            series={[
              { name: "Impressions", data: named.slice(0, 12).map((t) => t.impressions) },
              { name: "Clicks", data: named.slice(0, 12).map((t) => t.clicks) },
            ]}
          />
        </Section>
        <Section
          title="Topic clusters"
          description="Share of voice = clicks ÷ clicks you'd get ranking #1 for every query in the topic."
          info="Queries are grouped by their strongest shared 1–3 word phrase (after removing filler words like buy, price, best, kg). Brand queries form their own topic."
        >
          <DataTable
            exportName="topics"
            pageSize={12}
            defaultSort={{ key: "impressions" }}
            columns={[
              { key: "topic", label: "Topic" },
              { key: "queries", label: "Queries", format: "number" },
              { key: "impressions", label: "Impressions", format: "number", bar: true },
              { key: "clicks", label: "Clicks", format: "number" },
              { key: "position", label: "Avg. position", format: "position" },
              { key: "shareOfVoice", label: "Share of voice", format: "percent" },
              { key: "revenue", label: "Revenue", format: "currency" },
              { key: "upsideMonth", label: "Upside clicks/mo", format: "number" },
              { key: "bestPage", label: "Best page", wide: true },
              { key: "topQueries", label: "Example queries", wide: true, hidden: true },
            ]}
            rows={d.topicRows}
          />
        </Section>
      </div>

      <Section title="Content gaps" description="Topics with 100+ impressions where the site averages below position 15 and no page ranks in the top 10.">
        <DataTable
          exportName="content-gaps"
          emptyText="No content gaps: every topic with demand has a page ranking in the top 10."
          columns={[
            { key: "topic", label: "Topic" },
            { key: "impressionsMonth", label: "Impressions / month", format: "number", bar: true },
            { key: "position", label: "Avg. position", format: "position" },
            { key: "bestPage", label: "Closest page today", wide: true },
            { key: "bestPagePosition", label: "Its position", format: "position" },
            { key: "topQueries", label: "Queries to target", wide: true },
          ]}
          rows={d.topicRows.filter((t) => t.gap)}
        />
      </Section>

      <Section
        title="Product demand vs sales"
        description="Search Console demand for each product (queries matched to product names) next to GA4 views, carts and revenue."
        info="A query counts toward a product when it shares two of the product's distinctive words, or a word only that product has (e.g. “upma”). Shared queries are split evenly."
      >
        {d.itemsOk ? (
          <Tabs labels={["Table", "Demand vs revenue share"]}>
            <DataTable
              exportName="product-demand"
              defaultSort={{ key: "searchImpressions" }}
              columns={[
                { key: "product", label: "Product", wide: true },
                { key: "signal", label: "Signal", badge: { "Demand > sales": "warning", "Sells beyond search": "info", Balanced: "neutral" } },
                { key: "searchImpressions", label: "Search impressions", format: "number", bar: true },
                { key: "searchTrend", label: "Demand trend", format: "percent" },
                { key: "views", label: "Product views", format: "number" },
                { key: "viewToCart", label: "View → cart", format: "percent" },
                { key: "cartToPurchase", label: "Cart → purchase", format: "percent" },
                { key: "revenue", label: "Revenue", format: "currency" },
                { key: "demandShare", label: "Demand share", format: "percent", hidden: true },
                { key: "revenueShare", label: "Revenue share", format: "percent", hidden: true },
                { key: "topQueries", label: "Matched queries", wide: true, hidden: true },
              ]}
              rows={d.productRows}
            />
            <BarChart
              label="Share of search demand vs share of revenue by product"
              categories={d.productRows.slice(0, 10).map((p) => p.product)}
              format="percent"
              series={[
                { name: "Search demand share", data: d.productRows.slice(0, 10).map((p) => p.demandShare) },
                { name: "Revenue share", data: d.productRows.slice(0, 10).map((p) => p.revenueShare), color: "#E69F00" },
              ]}
            />
          </Tabs>
        ) : (
          <Notice tone="warning">GA4 item data isn&apos;t available for this period.</Notice>
        )}
      </Section>
      {d.notices.map((n) => (
        <Notice key={n} tone="warning">
          {n}
        </Notice>
      ))}
    </div>
  );
}
